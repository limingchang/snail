/**
 * Structural types for the parts of OpenAPI 3.0 / 3.1 this generator reads.
 *
 * ## Why not `openapi-types` or a full JSON Schema model
 *
 * Only a fraction of the specification affects generated code, and a hand-written
 * model documents exactly which fraction that is. Two consequences matter:
 *
 * - Fields are optional and loosely typed on purpose. A document that violates the
 *   spec in a harmless place (a `title` that is a number, an unknown `format`)
 *   must still generate usable code, so nothing here is validated eagerly.
 * - Unknown keys are dropped rather than preserved. Nothing in the emitter can
 *   accidentally depend on a vendor extension that was never reviewed.
 *
 * `$ref` objects appear wherever the specification allows them, so every consumer
 * must accept `SchemaObject | ReferenceObject`; the `resolve` helpers exist to
 * collapse that union.
 */

/** A local JSON Pointer reference, e.g. `#/components/schemas/Pet`. */
export interface ReferenceObject {
  $ref: string;
}

/** Methods a path item can define. */
export type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";

/**
 * A JSON Schema, in the 3.0 ("nullable", single `type`) and 3.1 (type arrays,
 * `const`) dialects at once.
 *
 * The union is not narrowed by dialect: a 3.1 document may contain `nullable` and a
 * 3.0 document may contain a type array, and refusing either would be pedantry that
 * loses information.
 */
export interface SchemaObject {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  /** OpenAPI 3.0 nullability; 3.1 uses `type: ["…", "null"]` instead. */
  nullable?: boolean;

  enum?: unknown[];
  const?: unknown;

  properties?: Record<string, SchemaObject | ReferenceObject>;
  required?: string[];
  additionalProperties?: boolean | SchemaObject | ReferenceObject;

  items?: SchemaObject | ReferenceObject;
  prefixItems?: Array<SchemaObject | ReferenceObject>;

  allOf?: Array<SchemaObject | ReferenceObject>;
  oneOf?: Array<SchemaObject | ReferenceObject>;
  anyOf?: Array<SchemaObject | ReferenceObject>;
  not?: SchemaObject | ReferenceObject;
}

/** A single media type entry, e.g. `application/json`. */
export interface MediaTypeObject {
  schema?: SchemaObject | ReferenceObject;
  example?: unknown;
  examples?: Record<string, unknown>;
}

/**
 * One request parameter.
 *
 * `content` is the 3.0 alternative to `schema` and appears in real documents, so it is
 * modelled rather than ignored; the flattener prefers `schema` when both exist.
 */
export interface ParameterObject {
  name?: string;
  in?: string;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject | ReferenceObject;
  /** 3.0 style inline schema; equivalent to `schema` for our purposes. */
  content?: Record<string, MediaTypeObject>;
}

/** A body definition; only `required` and the chosen media type affect the output. */
export interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

/**
 * One response.
 *
 * A response with no `content` (a `204`, typically) carries no payload type; the
 * flattener records that explicitly rather than inventing `void` at render time.
 */
export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaTypeObject>;
  headers?: Record<string, unknown>;
}

/**
 * One operation below a path item.
 *
 * The index signature keeps vendor extensions representable, so a document with `x-…`
 * keys still type-checks when it is passed inline as an object literal.
 */
export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  parameters?: Array<ParameterObject | ReferenceObject>;
  requestBody?: RequestBodyObject | ReferenceObject;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  /** Kept so `$ref`-less vendor extensions cannot change behaviour silently. */
  [extension: string]: unknown;
}

/**
 * A path and the verbs defined on it.
 *
 * Verbs are listed explicitly (rather than as an index signature over `HttpMethod`) so
 * that iterating {@link HTTP_METHODS} and reading the matching key type-checks without a
 * cast.
 */
export interface PathItemObject {
  $ref?: string;
  summary?: string;
  description?: string;
  parameters?: Array<ParameterObject | ReferenceObject>;
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  patch?: OperationObject;
}

/**
 * The reusable definitions a document pulls in through `$ref`.
 *
 * Only `schemas` is rendered as types, but the other buckets are reachable through local
 * pointers and must therefore survive parsing.
 */
export interface ComponentsObject {
  schemas?: Record<string, SchemaObject | ReferenceObject>;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  parameters?: Record<string, ParameterObject | ReferenceObject>;
  requestBodies?: Record<string, RequestBodyObject | ReferenceObject>;
  [componentType: string]: unknown;
}

/** A tag declaration; its `description` becomes the generated class's JSDoc. */
export interface TagObject {
  name?: string;
  description?: string;
}

/** A server entry; the first non-empty `url` becomes the default `baseURL`. */
export interface ServerObject {
  url?: string;
  description?: string;
}

/** Document metadata; read for diagnostics only, never emitted. */
export interface InfoObject {
  title?: string;
  version?: string;
  description?: string;
}

/**
 * The document as consumed.
 *
 * `paths` is required: a document without it cannot produce a single method, and
 * generating an empty barrel would look like success. `openapi` is optional here
 * because the loader validates it and reports a better message than a type error.
 */
export interface OpenAPIDocument {
  openapi?: string;
  swagger?: string;
  info?: InfoObject;
  servers?: ServerObject[];
  tags?: TagObject[];
  paths?: Record<string, PathItemObject | ReferenceObject>;
  components?: ComponentsObject;
  [extension: string]: unknown;
}

/** Every request verb, in the order the emitter expects them to be listed. */
export const HTTP_METHODS: readonly HttpMethod[] = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options"
];

/** `get` → `Get`, used to name the decorator imported from `@snail-js/api`. */
export function decoratorNameFor(method: HttpMethod): string {
  return method.slice(0, 1).toUpperCase() + method.slice(1);
}
