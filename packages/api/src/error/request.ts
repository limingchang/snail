import { SnailError } from "./base";

/**
 * 请求根本没有到达服务器时抛出（DNS、离线、CORS 等）。
 *
 * Thrown when a request never reached the server (DNS, offline, CORS, …).
 */
export class SnailRequestError extends SnailError {
  /**
   * 构造一个请求错误。
   *
   * 错误码固定为 `SNAIL_REQUEST_ERROR`。
   *
   * Build a request error.
   *
   * The code is always `SNAIL_REQUEST_ERROR`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 可选的底层原因 / Optional underlying cause
   */
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_REQUEST_ERROR", cause: options.cause });
  }
}

/**
 * 请求超过配置的超时时间时抛出。
 *
 * Thrown when a request exceeded the configured timeout.
 */
export class SnailTimeoutError extends SnailError {
  /**
   * 配置的超时时间，单位为毫秒。
   *
   * Configured timeout, in milliseconds.
   */
  readonly timeout: number | undefined;

  /**
   * 构造一个超时错误。
   *
   * 错误码固定为 `SNAIL_TIMEOUT_ERROR`。
   *
   * Build a timeout error.
   *
   * The code is always `SNAIL_TIMEOUT_ERROR`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 可选的超时时间与底层原因 / Optional timeout and underlying cause
   */
  constructor(message: string, options: { timeout?: number; cause?: unknown } = {}) {
    super(message, { code: "SNAIL_TIMEOUT_ERROR", cause: options.cause });
    this.timeout = options.timeout;
  }
}

/**
 * 请求被取消时抛出——由 `method.abort()`、由策略丢弃过期请求，或由调用方提供的
 * `AbortSignal` 触发。
 *
 * 取消是*预期内*的控制流，而不是失败，因此策略会有意吞掉这一类错误。
 *
 * Thrown when a request is cancelled — by `method.abort()`, by a strategy
 * discarding a stale request, or by an `AbortSignal` the caller supplied.
 *
 * Cancellation is *expected* control flow, not a failure, so strategies
 * deliberately swallow this error kind.
 */
export class SnailCancelledError extends SnailError {
  /**
   * 构造一个取消错误。
   *
   * 错误码固定为 `SNAIL_CANCELLED`。
   *
   * Build a cancellation error.
   *
   * The code is always `SNAIL_CANCELLED`.
   *
   * @param message 供人阅读的错误信息，默认为 `"request cancelled"` /
   *   Human-readable error message, `"request cancelled"` by default
   * @param options 可选的底层原因 / Optional underlying cause
   */
  constructor(message = "request cancelled", options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_CANCELLED", cause: options.cause });
  }
}
