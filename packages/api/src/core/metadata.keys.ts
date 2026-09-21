/**
 * `@snail-js/api` 所有装饰器共用的元数据键。
 *
 * 这里刻意使用 `Symbol.for` 而不是普通的 `Symbol()`：monorepo 很容易出现这个包的
 * 两份副本（一份提升给应用，一份嵌在某个依赖下面）。全局符号注册能让两份副本读写
 * **同一批**元数据槽位。
 *
 * Metadata keys used by every `@snail-js/api` decorator.
 *
 * `Symbol.for` is used instead of plain `Symbol()` on purpose: a monorepo can
 * easily end up with two copies of this package (one hoisted for the app, one
 * nested under a dependency). Global symbol registration keeps both copies
 * reading and writing the *same* metadata slots.
 */

/**
 * `@Server(...)` 的选项，存放在服务器类上。
 *
 * `@Server(...)` options, stored on the server class.
 */
export const SNAIL_SERVER_OPTIONS = Symbol.for("@snail-js/api:server-options");

/**
 * `@Api(...)` 的选项，存放在 api 类上。
 *
 * `@Api(...)` options, stored on the api class.
 */
export const SNAIL_API_OPTIONS = Symbol.for("@snail-js/api:api-options");

/**
 * `@Get(...)` / `@Post(...)` 等方法的选项，按方法存放。
 *
 * `@Get(...)` / `@Post(...)` / … options, stored per method.
 */
export const SNAIL_REQUEST_METHOD = Symbol.for("@snail-js/api:request-method");

/**
 * `@Params()` / `@Query()` / `@Data()` 的参数描述符，按方法存放。
 *
 * `@Params()` / `@Query()` / `@Data()` parameter descriptors, stored per method.
 */
export const SNAIL_PARAMS = Symbol.for("@snail-js/api:params");

/**
 * `@Header(...)` 记录，存放在 api 类上以及各个方法上。
 *
 * `@Header(...)` records, stored on the api class and per method.
 */
export const SNAIL_HEADERS = Symbol.for("@snail-js/api:headers");

/**
 * `@UploadProgress(...)` 回调，按方法存放。
 *
 * `@UploadProgress(...)` callback, stored per method.
 */
export const SNAIL_UPLOAD_PROGRESS = Symbol.for("@snail-js/api:upload-progress");

/**
 * `@DownloadProgress(...)` 回调，按方法存放。
 *
 * `@DownloadProgress(...)` callback, stored per method.
 */
export const SNAIL_DOWNLOAD_PROGRESS = Symbol.for("@snail-js/api:download-progress");

/**
 * `@Sse(...)` 的选项，存放在流类上。
 *
 * `@Sse(...)` options, stored on the stream class.
 */
export const SNAIL_SSE_OPTIONS = Symbol.for("@snail-js/api:sse-options");

/**
 * `@SseEvent(...)` / `@OnSseOpen()` / `@OnSseError()` 处理器，存放在流类上。
 *
 * `@SseEvent(...)` / `@OnSseOpen()` / `@OnSseError()` handlers, stored on the stream class.
 */
export const SNAIL_SSE_HANDLERS = Symbol.for("@snail-js/api:sse-handlers");

/**
 * `@WebSocket(...)` 的选项，存放在流类上。
 *
 * `@WebSocket(...)` options, stored on the stream class.
 */
export const SNAIL_WS_OPTIONS = Symbol.for("@snail-js/api:ws-options");

/**
 * `@OnWsOpen()` / `@OnWsMessage()` 等处理器，存放在流类上。
 *
 * `@OnWsOpen()` / `@OnWsMessage()` / … handlers, stored on the stream class.
 */
export const SNAIL_WS_HANDLERS = Symbol.for("@snail-js/api:ws-handlers");

/**
 * `@HttpStream(...)` 的选项，按方法存放。
 *
 * `@HttpStream(...)` options, stored per method.
 */
export const SNAIL_HTTP_STREAM = Symbol.for("@snail-js/api:http-stream");

/**
 * 预留给用 {@link createParamDecorator} 等工厂构建的第三方装饰器的前缀。
 *
 * 插件作者应给自己的键加命名空间，例如
 * `Symbol.for("@acme/snail-plugin:tenant")`，这样两个插件永远不会撞车。
 *
 * Prefix reserved for third-party decorators built with
 * {@link createParamDecorator} and friends.
 *
 * Plugin authors should namespace their key, e.g.
 * `Symbol.for("@acme/snail-plugin:tenant")`, so two plugins can never collide.
 */
export const SNAIL_CUSTOM_KEY_PREFIX = "@snail-js/api:custom:";
