import { SnailCancelledError } from "../error/request";
import type { SnailStateRef } from "../typings/adapter";
import { noop } from "../utils/object";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import { createRequestScheduler } from "./shared/timing";
import { readWatchedValues, shallowEqual } from "./shared/watcher";
import type { UseRequestOptions, UseRequestResult } from "./use-request";

/**
 * {@link useWatcher} 接受的选项。
 *
 * Options accepted by {@link useWatcher}.
 */
export interface UseWatcherOptions<TData> extends UseRequestOptions<TData> {
  /**
   * 值发生变化时触发一次重新发送。
   *
   * 必须是返回**普通值**的函数——`() => [page.value]`。当 adapter 能识别时，state 句柄也
   * 会被解包（见 `shared/watcher.ts`），但句柄形式只是启发式：只有 `{ value }` 对象会被
   * 识别，因此一个恰好只有 `value` 键的真实数据对象与句柄无法区分。
   *
   * Values that trigger a re-send when they change.
   *
   * Must be a function returning **plain values** — `() => [page.value]`. State
   * handles are unwrapped too when the adapter can identify them (see
   * `shared/watcher.ts`), but the handle form is a heuristic: only a `{ value }`
   * object is recognised, so a genuine data object with a lone `value` key is
   * indistinguishable from a handle.
   */
  watching: () => readonly unknown[];

  /**
   * 等待这么多毫秒的安静期，然后发送一次。
   *
   * 两者都设置时优先于 `throttle`：它们表达相反的意图（「等它稳定下来」与「立刻发送，然后
   * 每个窗口至多一次」），静默地只照顾其中一个，好过行为取决于调用顺序的混合体。
   *
   * Wait for this many milliseconds of quiet, then send once.
   *
   * Takes precedence over `throttle` when both are set: the two express opposite
   * intents ("wait until it settles" vs "send immediately, then at most once per
   * window"), and silently honouring one of them is better than a hybrid whose
   * behaviour depends on the call order.
   */
  debounce?: number;

  /**
   * 在前沿发送，之后每个窗口至多一次。
   *
   * Send on the leading edge, then at most once per window.
   */
  throttle?: number;
}

/**
 * {@link useWatcher} 的返回值。
 *
 * What {@link useWatcher} returns.
 */
export interface UseWatcherResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends UseRequestResult<TData, TArgs> {
  /**
   * `send()` 是否会折叠未变化的被观察值。
   *
   * 默认 `true` 即为 watching 行为。设为 `false` 会让每次 `send()` 都变成无条件请求，这是
   * 同一个 hook 继续观察字段时，手动「刷新」按钮的逃生口。
   *
   * Whether `send()` collapses unchanged watched values.
   *
   * `true` (default) is the watching behaviour. Setting it to `false` turns every
   * `send()` into an unconditional request, which is the escape hatch for a manual
   * "refresh" button while the same hook keeps watching fields.
   */
  readonly watching: SnailStateRef<boolean>;
}

/**
 * 当被观察的值发生变化时重新发送请求。
 *
 * ## 为什么 `send()` 是求值触发器
 *
 * `SnailStateAdapter` 只暴露 `create`/`read`/`write` 和一个可选的 `subscribe`；它没有
 * `watch` 或 `effect`，而且核心刻意把框架响应式挡在策略层之外。因此没有任何东西可以在值
 * 变化的*那一刻*触发。hook 于是在 `send()` 被调用时求值 `watching()`，并把未变化的快照
 * 当作空操作，这让行为既确定又与框架无关：Vue/React 集成可以在自己的响应式副作用里调用
 * `send()`，脚本则直接调用。
 *
 * `debounce`/`throttle` 随后折叠响应式副作用产生的 `send()` 突发。每个被折叠的调用方的
 * promise 都会以那唯一一次请求的结果落定，因此不会有 `await` 被永远挂着。
 *
 * Re-send a request when watched values move.
 *
 * ```ts
 * const keyword = createState("");
 * const search = useWatcher(searchApi.find, {
 *   watching: () => [keyword.value],
 *   debounce: 200
 * });
 *
 * keyword.value = "a"; await search.send();   // sends
 * await search.send();                        // same values → no request
 * keyword.value = "ab"; await search.send();  // sends again
 * ```
 *
 * ## Why `send()` is the evaluation trigger
 *
 * `SnailStateAdapter` exposes `create`/`read`/`write` and an optional
 * `subscribe`; it has no `watch` or `effect`, and the core deliberately keeps
 * framework reactivity out of the strategy layer. So there is nothing to fire at
 * the *moment* a value changes. The hook therefore evaluates `watching()` when
 * `send()` is called and treats an unchanged snapshot as a no-op, which keeps the
 * behaviour deterministic and framework-free: a Vue/React integration can call
 * `send()` from its own reactive effect, and a script calls it directly.
 *
 * `debounce`/`throttle` then collapse the *bursts* of `send()` calls a reactive
 * effect produces. Every collapsed caller's promise settles with the single
 * request's outcome, so no `await` is ever left hanging.
 *
 * @param method 代理后的 api 方法 / The proxied api method.
 * @param options 策略选项，必须含 `watching` / Strategy options; `watching` is required.
 * @returns 带 state 句柄、`send` 与 `watching` 开关的结果 /
 *   The result with state handles, `send` and the `watching` switch.
 */
export function useWatcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseWatcherOptions<TData>
): UseWatcherResult<TData, TArgs> {
  const holder = createMethodHolder<TArgs, TData>(method);
  const scheduler = createRequestScheduler({
    debounce: options.debounce,
    throttle: options.throttle
  });

  let settleWaiters: Array<{
    resolve: (value: TData) => void;
    reject: (error: unknown) => void;
  }> = [];

  const rejectWaiters = (error: unknown): void => {
    const waiters = settleWaiters;
    settleWaiters = [];
    for (const waiter of waiters) waiter.reject(error);
  };

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    method,

    initialData: options.initialData,
    onAbort: () => {
      // Cancelling a *scheduled* run has no method to abort yet, so the queued
      // promises are rejected here instead — otherwise `abort()` would leave
      // every waiting `await send()` pending forever.
      scheduler.cancel();
      rejectWaiters(new SnailCancelledError("watched request cancelled before it was sent"));
      holder.abort();
    }
  });

  const { state } = controller;
  const watching = controller.adapter.create<boolean>(true);

  let snapshot: unknown[] | undefined;
  let queuedArgs: TArgs | undefined;

  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  async function perform(): Promise<void> {
    const waiters = settleWaiters;
    settleWaiters = [];
    if (waiters.length === 0) return;

    const args = (queuedArgs ?? []) as unknown as TArgs;
    const snail = holder.resolve(args);

    controller.resetForSend();
    if (options.resetOnSend) controller.setData(options.initialData);
    controller.setLoading(true);

    try {
      const result = await snail.send(...args);
      const payload = controller.applySuccess(result);
      controller.emitSuccess(payload);
      for (const waiter of waiters) waiter.resolve(payload);
    } catch (error) {
      if (!isCancellation(error)) {
        controller.applyFailure(error);
        controller.emitError(error);
      }
      for (const waiter of waiters) waiter.reject(error);
    } finally {
      controller.setLoading(false);
      controller.emitFinish();
    }
  }

  function send(...args: TArgs): Promise<TData> {
    let values: unknown[];

    try {
      values = readWatchedValues(controller.adapter, options.watching);
    } catch (error) {
      // A throwing watcher is user code: report it through `error` and reject this
      // one call instead of letting it escape the hook (which would break the
      // component that merely called `send()`).
      controller.setError(error);
      controller.emitError(error);
      return Promise.reject(error);
    }

    const changed = snapshot === undefined || !shallowEqual(values, snapshot);
    snapshot = values;
    queuedArgs = args;

    if (controller.adapter.read(watching) && !changed) {
      return Promise.resolve(controller.adapter.read(state.data) as TData);
    }

    const promise = new Promise<TData>((resolve, reject) => {
      settleWaiters.push({ resolve, reject });
    });
    scheduler.schedule(() => {
      void perform();
    });
    return promise;
  }

  const result: UseWatcherResult<TData, TArgs> = { ...state, watching, send };

  if (options.immediate) {
    void send(...([] as unknown as TArgs)).catch(noop);
  }

  return result;
}
