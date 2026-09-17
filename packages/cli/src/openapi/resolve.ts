/**
 * Local `$ref` resolution.
 *
 * ## Why local-only, and why that is a feature
 *
 * A remote `$ref` (`https://example.com/schemas/pet.json`) makes generation depend
 * on the network: the same input produces different output on a plane, and a
 * transient 502 silently changes the emitted types. Refusing remote refs with a
 * named, actionable error keeps the generator deterministic and offline, which the
 * README states as a known limitation.
 *
 * ## Why a cycle guard is mandatory, not defensive
 *
 * Self-referencing schemas are normal, not exotic: a category tree, a comment
 * thread, `Pet.children: Pet[]`. Any resolver that walks a `$ref` chain without
 * remembering where it has been hangs forever on `A → B → A` — and a hang produces
 * no error message at all, just a spinner. Every public entry point here therefore
 * takes (or creates) a visited set.
 */

import type { OpenAPIDocument, ReferenceObject, SchemaObject } from "./types.js";

/** A local target plus the human-readable name it was reached by. */
export interface ResolvedReference {
  /** Dotted path below the root, e.g. `components.schemas.Pet`. */
  pointer: string;
  /** Last pointer segment; for a schema, this is the component name. */
  name: string;
  value: unknown;
}

/** The outcome of following a `$ref` chain. */
export interface DereferencedSchema {
  /** The schema the chain ends at. For a cycle, the last `$ref` object seen. */
  schema: SchemaObject;
  /** Component name of the final target, when the chain started at a `$ref`. */
  refName?: string;
  /** `true` when the chain returned to an already-visited `$ref`. */
  cycle: boolean;
}

/**
 * Narrow a value to a `$ref` object.
 *
 * Every slot in the document that can hold a schema can instead hold a reference, so
 * this check is the guard that keeps the two apart: dereferencing a plain schema as if
 * it were a reference would throw on `undefined`.
 */
export function isReference(value: unknown): value is ReferenceObject {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { $ref?: unknown }).$ref === "string"
  );
}

/**
 * Resolve a local JSON Pointer.
 *
 * Only fragments are accepted. Exotic-but-legal escapes (`~1` for `/`) are decoded
 * because component names containing a slash are valid and would otherwise resolve
 * to the wrong node.
 */
export function resolveLocalReference(doc: OpenAPIDocument, ref: string): ResolvedReference {
  if (!ref.startsWith("#")) {
    throw new Error(
      `unsupported $ref "${ref}": only local references such as "#/components/schemas/Pet" are supported. ` +
        "Bundle remote or relative references into the document first."
    );
  }

  const pointer = ref.slice(1).replace(/^\//, "");
  const segments = pointer.length === 0
    ? []
    : pointer.split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current: unknown = doc;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      throw new Error(`$ref "${ref}" does not resolve: "${segment}" is not an object.`);
    }
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) {
      throw new Error(`$ref "${ref}" does not resolve: no "${segment}" below "${segments.join("/")}".`);
    }
  }

  return {
    pointer: segments.join("."),
    name: segments.length > 0 ? (segments[segments.length - 1] as string) : "",
    value: current
  };
}

/**
 * Follow `$ref` links until a concrete schema is reached.
 *
 * Returns `cycle: true` instead of throwing when the chain loops, because a cycle
 * between two component schemas is representable (`interface A extends B` style
 * unions exist) — the caller decides whether that is fatal. What must never happen
 * is spinning forever.
 */
export function dereferenceSchema(
  doc: OpenAPIDocument,
  schema: SchemaObject | ReferenceObject | undefined
): DereferencedSchema {
  if (!isReference(schema)) {
    return { schema: (schema ?? {}) as SchemaObject, cycle: false };
  }

  const visited = new Set<string>();
  let current: SchemaObject | ReferenceObject = schema;
  let refName: string | undefined;

  while (isReference(current)) {
    const ref = current.$ref;
    if (visited.has(ref)) {
      return { schema: current as SchemaObject, refName, cycle: true };
    }
    visited.add(ref);

    const resolved = resolveLocalReference(doc, ref);
    refName = resolved.name;
    if (resolved.value === null || typeof resolved.value !== "object") {
      throw new Error(`$ref "${ref}" resolves to ${typeof resolved.value}, not a schema.`);
    }
    current = resolved.value as SchemaObject;
  }

  return { schema: current, refName, cycle: false };
}

/**
 * Collect every component name reachable from a schema, following `$ref`s once.
 *
 * Used to report which named schemas a document actually uses; the visited set is
 * what makes `Pet → Pet` terminate. The result is sorted so callers can use it in
 * messages and comparisons without re-sorting.
 */
export function collectReferencedNames(
  doc: OpenAPIDocument,
  schema: SchemaObject | ReferenceObject | undefined
): string[] {
  const found = new Set<string>();
  const visited = new Set<string>();

  const walk = (node: SchemaObject | ReferenceObject | undefined): void => {
    if (node === undefined || node === null || typeof node !== "object") return;

    if (isReference(node)) {
      if (visited.has(node.$ref)) return;
      visited.add(node.$ref);
      const resolved = resolveLocalReference(doc, node.$ref);
      found.add(resolved.name);
      walk(resolved.value as SchemaObject);
      return;
    }

    const value = node as SchemaObject;
    for (const child of Object.values(value.properties ?? {})) walk(child);
    if (value.items) walk(value.items);
    for (const child of value.prefixItems ?? []) walk(child);
    for (const child of value.allOf ?? []) walk(child);
    for (const child of value.oneOf ?? []) walk(child);
    for (const child of value.anyOf ?? []) walk(child);
    if (value.additionalProperties && typeof value.additionalProperties === "object") {
      walk(value.additionalProperties);
    }
  };

  walk(schema);
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Component schemas, if any. */
export function componentSchemas(doc: OpenAPIDocument): Record<string, SchemaObject | ReferenceObject> {
  return doc.components?.schemas ?? {};
}

/** One property of a merged object schema. */
export interface MergedProperty {
  /** Wire name, exactly as it appears in the document. */
  name: string;
  schema: SchemaObject | ReferenceObject;
  required: boolean;
  description?: string;
}

/**
 * An object schema with `$ref`s followed and `allOf` branches flattened.
 *
 * Structural only: no TypeScript is rendered from it, so both the operation
 * flattener (which needs form fields) and the type renderer (which needs
 * properties) can share one implementation of the tricky part.
 */
export interface ObjectShape {
  /** Properties of every merged branch, sorted by name for determinism. */
  properties: MergedProperty[];
  /** `additionalProperties`, when present. */
  additional?: boolean | SchemaObject | ReferenceObject;
  /** Non-object `allOf` branches, in document order. */
  opaque: Array<SchemaObject | ReferenceObject>;
  /** `true` when the schema describes an object (with or without properties). */
  objectLike: boolean;
  /** `true` for `nullable: true`, which the renderer appends as `| null`. */
  nullable: boolean;
}

const EMPTY_SHAPE: ObjectShape = {
  properties: [],
  opaque: [],
  objectLike: false,
  nullable: false
};

function isObjectLike(schema: SchemaObject): boolean {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  return types.includes("object") || schema.properties !== undefined || schema.allOf !== undefined;
}

/**
 * Flatten a schema into properties, following refs and merging `allOf`.
 *
 * `visited` is the cycle guard: `A allOf [B]`, `B allOf [A]` is legal-ish input
 * that would otherwise recurse until the stack blows. Re-entering a ref yields
 * nothing, which is the correct merge result anyway — the branch's properties are
 * already in the result set by the time the cycle closes.
 */
export function mergeObjectShape(
  doc: OpenAPIDocument,
  schema: SchemaObject | ReferenceObject | undefined,
  visited: Set<string> = new Set()
): ObjectShape {
  if (schema === undefined || schema === null) return EMPTY_SHAPE;

  if (isReference(schema)) {
    if (visited.has(schema.$ref)) return EMPTY_SHAPE;
    visited.add(schema.$ref);
    const resolved = resolveLocalReference(doc, schema.$ref);
    return mergeObjectShape(doc, resolved.value as SchemaObject, visited);
  }

  const properties = new Map<string, MergedProperty>();
  const opaque: Array<SchemaObject | ReferenceObject> = [];
  let additional: boolean | SchemaObject | ReferenceObject | undefined;
  let objectLike = isObjectLike(schema);

  const absorb = (branch: ObjectShape): void => {
    for (const property of branch.properties) {
      // First writer wins: `allOf` is an intersection, so a property repeated with
      // an identical shape is the common case and overwriting it would reorder the
      // output (and change it between runs if branch order ever differed).
      if (!properties.has(property.name)) properties.set(property.name, property);
    }
    if (additional === undefined) additional = branch.additional;
    opaque.push(...branch.opaque);
    objectLike = objectLike || branch.objectLike;
  };

  for (const branch of schema.allOf ?? []) {
    const branchShape = mergeObjectShape(doc, branch, visited);

    // A branch that is not an object (`{ type: "string" }`, a `$ref` to an enum, a
    // cycle that resolved to nothing) cannot be merged into the property list. It is
    // kept so the renderer can express `allOf` as an intersection instead of dropping
    // the constraint — silently losing `allOf: [X, { type: "string" }]` would produce a
    // type that accepts payloads the API rejects.
    if (!branchShape.objectLike && branchShape.properties.length === 0) {
      if (additional === undefined) additional = branchShape.additional;
      opaque.push(branch);
      continue;
    }

    absorb(branchShape);
  }

  const required = new Set(schema.required ?? []);
  for (const [name, propertySchema] of Object.entries(schema.properties ?? {})) {
    properties.set(name, {
      name,
      schema: propertySchema,
      required: required.has(name) || properties.get(name)?.required === true,
      description: (propertySchema as SchemaObject).description
    });
  }

  if (schema.additionalProperties !== undefined) additional = schema.additionalProperties;

  const sorted = [...properties.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    properties: sorted,
    additional,
    opaque,
    objectLike,
    nullable: schema.nullable === true || typeIncludesNull(schema.type)
  };
}

/** `true` when a 3.1 type array (or a single type) includes `"null"`. */
export function typeIncludesNull(type: string | string[] | undefined): boolean {
  if (type === undefined) return false;
  return Array.isArray(type) ? type.includes("null") : type === "null";
}
