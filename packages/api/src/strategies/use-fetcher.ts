import type { SnailStrategyCommonOptions } from "../typings/adapter";
import { noop } from "../utils/object";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/**
 * {@link useFetcher} 接受的选项。
 *
 * Options accepted by {@link useFetcher}.
 */
export interface UseFetcherOptions<TData> extends SnailStrategyCommonOptions {
  /**
   * 把每次请求镜像到 `loading`/`data`/`error`/`code`/`message`。
   *
   * 默认关闭：fetcher 通常是**后台**请求——预取、SSR、静默刷新——写调用方的 state 会让
   * 没人要求观察的工作也弹出加载动画。当 fetcher 是某个可见视图的唯一数据来源时才打开。
   *
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
 * {@link useFetcher} 始终存在的那部分接口。
 *
 * 无论是否启用 state 都会返回，因为 `abort()` 和生命周期回调与渲染无关。
 *
 * The always-present surface of {@link useFetcher}.
 *
 * Returned whether or not state is enabled, because `abort()` and the lifecycle
 * callbacks have nothing to do with rendering.
 */
export interface UseFetcherCore<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> {
  /**
   * 执行请求，以解包后的 payload 兑现。
   *
   * Run the request. Resolves with the unwrapped payload.
   */
  fetch(...args: TArgs): Promise<TData>;

  /**
   * 中止进行中的请求（如果有）。
   *
   * Abort the in-flight request, if any.
   */
  abort(): void;

  /**
   * 注册成功回调，返回取消订阅函数。
   *
   * Called after a successful request. Returns an unsubscribe function.
   */
  onSuccess(callback: (data: TData) => void): () => void;
  /**
   * 注册失败回调，返回取消订阅函数。取消（cancellation）不算失败。
   *
   * Called after a failed request. Returns an unsubscribe function. A
   * cancellation is not a failure.
   */
  onError(callback: (error: unknown) => void): () => void;
  /**
   * 注册结束回调（成功或失败都会触发），返回取消订阅函数。
   *
   * Called once the request settles, successfully or not. Returns an
   * unsubscribe function.
   */
  onFinish(callback: () => void): () => void;
}

/**
 * 启用 `withState: true` 时的 {@link useFetcher} 返回值。
 *
 * {@link useFetcher} with `withState: true`.
 */
export interface UseFetcherResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends UseFetcherCore<TData, TArgs>,
    StrategyState<TData> {}

/**
 * 需要 state 时 {@link useFetcher} 接受的选项。
 *
 * Options accepted by {@link useFetcher} when state is requested.
 */
export type UseFetcherStateOptions<TData> = UseFetcherOptions<TData> & { withState: true };

/**
 * 不绑定视图地运行一个 api 方法。
 *
 * 这是用于预取、SSR 和后台刷新的 hook：除非 `withState` 明确要求，它刻意不提供
 * `loading`/`data`/`error` 句柄，因此调用它绝不会让无关的加载动画出现。
 *
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
 *
 * @param method 代理后的 api 方法 / The proxied api method.
 * @param options 策略选项；传 `withState: true` 时返回值额外带 state 句柄 /
 *   Strategy options; with `withState: true` the result also carries state handles.
 * @returns 不带 state 的 fetcher 接口面，启用 state 时同时是 {@link UseFetcherResult} /
 *   The fetcher surface without state, plus {@link UseFetcherResult} when state is on.
 */
export function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseFetcherStateOptions<TData>
): UseFetcherResult<TData, TArgs>;
/**
 * 不请求 state 的重载：只返回始终存在的那部分接口。
 *
 * The overload without state: returns the always-present surface only.
 */
export function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseFetcherOptions<TData>
): UseFetcherCore<TData, TArgs>;
/**
 * 实现签名，返回两个重载返回值的联合。
 *
 * Implementation signature; the union of both overloads' returns.
 */
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
