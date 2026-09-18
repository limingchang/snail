import type { SnailStrategyCommonOptions } from "../typings/adapter";
import { noop } from "../utils/object";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/** Options accepted by {@link useFetcher}. */
export interface UseFetcherOptions<TData> extends SnailStrategyCommonOptions {
  /**
   * Mirror each request into `loading`/`data`/`error`/`code`/`message`.
   *
   * Off by default: a fetcher is usually a *background* request — a prefetch, an
   * SSR pass, a silent refresh — and writing to the caller's state would make a
   * spinner appear for work nobody asked to watch. Turn it on when the fetcher is
   * the only thing driving a visible view.
   */
  withState?: boolean;
}

/**
 * The always-present surface of {@link useFetcher}.
 *
 * Returned whether or not state is enabled, because `abort()` and the lifecycle
 * callbacks have nothing to do with rendering.
 */
export interface UseFetcherCore<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> {
  /** Run the request. Resolves with the unwrapped payload. */
  fetch(...args: TArgs): Promise<TData>;

  /** Abort the in-flight request, if any. */
  abort(): void;

  onSuccess(callback: (data: TData) => void): () => void;
  onError(callback: (error: unknown) => void): () => void;
  onFinish(callback: () => void): () => void;
}

/** {@link useFetcher} with `withState: true`. */
export interface UseFetcherResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends UseFetcherCore<TData, TArgs>,
    StrategyState<TData> {}

/** Options accepted by {@link useFetcher} when state is requested. */
export type UseFetcherStateOptions<TData> = UseFetcherOptions<TData> & { withState: true };

/**
 * Run an api method without a view.
 *
 * ```ts
 * const prefetch = useFetcher(userApi.getUser);
 * await prefetch.fetch("1");          // warms the cache, touches no state
 * ```
 *
 * This is the hook for prefetching, SSR and background refresh: it deliberately
 * has no `loading`/`data`/`error` handles unless `withState` asks for them, so
 * calling it can never make an unrelated spinner appear.
 */
export function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseFetcherStateOptions<TData>
): UseFetcherResult<TData, TArgs>;
export function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseFetcherOptions<TData>
): UseFetcherCore<TData, TArgs>;
export function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseFetcherOptions<TData> = {}
): UseFetcherCore<TData, TArgs> | UseFetcherResult<TData, TArgs> {
  const track = options.withState === true;
  const holder = createMethodHolder<TArgs, TData>(method);

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    method,

    onAbort: () => holder.abort()
  });

  const { state } = controller;

  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  async function fetch(...args: TArgs): Promise<TData> {
    const snail = holder.resolve(args);

    if (track) {
      controller.resetForSend();
      controller.setLoading(true);
    }

    try {
      const result = await snail.send(...args);
      const payload = result.data;
      if (track) controller.applySuccess(result);
      controller.emitSuccess(payload);
      return payload;
    } catch (error) {
      // A silent fetcher is silent in every direction: no state write, and a
      // cancellation is not reported as a failure either.
      if (!isCancellation(error)) {
        if (track) controller.applyFailure(error);
        controller.emitError(error);
      }
      throw error;
    } finally {
      if (track) controller.setLoading(false);
      controller.emitFinish();
    }
  }

  const core: UseFetcherCore<TData, TArgs> = {
    fetch,
    abort: () => state.abort(),
    onSuccess: (callback) => state.onSuccess(callback),
    onError: (callback) => state.onError(callback),
    onFinish: (callback) => state.onFinish(callback)
  };

  if (options.immediate) {
    void fetch(...([] as unknown as TArgs)).catch(noop);
  }

  if (!track) return core;

  return { ...core, ...state };
}
