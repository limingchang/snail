import { SnailError } from "../../error/base";

/**
 * The error codes a request-pool refusal can carry.
 *
 * `isPoolError()` is the supported way to test them, but the strings are exported
 * so an application can switch on one precisely — for example to distinguish "the
 * queue was full, try again shortly" from "the user navigated away".
 */
export const POOL_ERROR_CODES = {
  /** `maxQueue` was reached; the request was never sent. */
  queueFull: "SNAIL_POOL_QUEUE_FULL",
  /** The request waited longer than `queueTimeout` and was dropped. */
  queueTimeout: "SNAIL_POOL_QUEUE_TIMEOUT",
  /** The request was cancelled while it was still waiting for a slot. */
  aborted: "SNAIL_POOL_ABORTED",
  /** The queue was cleared — usually because the plugin was uninstalled. */
  cleared: "SNAIL_POOL_CLEARED"
} as const;

/** Any code {@link SnailPoolError} can carry. */
export type PoolErrorCode = (typeof POOL_ERROR_CODES)[keyof typeof POOL_ERROR_CODES];

/**
 * Raised when the pool refuses or drops a request.
 *
 * A dedicated class rather than a reuse of `SnailRequestError`: a pool refusal
 * means the request **never reached the network**, which is a materially different
 * situation from a transport failure. Retrying is safe and usually correct, the
 * payload is untouched, and no server state changed — a caller that cannot tell the
 * two apart will either retry a request the server already processed, or give up on
 * one that was merely queued behind a burst.
 */
export class SnailPoolError extends SnailError {
  /** Which refusal this is. */
  declare readonly code: PoolErrorCode;

  constructor(message: string, code: PoolErrorCode, options: { cause?: unknown } = {}) {
    super(message, { code, cause: options.cause });
  }
}
