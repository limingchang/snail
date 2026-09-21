import { SnailError } from "./base";

/**
 * 后端返回 HTTP 成功，但业务状态码被配置的 {@link ServerOptions.validateCode}
 * 规则拒绝时抛出。
 *
 * 解析后的完整响应体会保留在 `payload` 上，因此应用的错误处理仍可读取
 * `payload.message` / `payload.data`。
 *
 * Thrown when the backend answered with HTTP success but a business status code
 * that the configured {@link ServerOptions.validateCode} rule rejected.
 *
 * The whole parsed body is preserved on `payload`, so an application error
 * handler can still read `payload.message` / `payload.data`.
 */
export class SnailResponseError<T = unknown> extends SnailError {
  /**
   * 后端上报的业务状态码。
   *
   * Business status code reported by the backend.
   */
  readonly businessCode: number | string | undefined;

  /**
   * 解析后的完整响应体。
   *
   * Full parsed response body.
   */
  readonly payload: T;

  /**
   * 构造一个响应错误。
   *
   * 错误码固定为 `SNAIL_RESPONSE_ERROR`。
   *
   * Build a response error.
   *
   * The code is always `SNAIL_RESPONSE_ERROR`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 业务状态码、解析后的响应体与可选的底层原因 /
   *   Business code, parsed payload and optional underlying cause
   */
  constructor(
    message: string,
    options: { businessCode?: number | string; payload: T; cause?: unknown }
  ) {
    super(message, { code: "SNAIL_RESPONSE_ERROR", cause: options.cause });
    this.businessCode = options.businessCode;
    this.payload = options.payload;
  }
}

/**
 * 传输层失败时抛出：非 2xx 状态码、网络故障、超时或中断。只有当响应真的回来时
 * `status` 才存在。
 *
 * Thrown when the transport failed: non-2xx status, network failure, timeout or
 * abort. `status` is present only when a response actually came back.
 */
export class SnailHttpError<T = unknown> extends SnailError {
  /**
   * HTTP 状态码；没有收到响应时为 `undefined`。
   *
   * HTTP status code, or `undefined` when no response came back.
   */
  readonly status: number | undefined;
  /**
   * HTTP 状态文本，同样只在收到响应时存在。
   *
   * HTTP status text, likewise present only with a response.
   */
  readonly statusText: string | undefined;
  /**
   * 已解析的错误响应体（若存在）。
   *
   * The parsed error payload, when there was one.
   */
  readonly payload: T | undefined;

  /**
   * 构造一个 HTTP 错误。
   *
   * 错误码默认为 `SNAIL_HTTP_ERROR`，可用 `options.code` 覆盖。
   *
   * Build an HTTP error.
   *
   * The code defaults to `SNAIL_HTTP_ERROR` and can be overridden through
   * `options.code`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 状态码、状态文本、响应体、底层原因与错误码覆盖 /
   *   Status, status text, payload, underlying cause and code override
   */
  constructor(
    message: string,
    options: {
      status?: number;
      statusText?: string;
      payload?: T;
      cause?: unknown;
      code?: string;
    } = {}
  ) {
    super(message, { code: options.code ?? "SNAIL_HTTP_ERROR", cause: options.cause });
    this.status = options.status;
    this.statusText = options.statusText;
    this.payload = options.payload;
  }
}
