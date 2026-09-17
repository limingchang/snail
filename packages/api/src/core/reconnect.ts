import type { SnailReconnectPolicy } from "../typings/stream";

/** A reconnect policy with every default applied. */
export type ResolvedReconnectPolicy = Required<SnailReconnectPolicy>;

/** Defaults used when a transport enables reconnecting without a policy. */
export const DEFAULT_RECONNECT_POLICY: ResolvedReconnectPolicy = {
  retries: 3,
  delayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitter: true
};

/**
 * Normalise the `reconnect` option.
 *
 * Returns `undefined` when reconnecting is switched off, so callers can branch on
 * a single falsy check instead of handling `false | undefined | policy`.
 */
export function resolveReconnectPolicy(
  policy: false | SnailReconnectPolicy | undefined
): ResolvedReconnectPolicy | undefined {
  if (policy === false) return undefined;
  if (policy === undefined) return { ...DEFAULT_RECONNECT_POLICY };
  return { ...DEFAULT_RECONNECT_POLICY, ...policy };
}

/**
 * Exponential backoff with optional full jitter.
 *
 * `attempt` is 1-based: `attempt: 1` returns the first delay. The result is
 * always capped by `maxDelayMs`, so a long outage cannot push a retry hours out.
 */
export function backoffDelay(
  attempt: number,
  policy: ResolvedReconnectPolicy
): number {
  const base = policy.delayMs * Math.pow(policy.factor, Math.max(0, attempt - 1));
  const capped = Math.min(base, policy.maxDelayMs);
  if (!policy.jitter) return capped;
  // Full jitter: uniform between 0 and the capped delay, with a small floor so a
  // reconnect is never scheduled for "immediately".
  return Math.max(50, Math.round(Math.random() * capped));
}

/** `true` when another attempt is allowed. */
export function canRetry(attempt: number, policy: ResolvedReconnectPolicy): boolean {
  return attempt <= policy.retries;
}
