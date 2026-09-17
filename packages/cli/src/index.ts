/**
 * `@snail-js/cli` — programmatic API.
 *
 * ## Why the pipeline is exposed function by function
 *
 * The interesting behaviour is not "generate the files" but each step in isolation: a
 * `$ref` that must terminate, an operation that must normalise, a schema that must
 * render. Exposing `loadOpenAPIDocument`, `resolveLocalReference`, `buildOperations`,
 * `renderSchemaType` and the emitters lets a test (or a build script) drive one step
 * and assert on its result without a temporary directory, and lets a consumer reuse,
 * say, only the type renderer.
 *
 * ## Why `generateFromOpenAPI` is the composition root
 *
 * It is the only function that knows the *order*: operations must be rendered before
 * their inline schemas can be registered, and the type files can only be written once
 * every schema that will be referenced has a name. Keeping that order in one place
 * means the emitters stay pure functions of their inputs.
 */

import { loadOpenAPIDocument } from "./openapi/load.js";
import {
  buildOperations,
  groupOperations,
  tagDescriptionsOf,
  type NormalizedOperation,
  type OperationGroup
} from "./openapi/operations.js";
import { createTypeContext, TypeRegistry, type TypeDeclaration } from "./openapi/schema.js";
import { renderApiFile } from "./emit/api.js";
import { renderBarrelFile } from "./emit/index.js";
import { renderServiceFile } from "./emit/service.js";
import { renderTypeFile, renderTypesBarrelFile } from "./emit/type.js";
import { GENERATED_HEADER } from "./emit/format.js";
import { createLogger, type Logger } from "./logger.js";
import { removeGeneratedFiles, writeTextFile } from "./utils/fs.js";
import { join } from "node:path";
import type { OpenAPIDocument } from "./openapi/types.js";

/**
 * Thrown when the caller asked for something the CLI cannot act on.
 *
 * Exit code `2` is reserved for this: a usage error means "nothing was attempted",
 * which is a different outcome from "generation failed" (`1`) for scripts and for
 * humans reading CI output.
 */
export class UsageError extends Error {
  /** Process exit code the CLI must use for this error. */
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** A file the generator wants to produce, `path` relative to the output directory. */
export interface GenerateFile {
  /** POSIX-style relative path, e.g. `apis/pet.api.ts`. */
  path: string;
  contents: string;
}

/**
 * The complete result of rendering a document.
 *
 * `files` is sorted and `warnings` is deduplicated, so the value can be compared between
 * two runs directly — that is how the determinism guarantee is tested.
 */
export interface GenerateResult {
  /** Every file to write, sorted by path so two runs produce identical lists. */
  files: GenerateFile[];
  /** Non-fatal problems: `unknown` fallbacks, name collisions, skipped schemas. */
  warnings: string[];
}

/**
 * Everything that changes *what* is generated.
 *
 * Deliberately separate from the CLI flags: `dryRun`, `force`, `clean` and `verbose`
 * change what the command *does* with the result, not the result itself, and keeping them
 * out means this object is exactly what {@link generateFromOpenAPI} understands.
 */
export interface GenerateOptions {
  /** Input path; consumed by the CLI's `--input`. */
  input?: string;
  /** Output directory; consumed by the CLI's `--out` and by {@link writeGenerated}. */
  out?: string;
  /** Overrides the document's first `servers[].url`. */
  baseUrl?: string;
  /** `name` for `@Server`; omitted keeps the class name. */
  name?: string;
  /** Generate only these tags (requires at least one match). */
  tags?: string[];
  /** Drop these tags. */
  excludeTags?: string[];
}

/** Default output root when `--out` is not given. */
export const DEFAULT_OUT_DIR = "src";

/** Default `baseURL` when neither `--base-url` nor `servers` supply one. */
export const DEFAULT_BASE_URL = "/api";

/** `pet.api.ts` → `pet`, the key used for `src/types/<key>.ts`. */
export function typesFileKey(group: OperationGroup): string {
  return group.fileName.replace(/\.api\.ts$/, "");
}

/**
 * Resolve the `@Server` baseURL.
 *
 * The document's first server url is the best default — it is what the API author
 * declared — but an empty or relative entry is useless to a browser client, so the
 * fallback is a relative `/api` that a dev-server proxy can own.
 */
export function resolveBaseUrl(doc: OpenAPIDocument, options: GenerateOptions): string {
  const explicit = options.baseUrl?.trim();
  if (explicit) return explicit;

  const fromDocument = doc.servers?.find((server) => typeof server?.url === "string" && server.url.trim().length > 0);
  if (fromDocument?.url) return fromDocument.url.trim();

  return DEFAULT_BASE_URL;
}

/**
 * Run the deterministic part of the pipeline: document in, file contents out.
 *
 * Split out from {@link generateFromOpenAPI} so the emitters can be exercised against
 * an in-memory document, which is how the determinism test compares two runs without
 * any filesystem involvement.
 */
export function renderDocument(doc: OpenAPIDocument, options: GenerateOptions = {}): GenerateResult {
  const warnings: string[] = [];
  const registry = new TypeRegistry(warnings);

  const operations: NormalizedOperation[] = buildOperations(doc, {
    tags: options.tags,
    excludeTags: options.excludeTags
  });
  const groups = groupOperations(operations, tagDescriptionsOf(doc));

  if (groups.length === 0) {
    warnings.push("no operations matched the document and tag filters; only the service scaffold was emitted.");
  }

  const files: GenerateFile[] = [];

  // API files first: rendering an operation is what registers its inline payload
  // schemas, and the type files below can only be written once those names exist.
  for (const group of groups) {
    const ctx = createTypeContext({
      doc,
      registry,
      warnings,
      file: typesFileKey(group),
      // Empty on purpose: every payload name is derived from the operation and the
      // role it plays (`GetPetByIdResponse`), never from the class it happens to
      // appear in.
      nameHint: ""
    });
    files.push({ path: `apis/${group.fileName}`, contents: renderApiFile(group, ctx) });
  }

  files.push({
    path: "service.ts",
    contents: renderServiceFile({ baseUrl: resolveBaseUrl(doc, options), name: options.name })
  });
  files.push({ path: "index.ts", contents: renderBarrelFile(groups) });

  const typeFiles = renderTypeFiles(registry, doc, warnings);
  files.push(...typeFiles);

  if (typeFiles.length > 0) {
    files.push({
      path: "types/index.ts",
      contents: renderTypesBarrelFile(typeFiles.map((file) => typesFileName(file.path)))
    });
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { files, warnings };
}

/** `types/pet.ts` → `pet`. */
function typesFileName(path: string): string {
  return path.replace(/^types\//, "").replace(/\.ts$/, "");
}

/** Render one file per tag that owns at least one declaration. */
function renderTypeFiles(
  registry: TypeRegistry,
  doc: OpenAPIDocument,
  warnings: string[]
): GenerateFile[] {
  const byFile = new Map<string, TypeDeclaration[]>();
  for (const declaration of registry.all()) {
    const bucket = byFile.get(declaration.file);
    if (bucket) bucket.push(declaration);
    else byFile.set(declaration.file, [declaration]);
  }

  return [...byFile.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((file) => {
      const ctx = createTypeContext({ doc, registry, warnings, file, nameHint: file });
      const contents = renderTypeFile(byFile.get(file) ?? [], ctx);
      return { path: `types/${file}.ts`, contents };
    });
}

/**
 * Generate every file for a document, without touching the filesystem.
 *
 * `input` may be a path or an already-parsed document, so a build script that fetched
 * the spec (or embedded it) never has to write a temp file.
 */
export async function generateFromOpenAPI(
  input: string | OpenAPIDocument,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const doc = loadOpenAPIDocument(input);
  return renderDocument(doc, options);
}

/** How a {@link GenerateResult} should be written. */
export interface WriteOptions {
  /** Delete previously generated files below `outDir` before writing. */
  clean?: boolean;
  /** Used to report what happened; defaults to a silent logger for library callers. */
  logger?: Logger;
}

/**
 * Write a {@link GenerateResult} to disk and return the paths written.
 *
 * Paths are always relative-joined onto `outDir`; the generator never emits an
 * absolute path or a `..` segment, so the output cannot escape the directory the user
 * asked for. With `clean`, only files carrying the generated header are removed —
 * hand-written siblings in the same directory survive.
 */
export async function writeGenerated(
  result: GenerateResult,
  outDir: string,
  options: WriteOptions = {}
): Promise<string[]> {
  const logger = options.logger ?? createLogger({ level: "silent" });

  if (options.clean) {
    const removed = removeGeneratedFiles(outDir, GENERATED_HEADER);
    logger.debug(`clean: removed ${removed.length} generated file(s) below ${outDir}`);
  }

  const written: string[] = [];
  for (const file of result.files) {
    const target = join(outDir, file.path);
    writeTextFile(target, file.contents);
    written.push(target);
    logger.debug(`wrote ${target}`);
  }

  return written;
}

// ── pipeline, exported for reuse and for tests ───────────────────────────────

export { GENERATED_HEADER } from "./emit/format.js";
export { readOpenAPIDocument, parseOpenAPIDocument, loadOpenAPIDocument, OpenAPIError } from "./openapi/load.js";
export {
  collectReferencedNames,
  componentSchemas,
  dereferenceSchema,
  isReference,
  mergeObjectShape,
  resolveLocalReference,
  typeIncludesNull
} from "./openapi/resolve.js";
export {
  buildOperations,
  deriveOperationId,
  groupOperations,
  stripPathPrefix,
  tagDescriptionsOf,
  toExpressPath
} from "./openapi/operations.js";
export {
  collectProperties,
  createTypeContext,
  renderAdditionalProperties,
  renderEnumUnion,
  renderPayloadType,
  renderSchemaType,
  resolveSchema,
  schemaNotes,
  TypeRegistry,
  withNameHint
} from "./openapi/schema.js";
export { renderApiFile } from "./emit/api.js";
export { renderBarrelFile } from "./emit/index.js";
export { renderServiceFile } from "./emit/service.js";
export { renderTypeFile, renderTypesBarrelFile } from "./emit/type.js";
export { createLogger, createSilentLogger, resolveLogLevel } from "./logger.js";
export {
  camelCase,
  formatPropertyKey,
  kebabCase,
  longestPathPrefix,
  pascalCase,
  splitWords,
  toIdentifier,
  toTypeIdentifier,
  uniqueIdentifier
} from "./utils/naming.js";
export { removeGeneratedFiles, hasGeneratedMarker, listFiles } from "./utils/fs.js";

export type { OpenAPIDocument, HttpMethod, SchemaObject, ReferenceObject } from "./openapi/types.js";
export type { DereferencedSchema, ObjectShape, ResolvedReference } from "./openapi/resolve.js";
export type {
  GroupedOperation,
  NormalizedBody,
  NormalizedOperation,
  NormalizedParameter,
  NormalizedResponse,
  OperationGroup,
  ParameterSource
} from "./openapi/operations.js";
export type { PropertyModel, TypeDeclaration, TypeRenderContext } from "./openapi/schema.js";
export type { LogLevel, Logger } from "./logger.js";
export type { ServiceRenderOptions } from "./emit/service.js";
