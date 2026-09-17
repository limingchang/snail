import { isPlainObject } from "./is";

/** Uppercase the first character, leaving the rest untouched. */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/** `true` when the url carries its own scheme or protocol-relative prefix. */
export function isAbsoluteURL(url: string): boolean {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

/** Drop trailing slashes without touching a bare `"/"`. */
function trimEndSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Drop leading slashes, keeping a bare `"/"` intact. */
function trimStartSlash(url: string): string {
  return url.replace(/^\/+/, "");
}

/**
 * Join url segments into one path, normalising the slashes between them.
 *
 * An absolute `segment` wins outright, matching axios' `baseURL` semantics.
 *
 * ```ts
 * joinURL("/api/", "/user/", "/list") // "/api/user/list"
 * joinURL("/api", "https://cdn.x/y")  // "https://cdn.x/y"
 * ```
 */
export function joinURL(...segments: Array<string | undefined | null>): string {
  const parts = segments.filter(
    (segment): segment is string => typeof segment === "string" && segment.length > 0
  );
  if (parts.length === 0) return "";

  let result = parts[0]!;
  for (const part of parts.slice(1)) {
    if (isAbsoluteURL(part)) {
      result = part;
      continue;
    }
    if (result.length === 0) {
      result = part;
      continue;
    }
    result = `${trimEndSlash(result)}/${trimStartSlash(part)}`;
  }

  // Preserve a meaningful leading slash, collapse any accidental duplicates.
  return result.replace(/([^:]\/)\/+/g, "$1");
}

/** Matches `:id` style placeholders, ignoring a leading `::` escape. */
const PATH_PARAM_PATTERN = /:([A-Za-z_$][\w$]*)/g;

/** Names of every `:placeholder` present in a route template. */
export function pathParamNames(route: string): string[] {
  const names: string[] = [];
  for (const match of route.matchAll(PATH_PARAM_PATTERN)) {
    names.push(match[1]!);
  }
  return names;
}

/**
 * Substitute `:placeholder` segments with values.
 *
 * Values are URL-encoded. A placeholder with no value throws, because silently
 * leaving `:id` in a request path produces a confusing 404 far from the cause —
 * the pre-rewrite code logged to `console.error` and then threw anyway.
 */
export function replacePathParams(
  route: string,
  values: Record<string, unknown>,
  onMissing?: (name: string) => never
): string {
  return route.replace(PATH_PARAM_PATTERN, (match, name: string) => {
    const value = values[name];
    if (value === undefined || value === null) {
      if (onMissing) onMissing(name);
      return match;
    }
    return encodeURIComponent(String(value));
  });
}

/** Build a full url, appending absolute urls verbatim. */
export function buildRequestURL(baseURL: string, url: string): string {
  if (isAbsoluteURL(url)) return url;
  return joinURL(baseURL, url);
}

/** Strip the query string and hash, for logging. */
export function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0]!;
}

/**
 * Deterministic, recursively stable JSON serialisation.
 *
 * Object keys are sorted so two logically identical payloads always produce the
 * same string — essential for cache keys and for request de-duplication.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (input: unknown): string => {
    if (input === null) return "null";

    const type = typeof input;
    if (type === "number") return Number.isFinite(input as number) ? String(input) : "null";
    if (type === "boolean") return String(input);
    if (type === "bigint") return `"${String(input)}"`;
    if (type === "string") return JSON.stringify(input);
    if (type === "undefined") return "undefined";
    if (type === "function" || type === "symbol") return "undefined";

    if (input instanceof Date) return `"${input.toISOString()}"`;
    if (input instanceof RegExp) return `"${input.toString()}"`;

    if (Array.isArray(input)) {
      return `[${input.map(walk).join(",")}]`;
    }

    if (isPlainObject(input)) {
      const object = input as Record<string, unknown>;
      if (seen.has(object)) return '"[Circular]"';
      seen.add(object);
      const body = Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${walk(object[key])}`)
        .join(",");
      seen.delete(object);
      return `{${body}}`;
    }

    return JSON.stringify(String(input));
  };

  return walk(value);
}

/**
 * 32-bit FNV-1a hash rendered as base36.
 *
 * Cheap, allocation-light and stable across runs — used to turn a long request
 * signature into a compact in-memory cache key. It is *not* a security hash.
 */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
