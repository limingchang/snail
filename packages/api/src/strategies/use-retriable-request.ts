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

/** Options accepted by {@link useRetriableRequest}. */
export interface UseRetriableRequestOptions<TData>
  extends UseRequestOptions<TData>,
    RetryOptions {
  /**
   * Decide whether one failed attempt deserves another.
   *
   * Receives the attempted number of the *next* try (1-based), so a caller can
   * cap retries by reason as well as by count. The default retries everything
   * except a cancellation, which is never retried: the caller asked for the
   * request to stop, and a retry would ignore that instruction.
   */
  retryOn?: RetryPredicate;
}

/** What {@link useRetriableRequest} returns. */
export interface UseRetriableRequestResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends StrategyState<TData> {
  send(...args: TArgs): Promise<TData>;

  /** Attempts made by the most recent `send()`. Starts at `0`. */
  readonly attempts: SnailStateRef<number>;
}

/**
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
