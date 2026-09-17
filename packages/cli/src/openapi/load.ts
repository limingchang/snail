/**
 * Read and parse an OpenAPI 3.0 / 3.1 document.
 *
 * ## Why JSON and YAML take different code paths
 *
 * JSON is a subset of YAML, so a single `parseYaml` call would technically handle
 * both — and produce YAML-flavoured errors ("unexpected end of the stream within a
 * flow node") for a JSON file with a trailing comma, pointing the user at a line
 * that looks fine. Branching on the extension (and on a leading `{`) buys readable
 * diagnostics for the overwhelmingly common `.json` case while still accepting
 * `.yaml` / `.yml`.
 *
 * ## Why the version is checked here
 *
 * Everything downstream assumes `paths`, `components` and `responses` exist, and a
 * Swagger 2.0 document has none of those in that shape. Failing at load time with
 * "this looks like Swagger 2.0" is far cheaper to act on than an empty `src/apis`.
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { OpenAPIDocument } from "./types.js";

/** Raised for anything that makes the document unusable at the pipeline's entry. */
export class OpenAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAPIError";
  }
}

/** True when the text is JSON rather than YAML. */
function looksLikeJson(text: string): boolean {
  const head = text.replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("{") || head.startsWith("[");
}

/**
 * Parse document text.
 *
 * `source` is only used in messages — a parse failure that does not name the file
 * is a support ticket waiting to happen.
 */
export function parseOpenAPIDocument(text: string, source: string): OpenAPIDocument {
  const trimmed = text.replace(/^\uFEFF/, "");
  if (trimmed.trim().length === 0) {
    throw new OpenAPIError(`${source} is empty.`);
  }

  const useJson = extname(source).toLowerCase() === ".json" || looksLikeJson(trimmed);

  let parsed: unknown;
  try {
    parsed = useJson ? JSON.parse(trimmed) : parseYaml(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OpenAPIError(`cannot parse ${source} as ${useJson ? "JSON" : "YAML"}: ${reason}`);
  }

  return assertOpenAPIDocument(parsed, source);
}

/**
 * Shape-check a parsed value.
 *
 * Deliberately shallow. The goal is to catch "you pointed `--input` at the wrong
 * file" and "this is Swagger 2.0", not to re-implement schema validation — a
 * half-valid document still generates useful code.
 */
export function assertOpenAPIDocument(value: unknown, source: string): OpenAPIDocument {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new OpenAPIError(`${source} is not an OpenAPI document (expected a JSON object).`);
  }

  const document = value as OpenAPIDocument;

  if (typeof document.swagger === "string" && !document.openapi) {
    throw new OpenAPIError(
      `${source} declares Swagger ${document.swagger}; only OpenAPI 3.0 and 3.1 are supported.`
    );
  }

  if (typeof document.openapi !== "string") {
    throw new OpenAPIError(
      `${source} has no "openapi" field, so it cannot be identified as an OpenAPI 3 document.`
    );
  }

  if (!document.openapi.startsWith("3.")) {
    throw new OpenAPIError(
      `${source} declares OpenAPI ${document.openapi}; only 3.0 and 3.1 are supported.`
    );
  }

  if (document.paths === undefined || document.paths === null) {
    throw new OpenAPIError(`${source} has no "paths" object, so there is nothing to generate.`);
  }

  if (typeof document.paths !== "object" || Array.isArray(document.paths)) {
    throw new OpenAPIError(`${source} has a "paths" field that is not an object.`);
  }

  return document;
}

/** Read and parse a document from disk. */
export function readOpenAPIDocument(filePath: string): OpenAPIDocument {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OpenAPIError(`cannot read OpenAPI document "${filePath}": ${reason}`);
  }

  return parseOpenAPIDocument(text, filePath);
}

/**
 * Accept either a path or an already-parsed document.
 *
 * The programmatic API takes both so a build script that fetched the spec over the
 * network (or embedded it) never has to round-trip through a temp file.
 */
export function loadOpenAPIDocument(input: string | OpenAPIDocument): OpenAPIDocument {
  if (typeof input === "string") {
    return readOpenAPIDocument(input);
  }

  return assertOpenAPIDocument(input, "<inline document>");
}
