/**
 * Schema → TypeScript rendering tests.
 *
 * Every case that produced a bug or a wrong type during the rewrite is pinned here,
 * because the failure mode of a type generator is silent: the output still compiles,
 * it just describes the wrong payload.
 */

import { describe, expect, it } from "vitest";
import type { OpenAPIDocument, SchemaObject } from "../src/index.js";
import {
  collectProperties,
  createTypeContext,
  renderEnumUnion,
  renderPayloadType,
  renderSchemaType,
  schemaNotes,
  TypeRegistry
} from "../src/index.js";

const EMPTY_DOC: OpenAPIDocument = { openapi: "3.0.3", paths: {} };

function makeContext(doc: OpenAPIDocument = EMPTY_DOC, nameHint = "Test") {
  const warnings: string[] = [];
  const registry = new TypeRegistry(warnings);
  const ctx = createTypeContext({ doc, registry, warnings, file: "test", nameHint });
  return { warnings, registry, ctx };
}

describe("renderSchemaType", () => {
  it("maps the JSON Schema scalar types", () => {
    const { ctx } = makeContext();
    expect(renderSchemaType({ type: "string" }, ctx)).toBe("string");
    expect(renderSchemaType({ type: "integer" }, ctx)).toBe("number");
    expect(renderSchemaType({ type: "number", format: "double" }, ctx)).toBe("number");
    expect(renderSchemaType({ type: "boolean" }, ctx)).toBe("boolean");
  });

  it("renders arrays, parenthesising union items", () => {
    const { ctx } = makeContext();
    expect(renderSchemaType({ type: "array", items: { type: "string" } }, ctx)).toBe("string[]");
    expect(
      renderSchemaType(
        { type: "array", items: { enum: ["a", "b"] } },
        ctx
      )
    ).toBe('("a" | "b")[]');
    expect(renderSchemaType({ type: "array" }, ctx)).toBe("unknown[]");
  });

  it("renders an enum as a sorted union of literals", () => {
    const { ctx } = makeContext();
    expect(renderEnumUnion(["sold", "available", "available"])).toBe('"available" | "sold"');
    expect(renderSchemaType({ enum: [2, 1] }, ctx)).toBe("1 | 2");
    expect(renderSchemaType({ const: "ping" }, ctx)).toBe('"ping"');
  });

  it("handles both nullable spellings", () => {
    const { ctx } = makeContext();
    expect(renderSchemaType({ type: "string", nullable: true }, ctx)).toBe("string | null");
    expect(renderSchemaType({ type: ["string", "null"] }, ctx)).toBe("string | null");
    expect(renderSchemaType({ type: "null" }, ctx)).toBe("null");
  });

  it("renders oneOf and anyOf as unions", () => {
    const { ctx } = makeContext();
    expect(renderSchemaType({ oneOf: [{ type: "string" }, { type: "number" }] }, ctx)).toBe(
      "string | number"
    );
    expect(renderSchemaType({ anyOf: [{ type: "boolean" }, { type: "boolean" }] }, ctx)).toBe(
      "boolean"
    );
  });

  it("merges allOf object branches into one object literal", () => {
    const { ctx } = makeContext();
    const rendered = renderSchemaType(
      {
        allOf: [
          { type: "object", required: ["a"], properties: { a: { type: "string" } } },
          { type: "object", properties: { b: { type: "integer" } } }
        ]
      },
      ctx
    );
    expect(rendered).toBe("{ a: string; b?: number }");
  });

  it("keeps a non-object allOf branch as an intersection", () => {
    const { ctx } = makeContext();
    const rendered = renderSchemaType(
      {
        allOf: [
          { type: "object", properties: { a: { type: "string" } } },
          { type: "string" }
        ]
      },
      ctx
    );
    expect(rendered).toBe("{ a?: string } & string");
  });

  it("renders additionalProperties as a Record", () => {
    const { ctx } = makeContext();
    expect(
      renderSchemaType({ type: "object", additionalProperties: { type: "integer" } }, ctx)
    ).toBe("Record<string, number>");
    expect(renderSchemaType({ type: "object", additionalProperties: true }, ctx)).toBe(
      "Record<string, unknown>"
    );
    expect(renderSchemaType({ type: "object" }, ctx)).toBe("Record<string, unknown>");
  });

  it("falls back to unknown and records a warning rather than emitting any", () => {
    const empty = makeContext();
    expect(renderSchemaType({}, empty.ctx)).toBe("unknown");
    expect(empty.warnings).toHaveLength(1);
    expect(empty.warnings[0]).toContain("no type");

    const missing = makeContext();
    expect(renderSchemaType(undefined, missing.ctx)).toBe("unknown");
    expect(missing.warnings[0]).toContain("has no schema");

    expect(JSON.stringify(renderSchemaType({ type: "weird" }, empty.ctx))).not.toContain("any");
  });

  it("returns the component name for a $ref and registers the declaration", () => {
    const doc: OpenAPIDocument = {
      openapi: "3.0.3",
      paths: {},
      components: { schemas: { Pet: { type: "object", properties: { id: { type: "integer" } } } } }
    };
    const { ctx, registry } = makeContext(doc);

    expect(renderSchemaType({ $ref: "#/components/schemas/Pet" }, ctx)).toBe("Pet");
    expect(registry.get("Pet")?.file).toBe("test");
    // Referencing it twice must not create a second declaration.
    renderSchemaType({ $ref: "#/components/schemas/Pet" }, ctx);
    expect(registry.all()).toHaveLength(1);
  });
});

describe("renderPayloadType", () => {
  it("names an inline object after the operation and role", () => {
    const { ctx, registry } = makeContext(EMPTY_DOC, "GetPetByIdResponse");
    const type = renderPayloadType(
      { type: "object", properties: { id: { type: "integer" } } },
      ctx
    );
    expect(type).toBe("GetPetByIdResponse");
    expect(registry.get("GetPetByIdResponse")?.schema).toBeDefined();
  });

  it("names array items derived from the payload hint", () => {
    const { ctx, registry } = makeContext(EMPTY_DOC, "ListPetsResponse");
    const type = renderPayloadType(
      { type: "array", items: { type: "object", properties: { id: { type: "integer" } } } },
      ctx
    );
    expect(type).toBe("ListPetsResponseItem[]");
    expect(registry.get("ListPetsResponseItem")).toBeDefined();
  });

  it("keeps an enum inline instead of inventing a name", () => {
    const { ctx, registry } = makeContext(EMPTY_DOC, "StatusResponse");
    expect(renderPayloadType({ enum: ["a", "b"] }, ctx)).toBe('"a" | "b"');
    expect(registry.size).toBe(0);
  });

  it("qualifies a nullable payload", () => {
    const { ctx } = makeContext(EMPTY_DOC, "MaybeResponse");
    expect(renderPayloadType({ type: "object", nullable: true }, ctx)).toBe("MaybeResponse | null");
  });
});

describe("collectProperties", () => {
  it("sorts properties and marks the optional ones", () => {
    const { ctx } = makeContext();
    const properties = collectProperties(
      {
        type: "object",
        required: ["id"],
        properties: {
          name: { type: "string" },
          id: { type: "integer" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ctx
    );

    expect(properties.map((property) => property.key)).toEqual(["createdAt", "id", "name"]);
    expect(properties.map((property) => property.required)).toEqual([false, true, false]);
    expect(properties[0]?.notes).toEqual(["格式为 ISO-8601 日期时间字符串（不是 Date 对象）。"]);
  });

  it("quotes property keys that are not identifiers", () => {
    const { ctx } = makeContext();
    const properties = collectProperties(
      { type: "object", properties: { "x-trace-id": { type: "string" }, ok: { type: "boolean" } } },
      ctx
    );
    // Sorted by wire name, then quoted only where TypeScript requires it.
    expect(properties.map((property) => property.key)).toEqual(["ok", '"x-trace-id"']);
  });
});

describe("schemaNotes", () => {
  it("explains the formats TypeScript cannot express and marks deprecation", () => {
    expect(schemaNotes({ type: "string", format: "date" } as SchemaObject)).toEqual([
      "格式为 ISO-8601 日期字符串（不是 Date 对象）。"
    ]);
    expect(schemaNotes({ type: "string", format: "binary" } as SchemaObject)).toEqual([
      "二进制内容，上传时通常是 File 或 Blob。"
    ]);
    expect(schemaNotes({ type: "integer", format: "int64" } as SchemaObject)).toHaveLength(1);
    // Uninteresting formats are not worth a comment line.
    expect(schemaNotes({ type: "integer", format: "int32" } as SchemaObject)).toEqual([]);
    expect(
      schemaNotes({ type: "string", deprecated: true, default: "x" } as SchemaObject)
    ).toEqual(["默认值：\"x\"。", "已废弃（OpenAPI 标记 deprecated）。"]);
  });
});
