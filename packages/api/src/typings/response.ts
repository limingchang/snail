/**
 * 响应类型定义。
 *
 * 本库假定每个 JSON 端点都以标准信封作答，默认是
 * `{ "code": 0, "message": "ok", "data": {} }`。信封的 *形状* 与 *键名* 都可以
 * 覆盖：形状通过模块增强 `SnailEnvelopeSchema` 实现，键名通过
 * `@Server({ codeKey, messageKey, dataKey })` 指定。
 *
 * 本模块刻意只包含类型：可以安全地 `import type`，且不会给运行时产物增加任何
 * 东西。
 *
 * Response typing.
 *
 * The library assumes every JSON endpoint answers with a standard envelope:
 *
 * ```json
 * { "code": 0, "message": "ok", "data": {} }
 * ```
 *
 * Both the *shape* and the *key names* are overridable.
 *
 * ## Overriding the shape
 *
 * The default envelope is `SnailEnvelopeSchema`, which is module-augmentable:
 *
 * ```ts
 * // app/env.d.ts
 * declare module "@snail-js/api" {
 *   interface SnailEnvelopeSchema {
 *     status: number;
 *     msg: string;
 *     result: unknown;
 *   }
 * }
 * ```
 *
 * ## Overriding the key names
 *
 * ```ts
 * @Server({
 *   baseURL: "/api",
 *   codeKey: "status",
 *   messageKey: "msg",
 *   dataKey: "result"
 * })
 * class BackEnd extends SnailServer<SnailEnvelopeSchema, "result", "status", "msg"> {}
 * ```
 *
 * This module is types-only on purpose: it is safe to `import type` from, and it
 * contributes nothing to the runtime bundle.
 */

/**
 * 假定每个 JSON 端点都会返回的信封。
 *
 * 增强这个接口即可为整个应用重塑默认信封。
 *
 * The envelope every JSON endpoint is assumed to return.
 *
 * Augment this interface to reshape the default for the whole application.
 */
export interface SnailEnvelopeSchema {
  /**
   * 业务状态码。
   *
   * Business status code.
   */
  code: number;
  /**
   * 人类可读的消息。
   *
   * Human readable message.
   */
  message: string;
  /**
   * 实际载荷。
   *
   * The actual payload.
   */
  data: unknown;
}

/**
 * 读取信封时使用的键名。
 *
 * Key names used to read the envelope.
 */
export interface SnailResponseKeys {
  /**
   * 存放业务状态码的键。默认为 `"code"`。
   *
   * Key holding the business status code. Defaults to `"code"`.
   */
  code: string;
  /**
   * 存放人类可读消息的键。默认为 `"message"`。
   *
   * Key holding the human readable message. Defaults to `"message"`.
   */
  message: string;
  /**
   * 存放实际载荷的键。默认为 `"data"`。
   *
   * Key holding the actual payload. Defaults to `"data"`.
   */
  data: string;
}

/**
 * 完全绕过信封的载荷。
 *
 * `blob` / `arraybuffer` / `stream` 响应没有 `code`/`message`/`data`，因此这类
 * 请求的类型化结果就是响应体本身。
 *
 * Payloads that bypass the envelope entirely.
 *
 * A `blob` / `arraybuffer` / `stream` response has no `code`/`message`/`data`,
 * so the typed result of such a request is the body itself.
 */
export type SnailRawPayload =
  | Blob
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | FormData
  | Document;

/**
 * 当 `T` 是直通载荷而不是 JSON 信封时为 `true`。
 *
 * `true` when `T` is a pass-through payload rather than a JSON envelope.
 */
export type IsRawPayload<T> = T extends SnailRawPayload ? true : false;

/**
 * 载荷类型为 `T` 时的完整信封；当 `T` 是原始直通载荷时就是 `T` 本身。
 *
 * The full envelope for a payload of type `T`, or `T` itself when `T` is a raw
 * pass-through payload.
 */
export type SnailEnvelope<S, T, D extends string = "data"> =
  IsRawPayload<T> extends true
    ? T
    : S extends Record<string, any>
      ? S & Record<D, T>
      : Record<D, T>;

/**
 * 业务状态码的类型；能推导时从信封中推导。
 *
 * Business status code type, derived from the envelope when possible.
 */
export type SnailCodeOf<S, C extends string = "code"> = C extends keyof S
  ? S[C]
  : number | string | undefined;

/**
 * 业务消息的类型；能推导时从信封中推导。
 *
 * Business message type, derived from the envelope when possible.
 */
export type SnailMessageOf<S, M extends string = "message"> = M extends keyof S
  ? S[M]
  : string | undefined;

/**
 * 每次 `send()` resolve 出来的结果。
 *
 * 它刻意比旧 API 的裸信封更丰富：`data` 已经拆包（几乎总是你真正想要的），而
 * `envelope` 与 `response` 仍然保留，供其他场景使用。
 *
 * What every `send()` resolves to.
 *
 * Deliberately richer than the old API's bare envelope: `data` is already
 * unwrapped (the thing you want almost always) while `envelope` and `response`
 * stay available for everything else.
 */
export interface SnailResult<
  S = SnailEnvelopeSchema,
  T = unknown,
  D extends string = "data",
  C extends string = "code",
  M extends string = "message"
> {
  /**
   * 原始 axios 响应。
   *
   * The raw axios response.
   */
  response: import("axios").AxiosResponse<SnailEnvelope<S, T, D>>;
  /**
   * 解析后的后端信封（默认是 `{ code, message, data }`）。
   *
   * The parsed backend envelope (`{ code, message, data }` by default).
   */
  envelope: SnailEnvelope<S, T, D>;
  /**
   * 拆包后的载荷 —— `envelope[dataKey]`。
   *
   * The unwrapped payload — `envelope[dataKey]`.
   */
  data: T;
  /**
   * 业务状态码 —— `envelope[codeKey]`。
   *
   * Business code — `envelope[codeKey]`.
   */
  code: SnailCodeOf<S, C>;
  /**
   * 业务消息 —— `envelope[messageKey]`。
   *
   * Business message — `envelope[messageKey]`.
   */
  message: SnailMessageOf<S, M>;
  /**
   * 值来自缓存而不是网络时为 `true`。
   *
   * `true` when the value came from a cache instead of the network.
   */
  fromCache: boolean;
  /**
   * 最终请求配置，所有插件与策略运行之后的结果。
   *
   * The final request config, after every plugin and strategy ran.
   */
  config: import("axios").InternalAxiosRequestConfig;
}

/**
 * 请求成功时调用的回调。
 *
 * Callback invoked when a request succeeds.
 */
export type SnailSuccessCallback<S, T, D extends string = "data"> = (
  result: SnailResult<S, T, D, any, any>
) => void;

/**
 * 请求失败时调用的回调。
 *
 * Callback invoked when a request fails.
 */
export type SnailErrorCallback = (error: unknown) => void;

/**
 * 业务状态码被拒绝时调用的回调。
 *
 * Callback invoked when the business code is rejected.
 */
export type SnailCodeErrorCallback<T = unknown> = (
  code: number | string,
  payload: T,
  error: unknown
) => void;

/**
 * 请求结束（无论成功与否）时调用的回调。
 *
 * Callback invoked when a request settles, successfully or not.
 */
export type SnailFinishCallback = () => void;

/**
 * 响应由缓存提供时调用的回调。
 *
 * Callback invoked when the response was served from a cache.
 */
export type SnailCacheHitCallback = () => void;

/**
 * 裁决业务状态码是否可接受的判定函数。
 *
 * 返回 `true` 表示接受，返回 `false` 则以 `SnailResponseError` 拒绝。
 *
 * Verdict function deciding whether a business status code is acceptable.
 *
 * Return `true` to accept, `false` to reject with a `SnailResponseError`.
 */
export type SnailCodeValidator = (
  code: number | string,
  envelope: unknown
) => boolean;
