import { SnailCancelledError } from "../error/request";
import type { SnailStateRef } from "../typings/adapter";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import {
  computeBackoffDelay,
  defaultRetryPredicate,
  resolveRetryPolicy
} from "./shared/retry";
import type { RetryOptions, RetryPredicate } from "./shared/retry";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";
import { cancellableDelay } from "./shared/timing";
import type { UseRequestOptions } from "./use-request";

/**
 * {@link useRetriableRequest} 接受的选项。
 *
 * Options accepted by {@link useRetriableRequest}.
 */
export interface UseRetriableRequestOptions<TData>
  extends UseRequestOptions<TData>,
    RetryOptions {
  /**
   * 判断一次失败的尝试是否值得再试一次。
   *
   * 接收*下一次*尝试的序号（1 起），因此调用方除了按次数，也可以按失败原因限制重试。默认
   * 实现除取消之外全部重试，而取消永不重试：调用方已经要求请求停止，重试等于无视该指令。
   *
   * Decide whether one failed attempt deserves another.
   *
   * Receives the attempted number of the *next* try (1-based), so a caller can
   * cap retries by reason as well as by count. The default retries everything
   * except a cancellation, which is never retried: the caller asked for the
   * request to stop, and a retry would ignore that instruction.
   */
  retryOn?: RetryPredicate;
}

/**
 * {@link useRetriableRequest} 的返回值。
 *
 * What {@link useRetriableRequest} returns.
 */
export interface UseRetriableRequestResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends StrategyState<TData> {
  /**
   * 发送请求，以解包后的载荷兑现；失败时最多额外重试 `retries` 次。
   *
   * Send the request, resolving with the unwrapped payload. A failure is retried
   * up to `retries` extra times.
   */
  send(...args: TArgs): Promise<TData>;

  /**
   * 最近一次 `send()` 已进行的尝试次数。从 `0` 开始。
   *
   * Attempts made by the most recent `send()`. Starts at `0`.
   */
  readonly attempts: SnailStateRef<number>;
}

/**
 * 一个能自我修复的请求。
 *
 * ## 取消才是难点
 *
 * hook 自己持有一个 `AbortController`，用于尝试*之间*的退避，因为那一刻没有在途请求可以
 * 取消。`abort()` 会同时触发两者，因此在 30 秒延迟期间调用 `abort()` 会立即拒绝，而不是
 * 让调用方的 promise 一直挂到定时器触发。取消永远不会被计为一次失败尝试，也永远不会写入
 * `error`。
 *
 * 暴露 `attempts` 是因为它对遥测确实有用（「这次调用试了三次」），也因为它让重试循环无需
 * 统计请求数就能被测试。
 *
 * A request that heals itself.
 *
 * ```ts
 * const save = useRetriableRequest(api.save, { retries: 3, delayMs: 200 });
 * await save.send(payload);      // may hit the network up to 4 times
 * save.attempts.value;           // how many tries it actually took
 * ```
 *
 * ## Cancellation is the hard part
 *
 * The hook keeps its own `AbortController` for the backoff *between* attempts,
 * because at that moment there is no in-flight request to cancel. `abort()` trips
 * both, so a `abort()` during a 30 second delay rejects immediately instead of
 * leaving the caller's promise pending until the timer fires. A cancellation is
 * never counted as a failed attempt and never written to `error`.
 *
 * `attempts` is exposed because it is genuinely useful for telemetry ("this call
 * needed three tries") and because it makes the retry loop testable without
 * counting requests.
 *
 * @param method 代理后的 api 方法 / The proxied api method.
 * @param options 策略与重试选项 / The strategy and retry options.
 * @returns 带 state 句柄、`send` 与 `attempts` 的结果 /
 *   The result with state handles, `send` and `attempts`.
 */
export function useRetriableRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseRetriableRequestOptions<TData> = {}
): UseRetriableRequestResult<TData, TArgs> {
  const policy = resolveRetryPolicy(options);
  const retryAllowed = options.retryOn ?? defaultRetryPredicate;
  const holder = createMethodHolder<TArgs, TData>(method);

  let backoff: AbortController | undefined;

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    method,

    initialData: options.initialData,
    onAbort: () => {
      backoff?.abort();
      holder.abort();
    }
  });

  const { state } = controller;
  const attempts = controller.adapter.create<number>(0);

  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  async function send(...args: TArgs): Promise<TData> {
    const snail = holder.resolve(args);
    const signal = new AbortController();
    backoff = signal;

    controller.resetForSend();
    if (options.resetOnSend) controller.setData(options.initialData);
    controller.setLoading(true);
    controller.adapter.write(attempts, 0);

    try {
      for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
        controller.adapter.write(attempts, attempt + 1);

        try {
          const result = await snail.send(...args);
          // `applySuccess` clears the error, so a request that failed twice and
          // then succeeded does not leave a stale failure on screen.
          const payload = controller.applySuccess(result);
          controller.emitSuccess(payload);
          return payload;
        } catch (error) {
          // Never retry a cancellation — that would be ignoring `abort()`.
          if (isCancellation(error)) throw error;

          const retryable = attempt < policy.retries && retryAllowed(error, attempt + 1);
          if (!retryable) throw error;

          // Surface the transient failure while backing off: the UI should see
          // "retrying" rather than the previous attempt's stale success.
          controller.applyFailure(error);
          await cancellableDelay(computeBackoffDelay(attempt + 1, policy), signal.signal);
        }
      }

      // Unreachable: the loop either returns or throws. Present so the function
      // has a return path for the type checker.
      throw new SnailCancelledError("retry loop ended without a result");
    } catch (error) {
      if (!isCancellation(error)) {
        controller.applyFailure(error);
        controller.emitError(error);
      }
      throw error;
    } finally {
      if (backoff === signal) backoff = undefined;
      controller.setLoading(false);
      controller.emitFinish();
    }
  }

  return { ...state, send, attempts };
}
