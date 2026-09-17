/**
 * Pipeline tests: loading, `$ref` resolution and operation normalisation.
 *
 * These run without touching the filesystem beyond reading the fixtures, which is the
 * point of exporting each pipeline step separately — a failure here names the step that
 * broke instead of surfacing as a strange line in a generated file.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  buildOperations,
  collectReferencedNames,
  dereferenceSchema,
  deriveOperationId,
  groupOperations,
  loadOpenAPIDocument,
  mergeObjectShape,
  OpenAPIError,
  parseOpenAPIDocument,
  readOpenAPIDocument,
  resolveLocalReference,
  stripPathPrefix,
  tagDescriptionsOf,
  toExpressPath,
  type OpenAPIDocument
} from "../src/index.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

const petstorePath = join(FIXTURES, "petstore.json");
const petstore31Path = join(FIXTURES, "petstore31.yaml");

const petstore = (): OpenAPIDocument => readOpenAPIDocument(petstorePath);

describe("loadOpenAPIDocument", () => {
  it("parses a JSON document from disk", () => {
    const doc = petstore();
    expect(doc.openapi).toBe("3.0.3");
    expect(Object.keys(doc.paths ?? {})).toContain("/pet");
  });

  it("parses an OpenAPI 3.1 YAML document", () => {
    const doc = readOpenAPIDocument(petstore31Path);
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths ?? {})).toEqual(["/ping", "/ping/{name}"]);
    expect(doc.components?.schemas?.PingResult).toBeDefined();
  });

  it("accepts an already-parsed document", () => {
    const doc = loadOpenAPIDocument({ openapi: "3.0.0", paths: {} });
    expect(doc.paths).toEqual({});
  });

  it("names the source when the document is not an OpenAPI 3 document", () => {
    expect(() => parseOpenAPIDocument('{"swagger":"2.0","paths":{}}', "old.json")).toThrow(
      /Swagger 2\.0/
    );
    expect(() => parseOpenAPIDocument('{"openapi":"4.0.0","paths":{}}', "future.json")).toThrow(
      /only 3\.0 and 3\.1/
    );
    expect(() => parseOpenAPIDocument('{"openapi":"3.0.0"}', "nopaths.json")).toThrow(/no "paths"/);
  });

  it("reports unreadable and unparsable input as OpenAPIError", () => {
    expect(() => readOpenAPIDocument(join(FIXTURES, "missing.json"))).toThrow(OpenAPIError);
    expect(() => parseOpenAPIDocument("{ not json", "broken.json")).toThrow(OpenAPIError);
    expect(() => parseOpenAPIDocument("   ", "empty.json")).toThrow(/is empty/);
  });
});

describe("resolveLocalReference", () => {
  it("resolves a component schema and reports its name", () => {
    const resolved = resolveLocalReference(petstore(), "#/components/schemas/Pet");
    expect(resolved.name).toBe("Pet");
    expect(resolved.pointer).toBe("components.schemas.Pet");
  });

  it("refuses remote references instead of reaching the network", () => {
    expect(() => resolveLocalReference(petstore(), "https://example.com/pet.json#/Pet")).toThrow(
      /only local references/
    );
  });

  it("names the segment that does not exist", () => {
    expect(() => resolveLocalReference(petstore(), "#/components/schemas/Nope")).toThrow(/Nope/);
  });
});

describe("dereferenceSchema", () => {
  it("returns the component name for a component reference", () => {
    const result = dereferenceSchema(petstore(), { $ref: "#/components/schemas/Pet" });
    expect(result.refName).toBe("Pet");
    expect(result.cycle).toBe(false);
    expect(result.schema.required).toEqual(["id", "name"]);
  });

  it("terminates on a self-referencing schema", () => {
    const doc = petstore();
    const pet = doc.components?.schemas?.Pet as { properties?: Record<string, unknown> };
    expect(pet.properties?.children).toBeDefined();

    const result = dereferenceSchema(doc, { $ref: "#/components/schemas/Pet" });
    expect(result.cycle).toBe(false);
    expect(result.refName).toBe("Pet");
  });

  it("reports a cycle between two schemas instead of looping forever", () => {
    const doc: OpenAPIDocument = {
      openapi: "3.0.3",
      paths: {},
      components: {
        schemas: {
          A: { $ref: "#/components/schemas/B" },
          B: { $ref: "#/components/schemas/A" }
        }
      }
    };

    const result = dereferenceSchema(doc, { $ref: "#/components/schemas/A" });
    expect(result.cycle).toBe(true);
    expect(result.refName).toBe("B");
  });
});

describe("collectReferencedNames", () => {
  it("walks nested and self-referencing schemas once", () => {
    const names = collectReferencedNames(petstore(), { $ref: "#/components/schemas/Pet" });
    expect(names).toEqual(["Category", "Pet", "PetStatus", "Tag"]);
  });
});

describe("mergeObjectShape", () => {
  it("merges allOf branches and keeps the required flags", () => {
    const shape = mergeObjectShape(petstore(), { $ref: "#/components/schemas/PetCreate" });
    expect(shape.properties.map((property) => property.name)).toEqual(["categoryId", "name", "status"]);
    expect(shape.properties.find((property) => property.name === "categoryId")?.required).toBe(true);
    expect(shape.properties.find((property) => property.name === "status")?.required).toBe(false);
  });
});

describe("buildOperations", () => {
  it("flattens every verb of every path, sorted by path", () => {
    const operations = buildOperations(petstore());
    expect(operations).toHaveLength(8);
    expect(operations.map((operation) => `${operation.method} ${operation.path}`)).toEqual([
      "post /pet",
      "get /pet/findByStatus",
      "get /pet/{petId}",
      "delete /pet/{petId}",
      "post /pet/{petId}/uploadImage",
      "get /status",
      "get /store/inventory",
      "post /store/order"
    ]);
  });

  it("keeps tags and marks tag-less operations with an empty list", () => {
    const operations = buildOperations(petstore());
    expect(operations.find((operation) => operation.operationId === "addPet")?.tags).toEqual(["pet"]);
    expect(operations.find((operation) => operation.operationId === "getStatus")?.tags).toEqual([]);
  });

  it("normalises parameters with the wire name in the decorator argument", () => {
    const operations = buildOperations(petstore());
    const getById = operations.find((operation) => operation.operationId === "getPetById");
    expect(getById).toBeDefined();

    expect(getById?.parameters.map((parameter) => parameter.source)).toEqual(["path", "cookie"]);
    expect(getById?.parameters[0]).toMatchObject({
      wireName: "petId",
      argumentName: "petId",
      required: true,
      decoratorArg: "petId"
    });
    expect(getById?.parameters[1]).toMatchObject({
      wireName: "session",
      source: "cookie",
      required: false
    });
  });

  it("renames an illegal binding but keeps the wire name", () => {
    const doc: OpenAPIDocument = {
      openapi: "3.0.3",
      paths: {
        "/x": {
          get: {
            operationId: "getX",
            parameters: [
              { name: "x-request-id", in: "header", schema: { type: "string" } }
            ],
            responses: { "200": { description: "ok" } }
          }
        }
      }
    };

    const [operation] = buildOperations(doc);
    expect(operation?.parameters[0]).toMatchObject({
      wireName: "x-request-id",
      argumentName: "xRequestId",
      decoratorArg: "x-request-id"
    });
  });

  it("expands a form-urlencoded body into one argument per field", () => {
    const operations = buildOperations(petstore());
    const placeOrder = operations.find((operation) => operation.operationId === "placeOrder");
    expect(placeOrder?.body?.kind).toBe("form");
    expect(placeOrder?.parameters.map((parameter) => parameter.argumentName)).toEqual([
      "xRequestId",
      "complete",
      "petId",
      "quantity",
      "shipDate"
    ]);
    expect(placeOrder?.parameters.find((parameter) => parameter.decoratorArg === "petId")).toMatchObject({
      source: "body",
      required: true
    });
  });

  it("detects the file fields of a multipart body", () => {
    const operations = buildOperations(petstore());
    const upload = operations.find((operation) => operation.operationId === "uploadPetImage");
    expect(upload?.body?.kind).toBe("multipart");
    expect(upload?.body?.fileFields).toEqual(["file"]);
    expect(upload?.parameters.map((parameter) => parameter.argumentName)).toContain("formData");
  });

  it("reads only 2xx responses and marks a body-less one", () => {
    const operations = buildOperations(petstore());
    const addPet = operations.find((operation) => operation.operationId === "addPet");
    expect(addPet?.responses.map((response) => response.status)).toEqual(["200"]);

    const deletePet = operations.find((operation) => operation.operationId === "deletePet");
    expect(deletePet?.responses).toEqual([{ status: "204", kind: "none" }]);

    const getStatus = operations.find((operation) => operation.operationId === "getStatus");
    expect(getStatus?.responses).toEqual([
      { status: "200", kind: "text", schema: { type: "string" } }
    ]);
  });

  it("filters by tag, treating tag-less operations as the default tag", () => {
    expect(buildOperations(petstore(), { tags: ["pet"] }).map((o) => o.operationId)).toEqual([
      "addPet",
      "findPetsByStatus",
      "getPetById",
      "deletePet",
      "uploadPetImage"
    ]);

    expect(buildOperations(petstore(), { excludeTags: ["store"] })).toHaveLength(6);

    expect(buildOperations(petstore(), { tags: ["default"] }).map((o) => o.operationId)).toEqual([
      "getStatus"
    ]);
  });
});

describe("groupOperations", () => {
  it("groups by tag and shares the longest path prefix", () => {
    const groups = groupOperations(buildOperations(petstore()), tagDescriptionsOf(petstore()));

    expect(groups.map((group) => group.className)).toEqual(["DefaultApi", "PetApi", "StoreApi"]);
    expect(groups.map((group) => group.instanceName)).toEqual(["defaultApi", "petApi", "storeApi"]);
    expect(groups.map((group) => group.fileName)).toEqual([
      "default.api.ts",
      "pet.api.ts",
      "store.api.ts"
    ]);

    const pet = groups.find((group) => group.tag === "pet");
    expect(pet?.apiPrefix).toBe("/pet");
    expect(pet?.description).toBe("Everything about your pets.");
    expect(pet?.operations.map((entry) => entry.methodPath)).toEqual([
      "/",
      "/findByStatus",
      "/:petId",
      "/:petId",
      "/:petId/uploadImage"
    ]);
    expect(pet?.operations.map((entry) => entry.methodName)).toEqual([
      "addPet",
      "findPetsByStatus",
      "deletePet",
      "getPetById",
      "uploadPetImage"
    ]);

    // A tag with a single operation keeps the whole path in the method.
    const defaultGroup = groups.find((group) => group.tag === "default");
    expect(defaultGroup?.apiPrefix).toBe("");
    expect(defaultGroup?.operations[0]?.methodPath).toBe("/status");
  });

  it("deduplicates method names inside one class", () => {
    const doc: OpenAPIDocument = {
      openapi: "3.0.3",
      paths: {
        "/a": { get: { tags: ["dup"], operationId: "getThing", responses: { "200": { description: "ok" } } } },
        "/b": { get: { tags: ["dup"], operationId: "getThing", responses: { "200": { description: "ok" } } } }
      }
    };

    const [group] = groupOperations(buildOperations(doc));
    expect(group?.operations.map((entry) => entry.methodName)).toEqual(["getThing", "getThing2"]);
  });
});

describe("path helpers", () => {
  it("rewrites placeholders and sanitises their names", () => {
    expect(toExpressPath("/pet/{petId}/x-{n}.{y}")).toBe("/pet/:petId/x-:n.:y");
  });

  it("strips a shared prefix segment by segment", () => {
    expect(stripPathPrefix("/pet/{petId}", "/pet")).toBe("/{petId}");
    expect(stripPathPrefix("/pet", "/pet")).toBe("/");
    expect(stripPathPrefix("/pet-owner", "/pet")).toBe("/pet-owner");
  });

  it("derives a method name when operationId is missing", () => {
    expect(deriveOperationId("get", "/pet/{petId}")).toBe("getPetPetId");
  });
});
