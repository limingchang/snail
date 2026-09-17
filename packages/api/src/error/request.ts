import { SnailError } from "./base";

/** Thrown when a request never reached the server (DNS, offline, CORS, …). */
export class SnailRequestError extends SnailError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_REQUEST_ERROR", cause: options.cause });
  }
}

/** Thrown when a request exceeded the configured timeout. */
export class SnailTimeoutError extends SnailError {
  /** Configured timeout, in milliseconds. */
  readonly timeout: number | undefined;

  constructor(message: string, options: { timeout?: number; cause?: unknown } = {}) {
    super(message, { code: "SNAIL_TIMEOUT_ERROR", cause: options.cause });
    this.timeout = options.timeout;
  }
}

/**
 * Thrown when a request is cancelled — by `method.abort()`, by a strategy
 * discarding a stale request, or by an `AbortSignal` the caller supplied.
 *
 * Cancellation is *expected* control flow, not a failure, so strategies
 * deliberately swallow this error kind.
 */
export class SnailCancelledError extends SnailError {
  constructor(message = "request cancelled", options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_CANCELLED", cause: options.cause });
  }
}
