import { isCancellation } from "./error";

/**
 * `useRetriableRequest` 与各重连传输层共享的重试开关。
 *
 * Retry knobs shared by `useRetriableRequest` and the reconnect transports.
 */
export interface RetryOptions {
  /**
   * 首次失败之后的额外尝试次数。默认 `3`。
   *
   * Extra attempts after the first failure. Defaults to `3`.
   */
  retries?: number;
  /**
   * 首次延迟毫秒数。默认 `1000`。
   *
   * First delay in milliseconds. Defaults to `1000`.
   */
  delayMs?: number;
  /**
   * 单次延迟的上限。默认 `30000`。
   *
   * Upper bound for one delay. Defaults to `30000`.
   */
  maxDelayMs?: number;
  /**
   * 每次失败后乘上的倍数。默认 `2`。
   *
   * Multiplier applied after each failure. Defaults to `2`.
   */
  factor?: number;
  /**
   * 随机化延迟以避免惊群。默认 `true`。
   *
   * Randomise the delay to avoid a thundering herd. Defaults to `true`.
   */
  jitter?: boolean;
}

/**
 * 已全部填充默认值的重试配置。
 *
 * Fully defaulted retry configuration.
 */
export interface RetryPolicy {
  /**
   * 首次失败之后的额外尝试次数。
   *
   * Extra attempts after the first failure.
   */
  retries: number;
  /**
   * 首次延迟毫秒数。
   *
   * First delay in milliseconds.
   */
  delayMs: number;
  /**
   * 单次延迟的上限。
   *
   * Upper bound for one delay.
   */
  maxDelayMs: number;
  /**
   * 每次失败后乘上的倍数。
   *
   * Multiplier applied after each failure.
   */
  factor: number;
  /**
   * 是否随机化延迟，以避免惊群。
   *
   * Whether the delay is randomised, to avoid a thundering herd.
   */
  jitter: boolean;
}

/**
 * 判断一次失败的尝试是否值得再试一次。
 *
 * Decides whether one failed attempt deserves another.
 *
 * @param error 该次尝试抛出的错误 / The error that attempt threw.
 * @param attempt 下一次尝试的序号（1 起） / The 1-based number of the next try.
 * @returns 允许重试时为 `true` / `true` to allow another attempt.
 */
export type RetryPredicate = (error: unknown, attempt: number) => boolean;

/**
 * 默认值刻意保守：尝试三次、指数退避、带抖动。
 *
 * Defaults are deliberately conservative: three tries, exponential, jittered.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  /** 首次失败后额外尝试 3 次。 / Three extra attempts after the first failure. */
  retries: 3,
  /** 首次延迟 1000 毫秒。 / First delay of 1000 milliseconds. */
  delayMs: 1000,
  /** 单次延迟上限 30 秒。 / One delay is capped at 30 seconds. */
  maxDelayMs: 30000,
  /** 每次失败后延迟乘以 2。 / Delay doubles after each failure. */
  factor: 2,
  /** 抖动开启，避免多个客户端同时重试。 / Jitter on, so clients do not retry in lockstep. */
  jitter: true
};

/**
 * 填充重试默认值。
 *
 * `retries` 会向下取整并钳制到 `>= 0`：负值会让尝试循环一次都不执行就直接兑现，那不是
 * 调用方能看到的校验错误，而是一个静默的空操作。
 *
 * Fill in the retry defaults.
 *
 * `retries` is floored and clamped to `>= 0`: a negative value would make the
 * attempt loop run zero times and resolve without ever sending, which is a
 * silent no-op rather than a validation error the caller can see.
 *
 * @param options 部分重试选项 / Partial retry options.
 * @returns 已填充默认值的重试策略 / The fully defaulted retry policy.
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
 * 第 `attempt` 次尝试（1 起）之前的延迟，指数增长并可带抖动。
 *
 * 抖动是算出的延迟的**一半**加上一段随机份额，而不是重新随机取值：全抖动可能产生接近
 * 零的延迟，把重试风暴变成持续猛击，而半抖动仍能把大量客户端错开。
 *
 * Delay before attempt `attempt` (1-based), with exponential growth and an
 * optional jitter.
 *
 * Jitter is *half* the computed delay plus a random share, not a fresh random
 * pick: full jitter can produce a near-zero delay that turns a retry storm into a
 * hammering loop, while half jitter still spreads a fleet of clients out.
 *
 * @param attempt 尝试序号，1 起 / The 1-based attempt number.
 * @param policy 重试策略 / The retry policy.
 * @returns 应等待的毫秒数 / The milliseconds to wait.
 */
export function computeBackoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(policy.delayMs * policy.factor ** exponent, policy.maxDelayMs);
  if (!policy.jitter) return base;
  return base / 2 + Math.random() * (base / 2);
}

/**
 * 默认的 {@link RetryPredicate}：除取消之外全部重试。
 *
 * 重试一个取消是唯一绝对错误的情形——调用方已经要求请求停止，重试等于无视一条明确的
 * 指令，并让连接继续被占用。
 *
 * The default {@link RetryPredicate}: retry everything except a cancellation.
 *
 * Retrying a cancellation is the one case that is always wrong — the caller asked
 * for the request to stop, so a retry ignores an explicit instruction and keeps
 * the socket busy.
 *
 * @param error 该次尝试抛出的错误 / The error that attempt threw.
 * @returns 不是取消时为 `true` / `true` unless it is a cancellation.
 */
export const defaultRetryPredicate: RetryPredicate = (error: unknown): boolean =>
  !isCancellation(error);
