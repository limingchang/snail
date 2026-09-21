import type { SnailContext } from "../../core/context";

/**
 * 版本管理插件把版本写到出站请求的哪个位置。
 *
 * `"custom"` 之所以存在，是因为没有一份固定的传输方式清单能覆盖所有后端：有的网关要
 * `Accept: application/vnd.acme.v2+json`，有的则要把版本放进请求体。自定义提取器接收
 * 实时上下文并返回要合并的补丁，而不是靠猜。
 *
 * Where the versioning plugin writes the version on the outgoing request.
 *
 * `"custom"` exists because no fixed list of transports covers every backend:
 * some gateways want `Accept: application/vnd.acme.v2+json`, some want the
 * version inside the body. A custom extractor receives the live context and
 * returns the patch to merge instead of guessing.
 */
export type VersioningType = "url" | "header" | "query" | "custom";

/**
 * `custom` 提取器请求的改动。
 *
 * 每个字段都是可选的：只改请求头的提取器，不应该被迫重述它刚从 `ctx.request` 读到的 url。
 *
 * The change a `custom` extractor asks for.
 *
 * Every field is optional: an extractor that only touches headers must not be
 * forced to restate the url it read from `ctx.request`.
 */
export interface VersioningPatch {
  /**
   * 请求 url 的替换值，原样使用。
   *
   * Replacement for the request url, used verbatim.
   */
  url?: string;

  /**
   * 合并进出站请求的请求头。
   *
   * Headers to merge into the outgoing request.
   */
  headers?: Record<string, string>;

  /**
   * 合并进出站请求的 query 参数。
   *
   * Query params to merge into the outgoing request.
   */
  params?: Record<string, unknown>;
}

/**
 * `Versioning` 插件工厂接受的选项。
 *
 * Options accepted by the `Versioning` plugin factory.
 */
export interface VersioningOptions {
  /**
   * 版本所走的传输方式。
   *
   * Transport the version travels on.
   */
  type: VersioningType;

  /**
   * 方法与 api 类都没有声明版本时使用的版本。
   *
   * 刻意设为必填：默认版本是与后端之间的契约，默默假设 `"1.0.0"` 会产生看起来像路由 bug
   * 的 404。
   *
   * Version used when neither the method nor the api class declares one.
   *
   * Required on purpose: a default version is a contract with the backend, and
   * silently assuming `"1.0.0"` produces 404s that look like routing bugs.
   */
  defaultVersion: string;

  /**
   * 键名或 url 段名。
   *
   * `url`/`query` 默认 `"v"`（于是 `/user/1` 变成 `/v1.2.0/user/1`），`header` 默认
   * `"x-api-version"`。在 `url` 模式下传 `""` 可得到裸的 `/1.2.0/user/1` 段。
   *
   * Key or url segment name.
   *
   * Defaults to `"v"` for `url`/`query` (so `/user/1` becomes `/v1.2.0/user/1`)
   * and to `"x-api-version"` for `header`. Pass `""` in `url` mode for a bare
   * `/1.2.0/user/1` segment.
   */
  key?: string;

  /**
   * 仅用于 `type: "custom"`。接收解析出的版本与实时上下文。
   *
   * Only for `type: "custom"`. Receives the resolved version and the live context.
   */
  extractor?: (version: string, ctx: SnailContext) => VersioningPatch | void;
}
