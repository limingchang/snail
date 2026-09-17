import type { SnailContext } from "../../core/context";

/**
 * Where the versioning plugin writes the version on the outgoing request.
 *
 * `"custom"` exists because no fixed list of transports covers every backend:
 * some gateways want `Accept: application/vnd.acme.v2+json`, some want the
 * version inside the body. A custom extractor receives the live context and
 * returns the patch to merge instead of guessing.
 */
export type VersioningType = "url" | "header" | "query" | "custom";

/**
 * The change a `custom` extractor asks for.
 *
 * Every field is optional: an extractor that only touches headers must not be
 * forced to restate the url it read from `ctx.request`.
 */
export interface VersioningPatch {
  /** Replacement for the request url, used verbatim. */
  url?: string;

  /** Headers to merge into the outgoing request. */
  headers?: Record<string, string>;

  /** Query params to merge into the outgoing request. */
  params?: Record<string, unknown>;
}

/** Options accepted by the `Versioning` plugin factory. */
export interface VersioningOptions {
  /** Transport the version travels on. */
  type: VersioningType;

  /**
   * Version used when neither the method nor the api class declares one.
   *
   * Required on purpose: a default version is a contract with the backend, and
   * silently assuming `"1.0.0"` produces 404s that look like routing bugs.
   */
  defaultVersion: string;

  /**
   * Key or url segment name.
   *
   * Defaults to `"v"` for `url`/`query` (so `/user/1` becomes `/v1.2.0/user/1`)
   * and to `"x-api-version"` for `header`. Pass `""` in `url` mode for a bare
   * `/1.2.0/user/1` segment.
   */
  key?: string;

  /** Only for `type: "custom"`. Receives the resolved version and the live context. */
  extractor?: (version: string, ctx: SnailContext) => VersioningPatch | void;
}
