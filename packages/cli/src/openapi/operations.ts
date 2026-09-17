/**
 * Flatten an OpenAPI document into a normalised operation list.
 *
 * ## Why normalise instead of rendering straight from `paths`
 *
 * `paths` is a poor data structure for code generation: verbs hide in optional
 * keys, path-level parameters merge with operation-level ones, `requestBody` and
 * `responses` are keyed by media type, and both `$ref` objects and inline schemas
 * appear in the same slot. Resolving all of that once, into a shape with no
 * optionality left, means the emitters contain no branching over the document
 * format — only over *kinds* of operation, which is what they actually care about.
 *
 * ## Why ordering is decided here
 *
 * Output must be byte-identical between runs, and `Object.keys` order of a parsed
 * document is *input* order — which changes the moment a human reorders the file.
 * Sorting happens at every level (paths, methods, tags, parameters, fields) so that
 * editing the document without changing its meaning cannot change the output.
 */

import type {
  HttpMethod,
  OpenAPIDocument,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject
} from "./types.js";
import { HTTP_METHODS, decoratorNameFor } from "./types.js";
import { isReference, mergeObjectShape, resolveLocalReference } from "./resolve.js";
import {
  longestPathPrefix,
  toIdentifier,
  toTypeIdentifier,
  uniqueIdentifier
} from "../utils/naming.js";

/** Where a method argument comes from. */
export type ParameterSource = "path" | "query" | "header" | "cookie" | "body";

/** One argument of a generated method, decorator included. */
export interface NormalizedParameter {
  /** Name on the wire — always kept verbatim for the decorator argument. */
  wireName: string;
  /** Sanitised TS binding name used in the signature. */
  argumentName: string;
  source: ParameterSource;
  required: boolean;
  description?: string;
  /**
   * Key passed to the decorator, or `undefined` for a key-less argument
   * (`@Data()`, `@Query()`).
   */
  decoratorArg?: string;
  schema: SchemaObject | ReferenceObject;
}

/** How a request body is sent, which decides the decorator and the argument type. */
export type BodyKind = "json" | "form" | "multipart" | "text" | "binary";

/**
 * A normalised request body.
 *
 * `kind` is not decoration: it decides the emitted decorator (`@Data() payload` vs one
 * `@Data("field")` per property vs `@Data() formData: FormData`), and getting it wrong
 * produces a body the server silently rejects.
 */
export interface NormalizedBody {
  kind: BodyKind;
  required: boolean;
  description?: string;
  /** Schema of a JSON / text / binary body. */
  schema?: SchemaObject | ReferenceObject;
  /** Property names of a `multipart/form-data` body that hold files. */
  fileFields: string[];
}

/** A 2xx response, reduced to the media type we render. */
export interface NormalizedResponse {
  status: string;
  kind: "json" | "text" | "binary" | "none";
  schema?: SchemaObject | ReferenceObject;
}

/**
 * One operation with every document-shape decision already made.
 *
 * Nothing here is optional-by-accident: a field is missing only when the document
 * genuinely omitted it, so the emitters never have to ask "is this a `$ref`, a media
 * type key, or a raw array?" again.
 */
export interface NormalizedOperation {
  /** Lowercase HTTP verb, i.e. the OpenAPI key. */
  method: HttpMethod;
  /** `Get`, `Post`, … — the decorator imported from `@snail-js/api`. */
  decorator: string;
  /** Path exactly as written in the document, `{placeholders}` included. */
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  /** Tags as declared; empty means the operation belongs to `default`. */
  tags: string[];
  /** Path, query, header and cookie parameters, plus body arguments. */
  parameters: NormalizedParameter[];
  body?: NormalizedBody;
  /** 2xx responses in status order. */
  responses: NormalizedResponse[];
}

/** An operation with its final, tag-scoped method name and relative path. */
export interface GroupedOperation {
  operation: NormalizedOperation;
  /** Path relative to the class-level `@Api` prefix, `{x}` rewritten to `:x`. */
  methodPath: string;
  /** Deduplicated method name, unique inside the class. */
  methodName: string;
}

/** One generated api class and the file it lives in. */
export interface OperationGroup {
  /** Tag name, or `default` for untagged operations. */
  tag: string;
  /** Class name, e.g. `PetApi`. */
  className: string;
  /** Instance name exported from the api file, e.g. `petApi`. */
  instanceName: string;
  /** File name below `apis/`, e.g. `pet.api.ts`. */
  fileName: string;
  /** Tag description, used as the class JSDoc. */
  description?: string;
  /** Longest shared path prefix, or `""` when the tag has one operation. */
  apiPrefix: string;
  operations: GroupedOperation[];
}

/** Options that decide which operations survive normalisation. */
export interface NormalizeOptions {
  /** Keep only operations carrying at least one of these tags. */
  tags?: string[];
  /** Drop operations carrying any of these tags. */
  excludeTags?: string[];
}

const TAGLESS_GROUP = "default";

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function resolve<T>(doc: OpenAPIDocument, value: T | ReferenceObject): T {
  if (!isReference(value)) return value;
  return resolveLocalReference(doc, value.$ref).value as T;
}

function isJsonMediaType(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
  return normalized === "application/json" || normalized.endsWith("+json") || normalized === "text/json";
}

/**
 * Pick the media type that best represents a payload.
 *
 * Preference order matters: a document that offers both `application/json` and
 * `application/xml` should generate the JSON type, because that is what an axios
 * client sends and parses by default. Unknown types fall back to the first entry so
 * nothing is silently dropped.
 */
function pickMediaType(content: Record<string, unknown> | undefined): string | undefined {
  const keys = Object.keys(content ?? {}).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (keys.length === 0) return undefined;

  const json = keys.find(isJsonMediaType);
  if (json) return json;

  const form = keys.find((key) => key.toLowerCase().startsWith("application/x-www-form-urlencoded"));
  if (form) return form;

  const multipart = keys.find((key) => key.toLowerCase().startsWith("multipart/form-data"));
  if (multipart) return multipart;

  const text = keys.find((key) => key.toLowerCase().startsWith("text/"));
  if (text) return text;

  const binary = keys.find((key) => key.toLowerCase() === "application/octet-stream");
  if (binary) return binary;

  return keys[0];
}

function bodyKindFor(mediaType: string | undefined): BodyKind {
  if (mediaType === undefined) return "json";
  const normalized = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized.startsWith("multipart/form-data")) return "multipart";
  if (normalized.startsWith("application/x-www-form-urlencoded")) return "form";
  if (normalized.startsWith("text/")) return "text";
  if (normalized === "application/octet-stream") return "binary";
  return "json";
}

/** `true` for 2xx status keys, including the `2XX` wildcard form. */
function isSuccessStatus(status: string): boolean {
  return /^2\d\d$/.test(status) || status.toUpperCase() === "2XX";
}

/**
 * Collect the 2xx responses worth rendering.
 *
 * A `204 No Content` carries no media type and contributes nothing to the payload
 * type; folding it into a union would produce `Pet | void`, which is worse than
 * useless at a call site. It is dropped rather than rendered.
 */
function collectResponses(
  doc: OpenAPIDocument,
  responses: Record<string, ResponseObject | ReferenceObject> | undefined
): NormalizedResponse[] {
  const entries = Object.entries(responses ?? {})
    .filter(([status]) => isSuccessStatus(status))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const collected: NormalizedResponse[] = [];
  for (const [status, raw] of entries) {
    const response = resolve<ResponseObject>(doc, raw);
    const mediaType = pickMediaType(response?.content);
    if (mediaType === undefined) {
      collected.push({ status, kind: "none" });
      continue;
    }

    const media = response.content?.[mediaType];
    const schema = media?.schema;
    const normalized = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (normalized.startsWith("text/")) {
      collected.push({ status, kind: "text", schema });
      continue;
    }
    if (normalized === "application/octet-stream") {
      collected.push({ status, kind: "binary", schema });
      continue;
    }
    collected.push({ status, kind: "json", schema });
  }

  return collected;
}

/**
 * Normalise a request body into the decorator shape the emitter needs.
 *
 * `application/x-www-form-urlencoded` is the odd one out: the api's `@Data("field")`
 * decorator sets one body field at a time, so the schema's properties become
 * separate arguments instead of one payload object. A body schema that is a plain
 * `$ref` chain with no visible properties degrades to a single JSON-style payload,
 * which is the only shape that cannot silently lose data.
 */
function normalizeBody(
  doc: OpenAPIDocument,
  rawBody: RequestBodyObject | ReferenceObject | undefined
): { body?: NormalizedBody; parameters: NormalizedParameter[] } {
  if (rawBody === undefined) return { parameters: [] };

  const requestBody = resolve<RequestBodyObject>(doc, rawBody);
  const mediaType = pickMediaType(requestBody?.content);
  if (mediaType === undefined) {
    return { body: { kind: "json", required: requestBody?.required === true, fileFields: [] }, parameters: [] };
  }

  const kind = bodyKindFor(mediaType);
  const schema = requestBody.content?.[mediaType]?.schema;
  const required = requestBody.required === true;
  const description = requestBody.description;

  if (kind === "form" && schema !== undefined) {
    const shape = mergeObjectShape(doc, schema);
    if (shape.properties.length > 0) {
      const taken = new Set<string>();
      const parameters = shape.properties.map<NormalizedParameter>((property) => ({
        wireName: property.name,
        argumentName: uniqueIdentifier(toIdentifier(property.name), taken),
        source: "body",
        required: property.required,
        description: property.description,
        decoratorArg: property.name,
        schema: property.schema
      }));
      return { body: { kind, required, description, schema, fileFields: [] }, parameters };
    }
  }

  if (kind === "multipart") {
    const shape = mergeObjectShape(doc, schema);
    const fileFields = shape.properties
      .filter((property) => {
        const propertySchema = isReference(property.schema) ? undefined : property.schema;
        return propertySchema?.format === "binary";
      })
      .map((property) => property.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    return {
      body: { kind, required, description, schema, fileFields },
      parameters: [
        {
          wireName: "formData",
          argumentName: "formData",
          source: "body",
          required: true,
          decoratorArg: undefined,
          schema: { type: "object" }
        }
      ]
    };
  }

  return {
    body: { kind, required, description, schema, fileFields: [] },
    parameters: [
      {
        wireName: "payload",
        argumentName: "payload",
        source: "body",
        required: true,
        decoratorArg: undefined,
        schema: schema ?? {}
      }
    ]
  };
}

/**
 * Normalise one parameter.
 *
 * The argument name is derived from the wire name but never *replaces* it: a
 * `x-request-id` header keeps `@HeaderValue("x-request-id")` while binding to
 * `xRequestId`. Cookie parameters are kept even though no decorator exists for
 * them, because dropping the argument would silently remove it from the signature
 * the caller needs to satisfy.
 */
function normalizeParameter(
  doc: OpenAPIDocument,
  raw: ParameterObject | ReferenceObject,
  taken: Set<string>
): NormalizedParameter | undefined {
  const parameter = resolve<ParameterObject>(doc, raw);
  const wireName = parameter?.name;
  if (typeof wireName !== "string" || wireName.length === 0) return undefined;

  const location = parameter.in;
  const source: ParameterSource =
    location === "path" || location === "query" || location === "header" || location === "cookie"
      ? location
      : "query";

  const schema = parameter.schema ?? parameter.content?.[pickMediaType(parameter.content) ?? ""]?.schema ?? {};

  return {
    wireName,
    argumentName: uniqueIdentifier(toIdentifier(wireName), taken),
    source,
    // Path parameters are always required, whatever the document claims: a missing
    // one cannot produce a valid url.
    required: source === "path" ? true : parameter.required === true,
    description: parameter.description,
    // The wire name always travels in the decorator (`@Query("page")`), because the
    // sanitised binding name (`pageSize` from `page-size`) is not what the server
    // expects. Losing it produces a request that compiles and 404s.
    decoratorArg: wireName,
    schema
  };
}

/** Tags in a stable order, with duplicates removed. */
function normalizeTags(tags: string[] | undefined): string[] {
  const unique = [...new Set((tags ?? []).filter((tag) => typeof tag === "string" && tag.length > 0))];
  return unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `GET /pet/{petId}` → `getPetPetId`, used when `operationId` is missing. */
export function deriveOperationId(method: HttpMethod, path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/[{}]/g, ""));
  return toIdentifier([method, ...segments].join("-"), "request");
}

/**
 * Turn one path item into normalized operations.
 *
 * Path-level parameters are merged with operation-level ones, the operation
 * winning, which is what the specification requires and what a hand-written
 * document relies on to avoid repeating a shared `petId` parameter.
 */
function normalizePathItem(
  doc: OpenAPIDocument,
  path: string,
  rawItem: PathItemObject | ReferenceObject
): NormalizedOperation[] {
  const item = resolve<PathItemObject>(doc, rawItem);
  const sharedParameters = asArray(item?.parameters);

  const operations: NormalizedOperation[] = [];
  for (const method of HTTP_METHODS) {
    const operation = item?.[method];
    if (operation === undefined || operation === null) continue;
    if (typeof operation !== "object") continue;

    operations.push(
      normalizeOperation(doc, path, method, operation, sharedParameters)
    );
  }

  return operations;
}

function normalizeOperation(
  doc: OpenAPIDocument,
  path: string,
  method: HttpMethod,
  operation: OperationObject,
  sharedParameters: Array<ParameterObject | ReferenceObject>
): NormalizedOperation {
  const taken = new Set<string>();
  const parameters: NormalizedParameter[] = [];

  const merged = [...sharedParameters, ...asArray(operation.parameters)];
  const seenNames = new Set<string>();
  for (const raw of merged) {
    const normalized = normalizeParameter(doc, raw, taken);
    if (normalized === undefined) continue;
    // An operation-level parameter overrides the path-level one with the same
    // (name, in) pair; the emitter must not emit both.
    const key = `${normalized.source}:${normalized.wireName}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    parameters.push(normalized);
  }

  const { body, parameters: bodyParameters } = normalizeBody(doc, operation.requestBody);
  const usedNames = new Set(parameters.map((parameter) => parameter.argumentName));
  for (const parameter of bodyParameters) {
    parameter.argumentName = uniqueIdentifier(parameter.argumentName, usedNames);
    parameters.push(parameter);
  }

  return {
    method,
    decorator: decoratorNameFor(method),
    path,
    operationId: typeof operation.operationId === "string" ? operation.operationId : undefined,
    summary: typeof operation.summary === "string" ? operation.summary : undefined,
    description: typeof operation.description === "string" ? operation.description : undefined,
    deprecated: operation.deprecated === true,
    tags: normalizeTags(operation.tags),
    parameters,
    body,
    responses: collectResponses(doc, operation.responses)
  };
}

/**
 * `true` when the operation survives the `--tags` / `--exclude-tags` filters.
 *
 * Untagged operations are filtered under the pseudo-tag `default`, so
 * `--tags default` is a way to generate only them — and `--tags pet` correctly
 * drops them instead of treating "no tag" as "matches everything".
 */
function matchesTagFilter(operation: NormalizedOperation, options: NormalizeOptions): boolean {
  const tags = operation.tags.length > 0 ? operation.tags : [TAGLESS_GROUP];

  if (options.excludeTags && options.excludeTags.length > 0) {
    if (tags.some((tag) => options.excludeTags?.includes(tag))) return false;
  }

  if (options.tags && options.tags.length > 0) {
    return tags.some((tag) => options.tags?.includes(tag));
  }

  return true;
}

/**
 * Flatten a document into sorted normalized operations.
 *
 * One operation carrying several tags appears once per tag later on; here it stays
 * single, because the *document* view of an operation is what tests assert on.
 */
export function buildOperations(
  doc: OpenAPIDocument,
  options: NormalizeOptions = {}
): NormalizedOperation[] {
  const entries = Object.entries(doc.paths ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const operations: NormalizedOperation[] = [];
  for (const [path, item] of entries) {
    if (path.startsWith("x-")) continue;
    operations.push(...normalizePathItem(doc, path, item));
  }

  return operations.filter((operation) => matchesTagFilter(operation, options));
}

/** `{petId}` → `:petId`, with the placeholder sanitised to a legal TS identifier. */
export function toExpressPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => `:${toIdentifier(name, "param")}`);
}

/**
 * Remove `prefix` from the front of `path`, segment by segment.
 *
 * The segments are compared before being dropped: `/pet` is *not* a prefix of
 * `/pet-owner`, and blindly slicing by segment count would turn that path into `/`.
 * The check is what makes the helper safe to call with any prefix, not just one this
 * module computed.
 */
export function stripPathPrefix(path: string, prefix: string): string {
  if (prefix.length === 0) return path;

  const segments = path.split("/");
  const prefixSegments = prefix.split("/");
  if (segments.length < prefixSegments.length) return path;

  for (let index = 0; index < prefixSegments.length; index += 1) {
    if (segments[index] !== prefixSegments[index]) return path;
  }

  const rest = segments.slice(prefixSegments.length).join("/");
  return rest.length === 0 ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
}

/**
 * Group operations by tag and give each one its final method name and path.
 *
 * A tag's class prefix is the longest path prefix its own operations share, so
 * `/pet`, `/pet/findByStatus` and `/pet/{petId}` collapse to `@Api("/pet")` plus
 * `/`, `/findByStatus` and `/:petId`. Method names are deduplicated per class
 * against the same sorted order, so a duplicate `operationId` always renames the
 * same method.
 */
export function groupOperations(
  operations: readonly NormalizedOperation[],
  tagDescriptions: Record<string, string> = {}
): OperationGroup[] {
  const groups = new Map<string, NormalizedOperation[]>();

  for (const operation of operations) {
    const tags = operation.tags.length > 0 ? operation.tags : [TAGLESS_GROUP];
    for (const tag of tags) {
      const bucket = groups.get(tag);
      if (bucket) bucket.push(operation);
      else groups.set(tag, [operation]);
    }
  }

  const tagNames = [...groups.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return tagNames.map((tag) => {
    const bucket = [...(groups.get(tag) ?? [])].sort((a, b) => {
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      return a.method < b.method ? -1 : a.method > b.method ? 1 : 0;
    });

    const apiPrefix = longestPathPrefix(bucket.map((operation) => operation.path));
    const taken = new Set<string>();
    const qualified: GroupedOperation[] = bucket.map((operation) => {
      const methodName = uniqueIdentifier(
        toIdentifier(operation.operationId ?? deriveOperationId(operation.method, operation.path), "request"),
        taken
      );
      return {
        operation,
        methodName,
        methodPath: toExpressPath(stripPathPrefix(operation.path, apiPrefix))
      };
    });

    const typeName = toTypeIdentifier(tag, "Default");

    return {
      tag,
      className: `${typeName}Api`,
      // `default` would otherwise become the reserved word `default_`; the `Api`
      // suffix is what makes the binding legal, so it is appended before sanitising.
      instanceName: toIdentifier(`${tag}Api`, "defaultApi"),
      fileName: `${typeName === "Default" ? "default" : tagFileName(tag)}.api.ts`,
      description: tagDescriptions[tag],
      apiPrefix,
      operations: qualified
    };
  });
}

/**
 * Tag descriptions declared at the document's top level.
 *
 * A tag's `description` is the only place a document explains what a group of
 * endpoints is *for*, and it becomes the generated class's JSDoc — which is what
 * an IDE shows on hover over `petApi`.
 */
export function tagDescriptionsOf(doc: OpenAPIDocument): Record<string, string> {
  const descriptions: Record<string, string> = {};
  for (const tag of doc.tags ?? []) {
    if (typeof tag?.name === "string" && typeof tag.description === "string" && tag.description.length > 0) {
      descriptions[tag.name] = tag.description;
    }
  }
  return descriptions;
}

/** File-safe tag name: `pet store` and `pet-store` must not collide by accident. */
function tagFileName(tag: string): string {
  const name = tag
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name.length > 0 ? name : "default";
}
