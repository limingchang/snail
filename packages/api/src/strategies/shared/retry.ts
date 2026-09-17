import { isCancellation } from "./error";

/** Retry knobs shared by `useRetriableRequest` and the reconnect transports. */
export interface RetryOptions {
  /** Extra attempts after the first failure. Defaults to `3`. */
  retries?: number;
  /** First delay in milliseconds. Defaults to `1000`. */
  delayMs?: number;
  /** Upper bound for one delay. Defaults to `30000`. */
  maxDelayMs?: number;
  /** Multiplier applied after each failure. Defaults to `2`. */
  factor?: number;
  /** Randomise the delay to avoid a thundering herd. Defaults to `true`. */
  jitter?: boolean;
}

/** Fully defaulted retry configuration. */
export interface RetryPolicy {
  retries: number;
  delayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter: boolean;
}

/** Decides whether one failed attempt deserves another. */
export type RetryPredicate = (error: unknown, attempt: number) => boolean;

/** Defaults are deliberately conservative: three tries, exponential, jittered. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  retries: 3,
  delayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitter: true
};

/**
 * Fill in the retry defaults.
 *
 * `retries` is floored and clamped to `>= 0`: a negative value would make the
 * attempt loop run zero times and resolve without ever sending, which is a
 * silent no-op rather than a validation error the caller can see.
 */
export function resolveRetryPolicy(options: RetryOptions = {}): RetryPolicy {
  const retries = Number.isFinite(options.retries) ? Math.max(0, Math.floor(options.retries as number)) : DEFAULT_RETRY_POLICY.retries;
  const delayMs = Number.isFinite(options.delayMs)
    ? Math.max(0, options.delayMs as number)
    : DEFAULT_RETRY_POLICY.delayMs;
  const maxDelayMs = Number.isFinite(options.maxDelayMs)
    ? Math.max(0, options.maxDelayMs as number)
    : DEFAULT_RETRY_POLICY.maxDelayMs;
  const factor = Number.isFinite(options.factor) ? Math.max(1, options.factor as number) : DEFAULT_RETRY_POLICY.factor;

  return {
    retries,
    delayMs,
    maxDelayMs,
    factor,
    jitter: options.jitter ?? DEFAULT_RETRY_POLICY.jitter
  };
}

/**
 * Delay before attempt `attempt` (1-based), with exponential growth and an
 * optional jitter.
 *
 * Jitter is *half* the computed delay plus a random share, not a fresh random
 * pick: full jitter can produce a near-zero delay that turns a retry storm into a
 * hammering loop, while half jitter still spreads a fleet of clients out.
 */
export function computeBackoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(policy.delayMs * policy.factor ** exponent, policy.maxDelayMs);
  if (!policy.jitter) return base;
  return base / 2 + Math.random() * (base / 2);
}

/**
 * The default {@link RetryPredicate}: retry everything except a cancellation.
 *
 * Retrying a cancellation is the one case that is always wrong — the caller asked
 * for the request to stop, so a retry ignores an explicit instruction and keeps
 * the socket busy.
 */
export const defaultRetryPredicate: RetryPredicate = (error: unknown): boolean =>
  !isCancellation(error);
