/**
 * Metadata keys used by every `@snail-js/api` decorator.
 *
 * `Symbol.for` is used instead of plain `Symbol()` on purpose: a monorepo can
 * easily end up with two copies of this package (one hoisted for the app, one
 * nested under a dependency). Global symbol registration keeps both copies
 * reading and writing the *same* metadata slots.
 */

/** `@Server(...)` options, stored on the server class. */
export const SNAIL_SERVER_OPTIONS = Symbol.for("@snail-js/api:server-options");

/** `@Api(...)` options, stored on the api class. */
export const SNAIL_API_OPTIONS = Symbol.for("@snail-js/api:api-options");

/** `@Get(...)` / `@Post(...)` / … options, stored per method. */
export const SNAIL_REQUEST_METHOD = Symbol.for("@snail-js/api:request-method");

/** `@Params()` / `@Query()` / `@Data()` parameter descriptors, stored per method. */
export const SNAIL_PARAMS = Symbol.for("@snail-js/api:params");

/** `@Header(...)` records, stored on the api class and per method. */
export const SNAIL_HEADERS = Symbol.for("@snail-js/api:headers");

/** `@UploadProgress(...)` callback, stored per method. */
export const SNAIL_UPLOAD_PROGRESS = Symbol.for("@snail-js/api:upload-progress");

/** `@DownloadProgress(...)` callback, stored per method. */
export const SNAIL_DOWNLOAD_PROGRESS = Symbol.for("@snail-js/api:download-progress");

/** `@Sse(...)` options, stored on the stream class. */
export const SNAIL_SSE_OPTIONS = Symbol.for("@snail-js/api:sse-options");

/** `@SseEvent(...)` / `@OnSseOpen()` / `@OnSseError()` handlers, stored on the stream class. */
export const SNAIL_SSE_HANDLERS = Symbol.for("@snail-js/api:sse-handlers");

/** `@WebSocket(...)` options, stored on the stream class. */
export const SNAIL_WS_OPTIONS = Symbol.for("@snail-js/api:ws-options");

/** `@OnWsOpen()` / `@OnWsMessage()` / … handlers, stored on the stream class. */
export const SNAIL_WS_HANDLERS = Symbol.for("@snail-js/api:ws-handlers");

/** `@HttpStream(...)` options, stored per method. */
export const SNAIL_HTTP_STREAM = Symbol.for("@snail-js/api:http-stream");

/**
 * Prefix reserved for third-party decorators built with
 * {@link createParamDecorator} and friends.
 *
 * Plugin authors should namespace their key, e.g.
 * `Symbol.for("@acme/snail-plugin:tenant")`, so two plugins can never collide.
 */
export const SNAIL_CUSTOM_KEY_PREFIX = "@snail-js/api:custom:";
