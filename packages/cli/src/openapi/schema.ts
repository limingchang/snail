/**
 * JSON Schema → TypeScript type rendering.
 *
 * ## The one idea that keeps this small
 *
 * A `$ref` is never inlined. Resolving `#/components/schemas/Pet` yields the *name*
 * `Pet`, and the schema behind it is registered for separate emission. That single
 * decision buys three things at once:
 *
 * - **Termination.** `Pet.children: Pet[]` cannot recurse, because rendering the
 *   property returns a name instead of descending into `Pet` again. A resolver that
 *   inlines refs needs a cycle guard on every path; here the data structure makes
 *   the cycle impossible.
 * - **Readable output.** Nested objects become named interfaces instead of one
 *   400-character type expression, so an IDE can show them.
 * - **Stable names.** Component names are reused verbatim, and inline schemas get a
 *   name derived from the operation and the role it plays (`GetPetByIdResponse`).
 *
 * ## Why `unknown` and never `any`
 *
 * `any` disables checking for every value it touches and spreads silently through
 * inference; a generated file full of `any` looks typed while providing nothing.
 * When a schema genuinely says nothing, `unknown` is emitted *and* a warning is
 * recorded, so the user learns which part of their document is under-specified.
 */

import type { OpenAPIDocument, ReferenceObject, SchemaObject } from "./types.js";
import { isReference, mergeObjectShape, resolveLocalReference, typeIncludesNull } from "./resolve.js";
import { formatPropertyKey, toTypeIdentifier } from "../utils/naming.js";

/**
 * A named type the generator decided to emit.
 *
 * `file` is the grouping key for `src/types/<file>.ts`, normally the tag whose
 * operations first needed the type — that is what keeps `pet.api.ts` importing from
 * `../types/pet`. It is assigned by the first reference, which is deterministic
 * because operations are rendered in sorted tag order.
 */
export interface TypeDeclaration {
  name: string;
  schema: SchemaObject | ReferenceObject;
  file: string;
  description?: string;
}

/** One rendered property of an interface. */
export interface PropertyModel {
  /** Wire name from the document. */
  name: string;
  /** `name`, or `"name"` when the wire name is not a legal identifier. */
  key: string;
  /** Rendered TypeScript type. */
  type: string;
  required: boolean;
  description?: string;
  /** Generator-authored remarks: formats, defaults, deprecation. */
  notes: string[];
}

/** Rendering state threaded through a single operation (or declaration) render. */
export interface TypeRenderContext {
  doc: OpenAPIDocument;
  registry: TypeRegistry;
  /** Collected, user-visible problems; surfaced as `GenerateResult.warnings`. */
  warnings: string[];
  /** Name prefix for inline schemas, e.g. `GetPetByIdResponse`. */
  nameHint: string;
  /** Tag that owns names created through this context. */
  file: string;
  /** Type names referenced during the current render, for import generation. */
  used: Set<string>;
}

function isObjectLikeNode(schema: SchemaObject): boolean {
  if (schema.properties !== undefined || schema.allOf !== undefined) return true;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  return types.includes("object");
}

function isArrayNode(schema: SchemaObject): boolean {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  return types.includes("array") || schema.items !== undefined;
}

/**
 * The set of names emitted into `src/types`.
 *
 * Deduplicated by *schema identity* as well as by name: the same component reached
 * from three operations must produce one interface, and two different schemas that
 * sanitise to the same name must not silently overwrite each other (they get a
 * counter suffix and a warning instead).
 */
export class TypeRegistry {
  private readonly byName = new Map<string, TypeDeclaration>();
  private readonly bySchema = new Map<object, string>();

  constructor(private readonly warnings: string[]) {}

  /**
   * Register `schema` under `suggestedName` and return the name to reference it by.
   *
   * Returning the resolved name (rather than the suggested one) is the whole
   * contract: callers must render whatever this returns, or an import would point
   * at a type that does not exist.
   */
  reference(suggestedName: string, schema: SchemaObject | ReferenceObject, file: string): string {
    if (schema !== null && typeof schema === "object") {
      const existing = this.bySchema.get(schema);
      if (existing !== undefined) return existing;
    }

    const base = toTypeIdentifier(suggestedName, "Unnamed");
    let name = base;
    if (this.byName.has(name)) {
      let counter = 2;
      while (this.byName.has(`${base}${counter}`)) counter += 1;
      name = `${base}${counter}`;
      this.warnings.push(
        `two different schemas both want the type name "${base}"; the second was emitted as "${name}".`
      );
    }

    const description = isReference(schema) ? undefined : (schema as SchemaObject).description;
    const declaration: TypeDeclaration = { name, schema, file, description };
    this.byName.set(name, declaration);
    if (schema !== null && typeof schema === "object") this.bySchema.set(schema, name);
    return name;
  }

  get(name: string): TypeDeclaration | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Every declaration, sorted by owning file then name. */
  all(): TypeDeclaration[] {
    return [...this.byName.values()].sort((a, b) => {
      if (a.file !== b.file) return a.file < b.file ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  get size(): number {
    return this.byName.size;
  }
}

/** Create the rendering context for one operation or declaration. */
export function createTypeContext(options: {
  doc: OpenAPIDocument;
  registry: TypeRegistry;
  warnings: string[];
  file: string;
  nameHint: string;
}): TypeRenderContext {
  return {
    doc: options.doc,
    registry: options.registry,
    warnings: options.warnings,
    file: options.file,
    nameHint: options.nameHint,
    used: new Set<string>()
  };
}

/** The context for a nested part of a schema, with a derived name hint. */
export function withNameHint(ctx: TypeRenderContext, suffix: string): TypeRenderContext {
  return { ...ctx, nameHint: `${ctx.nameHint}${suffix}` };
}

function warn(ctx: TypeRenderContext, message: string): void {
  if (!ctx.warnings.includes(message)) ctx.warnings.push(message);
}

/** Follow a `$ref` one level, so callers can inspect the schema behind a name. */
export function resolveSchema(
  doc: OpenAPIDocument,
  schema: SchemaObject | ReferenceObject | undefined
): SchemaObject | undefined {
  if (schema === undefined || schema === null) return undefined;
  if (!isReference(schema)) return schema;
  const resolved = resolveLocalReference(doc, schema.$ref);
  return resolved.value as SchemaObject;
}

function literalOf(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  // Objects and arrays cannot be literal types; `unknown` is the honest answer.
  return "unknown";
}

/** Union of literal types, deduplicated and sorted so output is stable. */
export function renderEnumUnion(values: readonly unknown[]): string {
  const literals = [...new Set(values.map(literalOf))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return literals.length > 0 ? literals.join(" | ") : "never";
}

/** `true` when the rendered type needs parentheses before a `[]` suffix. */
function needsParentheses(type: string): boolean {
  return type.includes(" | ") || type.includes(" & ") || type.startsWith("{");
}

function withNull(type: string, nullable: boolean): string {
  if (!nullable || type === "null" || type === "unknown") return type;
  return `${type} | null`;
}

/**
 * Generator-authored remarks for one schema.
 *
 * These are the places where a naive generator hands the user something that
 * *looks* right and misbehaves: `format: date-time` rendered as `Date` never
 * matches the JSON string axios actually returns, so the note explains the choice
 * instead of leaving the user to discover it at runtime.
 */
export function schemaNotes(
  schema: SchemaObject | ReferenceObject | undefined,
  doc?: OpenAPIDocument
): string[] {
  const node = doc ? resolveSchema(doc, schema) : isReference(schema) ? undefined : schema;
  if (node === undefined) return [];

  const notes: string[] = [];
  const format = typeof node.format === "string" ? node.format : undefined;

  if (format === "date-time") {
    notes.push("格式为 ISO-8601 日期时间字符串（不是 Date 对象）。");
  } else if (format === "date") {
    notes.push("格式为 ISO-8601 日期字符串（不是 Date 对象）。");
  } else if (format === "binary") {
    notes.push("二进制内容，上传时通常是 File 或 Blob。");
  } else if (format === "int64") {
    // Beyond 2^53 a JSON number no longer round-trips through a JS `number`; a caller
    // handling large ids has to know before it silently loses precision.
    notes.push("int64 超出 JS 安全整数范围时可能丢精度，必要时请用字符串传输。");
  }
  // Any other `format` (int32, uuid, email, …) is a hint for validators, not something
  // TypeScript can express, and emitting a note for each one buries the useful ones.

  if (node.default !== undefined) notes.push(`默认值：${JSON.stringify(node.default)}。`);
  if (node.example !== undefined && node.default === undefined) {
    notes.push(`示例：${JSON.stringify(node.example)}。`);
  }
  if (node.deprecated === true) notes.push("已废弃（OpenAPI 标记 deprecated）。");
  if (node.readOnly === true) notes.push("只读。");
  if (node.writeOnly === true) notes.push("只写。");

  return notes;
}

/**
 * Render any schema as a TypeScript type expression.
 *
 * Used for everything *inside* a declaration: properties, array items, union
 * branches. It inlines object shapes as `{ … }` literals, because a nested inline
 * object named `PetCategoryInner` is harder to read than the three fields it holds.
 * Payloads go through {@link renderPayloadType} instead, which prefers names.
 */
export function renderSchemaType(
  schema: SchemaObject | ReferenceObject | undefined,
  ctx: TypeRenderContext
): string {
  if (schema === undefined || schema === null) {
    warn(ctx, `"${ctx.nameHint}" has no schema; it was typed as unknown.`);
    return "unknown";
  }

  if (isReference(schema)) {
    const resolved = resolveLocalReference(ctx.doc, schema.$ref);
    const name = ctx.registry.reference(resolved.name, resolved.value as SchemaObject, ctx.file);
    ctx.used.add(name);
    return name;
  }

  const node = schema;
  const nullable = node.nullable === true || typeIncludesNull(node.type);

  if (node.const !== undefined) return withNull(literalOf(node.const), nullable);
  if (Array.isArray(node.enum)) return withNull(renderEnumUnion(node.enum), nullable);

  if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
    return withNull(renderUnion(node.oneOf, ctx, "oneOf"), nullable);
  }
  if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
    return withNull(renderUnion(node.anyOf, ctx, "anyOf"), nullable);
  }
  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    return withNull(renderAllOf(node, ctx), nullable);
  }

  if (isArrayNode(node)) {
    const item = renderSchemaType(node.items, withNameHint(ctx, "Item"));
    return withNull(needsParentheses(item) ? `(${item})[]` : `${item}[]`, nullable);
  }

  if (isObjectLikeNode(node)) {
    return withNull(renderObjectLiteral(node, ctx), nullable);
  }

  const rawTypes = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
  const types = rawTypes.filter((type) => type !== "null");

  if (types.length === 0) {
    // `type: "null"` is a real (if rare) type, not a missing one; only a schema with no
    // type information at all is unknown.
    if (rawTypes.includes("null")) return "null";
    warn(
      ctx,
      `"${ctx.nameHint}" declares no type, no properties and no composition; it was typed as unknown.`
    );
    return "unknown";
  }

  const rendered = types.map((type) => renderPrimitive(type));
  return withNull(rendered.join(" | "), nullable);
}

function renderPrimitive(type: string): string {
  switch (type) {
    case "integer":
    case "number":
      return "number";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    default:
      // An unknown JSON Schema type keyword is not something to guess at.
      return "unknown";
  }
}

function renderUnion(
  branches: Array<SchemaObject | ReferenceObject>,
  ctx: TypeRenderContext,
  keyword: string
): string {
  const rendered = branches
    .map((branch, index) => renderSchemaType(branch, withNameHint(ctx, `${toTypeIdentifier(keyword)}${index + 1}`)))
    .filter((type) => type !== "never");

  const unique = [...new Set(rendered)];
  return unique.length > 0 ? unique.join(" | ") : "never";
}

/** `allOf` of object branches merges; anything else becomes an intersection. */
function renderAllOf(node: SchemaObject, ctx: TypeRenderContext): string {
  const shape = mergeObjectShape(ctx.doc, node);
  const parts: string[] = [];

  if (shape.properties.length > 0 || shape.additional !== undefined) {
    parts.push(renderObjectLiteral(node, ctx));
  }
  for (const opaque of shape.opaque) {
    parts.push(renderSchemaType(opaque, withNameHint(ctx, "Branch")));
  }

  if (parts.length === 0) return "Record<string, unknown>";
  return parts.join(" & ");
}

/** `{ a: string; b?: number }`, using the merged properties of the schema. */
export function renderObjectLiteral(schema: SchemaObject, ctx: TypeRenderContext): string {
  const properties = collectProperties(schema, ctx);
  const additional = renderAdditionalProperties(schema, ctx);

  if (properties.length === 0) {
    return additional ?? "Record<string, unknown>";
  }

  const body = properties
    .map((property) => `${property.key}${property.required ? "" : "?"}: ${property.type}`)
    .join("; ");

  return additional === undefined ? `{ ${body} }` : `{ ${body} } & ${additional}`;
}

/** `Record<string, T>` for an open object, or `undefined` when it is closed. */
export function renderAdditionalProperties(
  schema: SchemaObject,
  ctx: TypeRenderContext
): string | undefined {
  return renderAdditionalType(schema.additionalProperties, ctx);
}

/**
 * Render an `additionalProperties` value.
 *
 * `false` means "no extra keys", which has no TypeScript spelling short of an
 * exact-object type — emitting nothing lets excess-property checking do the rest.
 */
export function renderAdditionalType(
  additional: boolean | SchemaObject | ReferenceObject | undefined,
  ctx: TypeRenderContext
): string | undefined {
  if (additional === undefined || additional === false) return undefined;
  if (additional === true) return "Record<string, unknown>";
  return `Record<string, ${renderSchemaType(additional, withNameHint(ctx, "Value"))}>`;
}

/**
 * Merged, rendered properties of an object schema.
 *
 * Sorted by wire name (via `mergeObjectShape`) so that reordering the document
 * cannot reorder the emitted interface.
 */
export function collectProperties(schema: SchemaObject, ctx: TypeRenderContext): PropertyModel[] {
  const shape = mergeObjectShape(ctx.doc, schema);

  return shape.properties.map((property) => ({
    name: property.name,
    key: formatPropertyKey(property.name),
    type: renderSchemaType(property.schema, withNameHint(ctx, toTypeIdentifier(property.name))),
    required: property.required,
    description: property.description,
    notes: schemaNotes(property.schema, ctx.doc)
  }));
}

/** `true` when a payload schema should become a named declaration. */
function shouldNamePayload(node: SchemaObject): boolean {
  if (Array.isArray(node.oneOf) || Array.isArray(node.anyOf)) return false;
  if (Array.isArray(node.enum)) return false;
  if (node.const !== undefined) return false;
  return isObjectLikeNode(node);
}

/**
 * Render the type of a *payload*: a response body, a request body, or a parameter.
 *
 * Differs from {@link renderSchemaType} in one way: an inline object becomes a
 * named interface instead of a literal. A response shape is the type a caller
 * destructures most often, and `Promise<GetPetByIdResponse>` is what makes the
 * generated method usable, so the name is worth the extra declaration.
 */
export function renderPayloadType(
  schema: SchemaObject | ReferenceObject | undefined,
  ctx: TypeRenderContext
): string {
  if (schema === undefined || schema === null) {
    warn(ctx, `"${ctx.nameHint}" has no schema; it was typed as unknown.`);
    return "unknown";
  }

  if (isReference(schema)) {
    const resolved = resolveLocalReference(ctx.doc, schema.$ref);
    const name = ctx.registry.reference(resolved.name, resolved.value as SchemaObject, ctx.file);
    ctx.used.add(name);
    return name;
  }

  const node = schema;
  const nullable = node.nullable === true || typeIncludesNull(node.type);

  if (isArrayNode(node) && !isObjectLikeNode(node)) {
    const item = renderPayloadType(node.items, withNameHint(ctx, "Item"));
    return withNull(needsParentheses(item) ? `(${item})[]` : `${item}[]`, nullable);
  }

  if (shouldNamePayload(node)) {
    const name = ctx.registry.reference(ctx.nameHint, node, ctx.file);
    ctx.used.add(name);
    return withNull(name, nullable);
  }

  return renderSchemaType(node, ctx);
}
