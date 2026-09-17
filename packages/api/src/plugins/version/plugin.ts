import { AxiosHeaders } from "axios";
import { SnailPluginError } from "../../error/plugin";
import { createPlugin } from "../../core/plugin";
import { t } from "../../locale";
import { isPlainObject } from "../../utils/is";
import { isAbsoluteURL } from "../../utils/url";
import { resolveDeclaredVersion } from "./decorators";
import type { SnailContext } from "../../core/context";
import type { VersioningOptions, VersioningPatch, VersioningType } from "./type";

/**
 * Version management plugin.
 *
 * ## What it rewrites
 *
 * Only the live request on the context — never `server.defaults.baseURL`, never
 * the shared axios instance.
 *
 * The pre-rewrite implementation baked the version into the server's `baseURL`
 * the first time any request ran. That leaked: the first method to run decided
 * the version of every later request on that server, so calling a `v2` endpoint
 * once silently moved the whole application to `v2`. Resolving the version per
 * request from the method/class metadata makes that unrepresentable.
 *
 * ## Priority
 *
 * `50` — inside the reserved version band. It runs after an interceptor (`100`)
 * so it sees the url the interceptor produced, and before the cache (`-100`) so
 * the cache hashes the versioned url instead of a url that changes under it.
 */

/**
 * Default key or url segment name per transport.
 *
 * `url` keeps the conventional `v` marker, so a bare
 * `Versioning({ type: "url", defaultVersion: "1.0.0" })` turns `/user/1` into
 * `/v1.0.0/user/1`. Pass `key: ""` for a bare `/1.0.0/user/1` segment.
 */
const DEFAULT_KEYS: Record<Exclude<VersioningType, "custom">, string> = {
  url: "v",
  header: "x-api-version",
  query: "v"
};

/** Options after defaults are applied, so the hot path never re-reads them. */
interface ResolvedVersioning {
  type: VersioningType;
  defaultVersion: string;
  key: string;
  extractor?: VersioningOptions["extractor"];
}

/**
 * Validate and normalise the factory options.
 *
 * Runs once per server, inside `setup`. Throwing here rolls the registration back,
 * so a misconfigured plugin is never half-installed and silently doing nothing.
 */
function resolveVersioningOptions(
  options: VersioningOptions | undefined
): ResolvedVersioning {
  const type = options?.type ?? "url";

  if (type !== "url" && type !== "header" && type !== "query" && type !== "custom") {
    throw new SnailPluginError(
      `[snail] Versioning() received an unknown type "${String(type)}"`,
      { pluginName: "versioning" }
    );
  }

  const defaultVersion = options?.defaultVersion;
  if (typeof defaultVersion !== "string" || defaultVersion.length === 0) {
    throw new SnailPluginError(
      "[snail] Versioning() requires a non-empty `defaultVersion`",
      { pluginName: "versioning" }
    );
  }

  if (type === "custom" && typeof options?.extractor !== "function") {
    throw new SnailPluginError(
      '[snail] Versioning({ type: "custom" }) requires an `extractor` function',
      { pluginName: "versioning" }
    );
  }

  return {
    type,
    defaultVersion,
    key:
      type === "custom"
        ? (options?.key ?? "")
        : (options?.key ?? DEFAULT_KEYS[type]),
    extractor: options?.extractor
  };
}

/**
 * The mutable header bag of the request, created when a plugin or a decorator
 * has not produced an `AxiosHeaders` yet.
 */
function headerBag(ctx: SnailContext): AxiosHeaders {
  if (!(ctx.request.headers instanceof AxiosHeaders)) {
    ctx.request.headers = AxiosHeaders.from(ctx.request.headers ?? {});
  }
  return ctx.request.headers;
}

/** `true` when `segment` already is one of the url's path segments. */
function hasSegment(url: string, segment: string): boolean {
  const path = url.split(/[?#]/, 1)[0] ?? "";
  return path.split("/").includes(segment);
}

/**
 * Prepend `<key><version>` as the first path segment.
 *
 * Absolute urls are left untouched — prefixing them would corrupt the host — and
 * a url that already carries the segment is returned as-is, so a method whose path
 * hard-codes the version is not rewritten twice.
 */
function applyURLVersion(url: string, version: string, key: string): string {
  const segment = `${key}${version}`;
  if (isAbsoluteURL(url) || hasSegment(url, segment)) return url;
  if (url.length === 0) return `/${segment}`;
  return `/${segment}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Write the version header, replacing any value the caller already set. */
function applyHeaderVersion(ctx: SnailContext, version: string, key: string): void {
  headerBag(ctx).set(key, version);
}

/** Merge the version into the query params without dropping the existing ones. */
function applyQueryVersion(ctx: SnailContext, version: string, key: string): void {
  const current = ctx.request.params;
  ctx.request.params = {
    ...(isPlainObject(current) ? current : {}),
    [key]: version
  };
}

/** Delegate to the caller's extractor and merge whatever patch it returns. */
function applyCustomVersion(
  ctx: SnailContext,
  version: string,
  extractor: NonNullable<VersioningOptions["extractor"]>
): void {
  const patch = extractor(version, ctx) as VersioningPatch | void;
  if (!patch) return;

  if (typeof patch.url === "string") ctx.request.url = patch.url;

  if (patch.headers) {
    const headers = headerBag(ctx);
    for (const [key, value] of Object.entries(patch.headers)) {
      headers.set(key, value);
    }
  }

  if (patch.params) {
    const current = ctx.request.params;
    ctx.request.params = {
      ...(isPlainObject(current) ? current : {}),
      ...patch.params
    };
  }
}

/**
 * Resolve the effective version and rewrite the live request.
 *
 * The default version is applied too, not skipped: the backend wants `/v1.0.0`
 * for an undeclared method, and nothing else in the pipeline knows that. Only the
 * *logging* distinguishes an explicit version from the default.
 */
function applyVersion(ctx: SnailContext, options: ResolvedVersioning): void {
  const version =
    resolveDeclaredVersion(ctx.apiClass, ctx.methodName) ?? options.defaultVersion;

  if (version !== options.defaultVersion) {
    ctx.logger.info(t("info.version.change", ctx.fullName, version));
    ctx.logger.warn(
      t("warn.version.change", ctx.fullName, options.defaultVersion, version)
    );
  }

  switch (options.type) {
    case "url":
      ctx.request.url = applyURLVersion(
        ctx.request.url ?? ctx.route,
        version,
        options.key
      );
      return;
    case "header":
      applyHeaderVersion(ctx, version, options.key);
      return;
    case "query":
      applyQueryVersion(ctx, version, options.key);
      return;
    case "custom":
      applyCustomVersion(ctx, version, options.extractor!);
      return;
  }
}

/**
 * Create the version management plugin.
 *
 * ```ts
 * Service.use(Versioning({ type: "url", defaultVersion: "1.0.0" }));
 * ```
 *
 * The rewrite happens in `beforeRequest`, so it is the last thing that can change
 * the url before the request is hashed, cached and sent.
 */
export const Versioning = createPlugin<VersioningOptions>({
  name: "versioning",
  priority: 50,

  setup(options) {
    const resolved = resolveVersioningOptions(options);

    return {
      beforeRequest(ctx, next) {
        applyVersion(ctx, resolved);
        return next();
      }
    };
  }
});
