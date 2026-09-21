import type { SnailReconnectPolicy } from "../typings/stream";

/**
 * 补齐所有默认值后的重连策略：每个字段都必定存在。
 *
 * A reconnect policy with every default applied.
 */
export type ResolvedReconnectPolicy = Required<SnailReconnectPolicy>;

/**
 * 传输层开启重连但未提供策略时使用的默认值。
 *
 * Defaults used when a transport enables reconnecting without a policy.
 */
export const DEFAULT_RECONNECT_POLICY: ResolvedReconnectPolicy = {
  /** 最多重试次数（不含首次连接）/ Maximum retries, excluding the first attempt. */
  retries: 3,
  /** 第一次重试前的等待毫秒数 / Delay before the first retry, in milliseconds. */
  delayMs: 1000,
  /** 退避延迟上限，单位毫秒 / Upper bound of the backoff delay, in milliseconds. */
  maxDelayMs: 30000,
  /** 每次重试的延迟倍数 / Multiplier applied to the delay on every retry. */
  factor: 2,
  /** 是否对延迟施加完全抖动 / Whether full jitter is applied to the delay. */
  jitter: true
};

/**
 * 规范化 `reconnect` 选项。
 *
 * 关闭重连时返回 `undefined`：调用方只需一次假值判断，不必同时处理
 * `false | undefined | policy` 三种形态。
 *
 * Normalise the `reconnect` option.
 *
 * Returns `undefined` when reconnecting is switched off, so callers can branch on
 * a single falsy check instead of handling `false | undefined | policy`.
 *
 * @param policy `reconnect` 选项原值 / The raw `reconnect` option.
 * @returns 补齐默认值的策略；显式关闭时为 `undefined` /
 *   The policy with defaults applied, or `undefined` when explicitly disabled.
 */
export function resolveReconnectPolicy(
  policy: false | SnailReconnectPolicy | undefined
): ResolvedReconnectPolicy | undefined {
  if (policy === false) return undefined;
  if (policy === undefined) return { ...DEFAULT_RECONNECT_POLICY };
  return { ...DEFAULT_RECONNECT_POLICY, ...policy };
}

/**
 * 带可选完全抖动的指数退避。
 *
 * `attempt` 从 1 开始：`attempt: 1` 返回第一次重试的延迟。结果始终被
 * `maxDelayMs` 截断，因此长时间断网也不会把重试排到数小时之后。
 *
 * Exponential backoff with optional full jitter.
 *
 * `attempt` is 1-based: `attempt: 1` returns the first delay. The result is
 * always capped by `maxDelayMs`, so a long outage cannot push a retry hours out.
 *
 * @param attempt 第几次重试，从 1 开始 / 1-based attempt number.
 * @param policy 补齐默认值的重连策略 / The resolved reconnect policy.
 * @returns 本次重试前应等待的毫秒数 / Milliseconds to wait before this attempt.
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

/**
 * 是否还允许再试一次。
 *
 * `true` when another attempt is allowed.
 *
 * @param attempt 第几次重试，从 1 开始 / 1-based attempt number.
 * @param policy 补齐默认值的重连策略 / The resolved reconnect policy.
 * @returns 未超出 `retries` 时为 `true` / `true` while `attempt` is within `retries`.
 */
export function canRetry(attempt: number, policy: ResolvedReconnectPolicy): boolean {
  return attempt <= policy.retries;
}
