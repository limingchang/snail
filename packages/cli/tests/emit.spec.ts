/**
 * Emitter tests: the actual product.
 *
 * Assertions are on the parts that carry meaning — decorators, signatures, return types,
 * import specifiers — rather than on whole files, so a formatting tweak does not fail the
 * suite while a wrong type does.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  generateFromOpenAPI,
  GENERATED_HEADER,
  readOpenAPIDocument,
  renderDocument,
  type GenerateResult
} from "../src/index.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const petstorePath = join(FIXTURES, "petstore.json");
const petstore31Path = join(FIXTURES, "petstore31.yaml");

function fileContents(result: GenerateResult, path: string): string {
  const file = result.files.find((candidate) => candidate.path === path);
  if (file === undefined) {
    throw new Error(`no generated file "${path}"; got ${result.files.map((f) => f.path).join(", ")}`);
  }
  return file.contents;
}

describe("generateFromOpenAPI", () => {
  it("emits one api file per tag plus the service, barrel and type files", async () => {
    const result = await generateFromOpenAPI(petstorePath);

    expect(result.files.map((file) => file.path)).toEqual([
      "apis/default.api.ts",
      "apis/pet.api.ts",
      "apis/store.api.ts",
      "index.ts",
      "service.ts",
      "types/index.ts",
      "types/pet.ts",
      "types/store.ts"
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("stamps every file with the header --clean looks for", async () => {
    const result = await generateFromOpenAPI(petstorePath);
    for (const file of result.files) {
      expect(file.contents.startsWith(GENERATED_HEADER)).toBe(true);
    }
  });

  it("renders the api class exactly as the decorator surface expects", async () => {
    const result = await generateFromOpenAPI(petstorePath);
    const api = fileContents(result, "apis/pet.api.ts");

    expect(api).toContain('import { Api, Data, Delete, Get, Params, Post, Query } from "@snail-js/api";');
    expect(api).toContain('import type { ApiResponse, GetPetByIdResponse, Pet, PetCreate, PetStatus } from "../types/pet";');
    expect(api).toContain('import { service } from "../service";');

    expect(api).toContain("/** Everything about your pets. */");
    expect(api).toContain('@Api("/pet")');
    expect(api).toContain("export class PetApi {");

    // The declared return type is what `SnailPayloadOf` turns into the payload type, so
    // `Promise<...>` here is a correctness requirement.
    expect(api).toContain('@Post("/")');
    expect(api).toContain("addPet(@Data() payload: PetCreate): Promise<Pet> {");
    expect(api).toContain('@Get("/findByStatus")');
    expect(api).toContain("findPetsByStatus(@Query(\"status\") status: PetStatus, @Query(\"limit\") limit?: number): Promise<Pet[]> {");
    expect(api).toContain('@Get("/:petId")');
    expect(api).toContain("getPetById(@Params(\"petId\") petId: number, session?: string): Promise<GetPetByIdResponse> {");

    // A 204 has no payload.
    expect(api).toContain("deletePet(@Params(\"petId\") petId: number): Promise<void> {");

    // Multipart bodies are FormData, and the file field is documented.
    expect(api).toContain("uploadPetImage(@Params(\"petId\") petId: number, @Data() formData: FormData): Promise<ApiResponse> {");
    expect(api).toContain("文件字段：`file`");

    // A cookie parameter has no decorator, so it must be explained in the JSDoc.
    expect(api).toContain("Cookie 参数 `session`");
    expect(api).toContain("GET /pet/{petId}");

    expect(api).toContain("return null!;");
    expect(api).toContain("export const petApi = service.createApi(PetApi);");
  });

  it("renders a text response as string and a form body field by field", async () => {
    const result = await generateFromOpenAPI(petstorePath);

    expect(fileContents(result, "apis/default.api.ts")).toContain(
      "getStatus(): Promise<string> {"
    );

    const store = fileContents(result, "apis/store.api.ts");
    expect(store).toContain('@Data("petId") petId: number');
    expect(store).toContain('@HeaderValue("x-request-id") xRequestId?: string');
    expect(store).toContain("): Promise<Order> {");
  });

  it("renders types with merged allOf, enums and self references", async () => {
    const result = await generateFromOpenAPI(petstorePath);
    const types = fileContents(result, "types/pet.ts");

    expect(types).toContain("export interface Pet {");
    expect(types).toContain("children?: Pet[];");
    expect(types).toContain("status?: PetStatus;");
    expect(types).toContain("tag?: string | null;");
    expect(types).toContain("export type PetStatus = \"available\" | \"pending\" | \"sold\";");
    expect(types).toContain("* 格式为 ISO-8601 日期时间字符串（不是 Date 对象）。");
    // `PetBase` is merged into `PetCreate` instead of being emitted as its own type.
    expect(types).toContain("export interface PetCreate {");
    expect(types).toContain("categoryId: number;");
    expect(types).not.toContain("export interface PetBase");
    expect(types).not.toContain(": PetBase");
    // A shared schema owned by the `pet` file is imported across type files.
    expect(types).toContain('import type { Order } from "./store";');
    expect(types).toContain("payload?: Pet | Order;");
  });

  it("renders the service with the document's first server url", async () => {
    const result = await generateFromOpenAPI(petstorePath);
    const service = fileContents(result, "service.ts");

    expect(service).toContain('import { Server, SnailServer } from "@snail-js/api";');
    expect(service).toContain('@Server({ baseURL: "https://api.example.com/v1" })');
    expect(service).toContain("class Service extends SnailServer {}");
    expect(service).toContain("export const service = new Service();");
  });

  it("honours --base-url and --name", async () => {
    const result = await generateFromOpenAPI(petstorePath, { baseUrl: "/api", name: "backend" });
    expect(fileContents(result, "service.ts")).toContain(
      '@Server({ baseURL: "/api", name: "backend" })'
    );
  });

  it("re-exports every api instance from the barrel", async () => {
    const result = await generateFromOpenAPI(petstorePath);
    expect(fileContents(result, "index.ts")).toContain(
      [
        'export { defaultApi } from "./apis/default.api";',
        'export { petApi } from "./apis/pet.api";',
        'export { storeApi } from "./apis/store.api";'
      ].join("\n")
    );
  });

  it("generates only the requested tags", async () => {
    const result = await generateFromOpenAPI(petstorePath, { tags: ["pet"] });
    expect(result.files.map((file) => file.path)).toEqual([
      "apis/pet.api.ts",
      "index.ts",
      "service.ts",
      "types/index.ts",
      "types/pet.ts"
    ]);
  });

  it("reads a 3.1 YAML document with the 3.1 nullable spelling", async () => {
    const result = await generateFromOpenAPI(petstore31Path);
    const types = fileContents(result, "types/ping.ts");

    expect(fileContents(result, "apis/ping.api.ts")).toContain('@Api("/ping")');
    expect(types).toContain("version?: string | null;");
    expect(types).toContain('kind?: "ping";');
  });

  it("warns when the filters leave nothing to generate", async () => {
    const result = await generateFromOpenAPI(petstorePath, { tags: ["nope"] });
    expect(result.warnings.join("\n")).toContain("no operations matched");
    expect(result.files.map((file) => file.path)).toEqual(["index.ts", "service.ts"]);
  });

  it("is byte-for-byte deterministic", async () => {
    const first = await generateFromOpenAPI(petstorePath);
    const second = await generateFromOpenAPI(petstorePath);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    // Reordering the same content in the document must not change the output: the
    // fixtures are re-read from disk, so ordering here really does come from the parse.
    const reloaded = renderDocument(readOpenAPIDocument(petstorePath));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(first));
  });

  it("produces the same output when an inline document is reordered", () => {
    const ordered = renderDocument({
      openapi: "3.0.3",
      tags: [{ name: "b" }, { name: "a" }],
      paths: {
        "/b": {
          get: {
            tags: ["b"],
            operationId: "getB",
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { z: { type: "string" }, a: { type: "integer" } } }
                  }
                }
              }
            }
          }
        },
        "/a": { get: { tags: ["a"], operationId: "getA", responses: { "200": { description: "ok" } } } }
      }
    });

    const reordered = renderDocument({
      openapi: "3.0.3",
      tags: [{ name: "a" }, { name: "b" }],
      paths: {
        "/a": { get: { tags: ["a"], operationId: "getA", responses: { "200": { description: "ok" } } } },
        "/b": {
          get: {
            tags: ["b"],
            operationId: "getB",
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { a: { type: "integer" }, z: { type: "string" } } }
                  }
                }
              }
            }
          }
        }
      }
    });

    expect(JSON.stringify(reordered)).toBe(JSON.stringify(ordered));
  });
});
