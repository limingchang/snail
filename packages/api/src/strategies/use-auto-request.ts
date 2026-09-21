import type { SnailStateRef } from "../typings/adapter";
import { resolveStateAdapter } from "./shared/adapter";
import { createListenerScope, getDocumentTarget, getWindowTarget, isDocumentVisible } from "./shared/dom";
import type { StrategyMethod } from "./shared/method";
import { unrefTimer } from "./shared/timing";
import { useRequest } from "./use-request";
import type { UseRequestOptions, UseRequestResult } from "./use-request";

/**
 * {@link useAutoRequest} 接受的选项。
 *
 * Options accepted by {@link useAutoRequest}.
 */
export interface UseAutoRequestOptions<TData> extends UseRequestOptions<TData> {
  /**
   * 每 `pollingInterval` 毫秒轮询一次。
   *
   * 下一次计时只在上一次请求**结束之后**才安排，因此比间隔更慢的后端只会产生一个长度为 1
   * 的队列，而不是无界堆叠的重叠请求。
   *
   * Poll every `pollingInterval` ms.
   *
   * The next tick is scheduled only **after** the previous request settles, so a
   * backend slower than the interval produces a queue of one, not an unbounded
   * pile of overlapping requests.
   */
  pollingInterval?: number;

  /**
   * 窗口重新获得焦点时刷新。
   *
   * Refresh when the window regains focus.
   */
  enableFocusRefresh?: boolean;

  /**
   * 浏览器报告网络恢复时刷新。
   *
   * Refresh when the browser reports the network is back.
   */
  enableReconnectRefresh?: boolean;

  /**
   * 标签页重新可见时刷新。
   *
   * Refresh when the tab becomes visible again.
   */
  refreshOnVisible?: boolean;
}

/**
 * {@link useAutoRequest} 的返回值。
 *
 * What {@link useAutoRequest} returns.
 */
export interface UseAutoRequestResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends UseRequestResult<TData, TArgs> {
  /**
   * 在 `start()` 与 `stop()` 之间为 `true`。
   *
   * `true` between `start()` and `stop()`.
   */
  readonly running: SnailStateRef<boolean>;

  /**
   * 启动轮询并挂上刷新监听器。
   *
   * 它还会立刻发出第一个请求——等满一个间隔才发第一次调用会让视图毫无理由地空着。由于那次
   * 请求走的是 {@link refresh}，除非此前的 `send()` 已经提供过参数，它不带任何参数。
   *
   * Arm polling and the refresh listeners.
   *
   * Also fires the first request immediately — waiting a whole interval before the
   * first call would leave the view empty for no reason. Because that first request
   * uses {@link refresh}, it carries no arguments unless a `send()` already
   * provided some.
   */
  start(): void;

  /**
   * 停止轮询，并移除本 hook 注册的所有监听器。
   *
   * Disarm polling and remove every listener this hook registered.
   */
  stop(): void;

  /**
   * 立刻执行一次请求，复用上一次发送的参数。
   *
   * 在任何 `send()` 之前，这意味着完全不带参数——无法满足自身 `@Params` 的方法会拒绝，
   * 这与 `immediate` 的契约相同。
   *
   * Run one request now, reusing the arguments of the previous send.
   *
   * Before any `send()`, that means no arguments at all — a method whose `@Params`
   * cannot be satisfied would reject, which is the same contract `immediate` has.
   */
  refresh(): Promise<TData>;

  /**
   * `stop()` 加一个永久标志：已 dispose 的 hook 会忽略 `start()`。
   *
   * `stop()` plus a permanent flag: a disposed hook ignores `start()`.
   */
  dispose(): void;
}

/**
 * 让请求自己保持新鲜：轮询，加上仪表盘真正需要的那三种「用户回来了」的信号。
 *
 * ## 生命周期
 *
 * `stop()` 是唯一的释放点：它既停掉轮询定时器，**也**移除所有监听器，因此卸载后的视图不会
 * 被焦点处理器继续持有。`start()` 会重新武装两者。刷新监听器在创建时就挂上，而不是在
 * `start()` 里——一个只负责「用户回来时刷新」的 hook 不该需要额外调用——而轮询本身只在
 * `start()` 与 `stop()` 之间运行。
 *
 * ## Node 安全
 *
 * `window`/`document` 是惰性查找的，可能不存在，因此在 SSR 期间创建该 hook 无害。所有监听
 * 器都经过同一个 listener scope，这正是 `stop()` 能精确移除所添加内容的原因；用一个全新的
 * 闭包引用去移除监听器会静默泄漏。轮询定时器在 Node 上会被 `unref`，因此绝不会吊住进程
 * （或测试 worker）。
 *
 * Keep a request fresh by itself: polling plus the three "the user is back"
 * signals a dashboard actually needs.
 *
 * ```ts
 * const stats = useAutoRequest(statsApi.get, {
 *   pollingInterval: 5000,
 *   refreshOnVisible: true
 * });
 * stats.start();
 * stats.dispose();     // on unmount
 * ```
 *
 * ## Lifecycle
 *
 * `stop()` is the single release point: it halts the polling timer **and** removes
 * every listener, so an unmounted view cannot be kept alive by a focus handler.
 * `start()` re-arms both. The refresh listeners are attached at creation rather
 * than in `start()` — a hook whose only job is "refresh when the user comes back"
 * should not need an extra call — while polling itself only runs between `start()`
 * and `stop()`.
 *
 * ## Node safety
 *
 * `window`/`document` are looked up lazily and may be absent, so creating the hook
 * during SSR is harmless. Every listener goes through one listener scope, which is
 * what makes `stop()` remove exactly what was added; a listener removed with a
 * fresh closure reference would leak silently. The polling timer is `unref`'d on
 * Node so it never holds the process (or a test worker) open.
 *
 * @param method 代理后的 api 方法 / The proxied api method.
 * @param options 策略与轮询选项 / The strategy and polling options.
 * @returns 带 state 句柄、轮询开关与 `refresh` 的结果 /
 *   The result with state handles, the polling switch and `refresh`.
 */
export function useAutoRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseAutoRequestOptions<TData> = {}
): UseAutoRequestResult<TData, TArgs> {
  // Delegated rather than re-implemented: the state machine, the single-method
  // rule and the cancellation handling are identical to `useRequest`; only *when*
  // to send differs here.
  const request = useRequest<TArgs, TData>(method, { ...options, immediate: false });

  // Same adapter the state handles use — resolved from the same method, so
  // `running` cannot end up tracking a different reactivity system than `loading`.
  const adapter = resolveStateAdapter(options, method);
  const running = adapter.create<boolean>(false);
  const scope = createListenerScope();

  const interval =
    Number.isFinite(options.pollingInterval) ? Math.max(0, options.pollingInterval as number) : 0;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function refresh(): Promise<TData> {
    return request.send(...([] as unknown as TArgs));
  }

  /** Run one refresh without letting a rejection escape into a timer/listener. */
  async function refreshQuietly(): Promise<void> {
    try {
      await refresh();
    } catch {
      // The failure is already on `error` and in `onError`; rethrowing it here
      // would turn a poll into an unhandled rejection.
    }
  }

  function schedule(): void {
    if (disposed || !running.value || interval <= 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void loop();
    }, interval);
    unrefTimer(timer);
  }

  async function loop(): Promise<void> {
    await refreshQuietly();
    schedule();
  }

  function attach(): void {
    // Remove first: `start()` after `stop()` must not double-register, and a second
    // `start()` while already running is a no-op anyway.
    scope.removeAll();

    if (options.enableFocusRefresh) {
      scope.add(getWindowTarget(), "focus", () => {
        void refreshQuietly();
      });
    }
    if (options.enableReconnectRefresh) {
      scope.add(getWindowTarget(), "online", () => {
        void refreshQuietly();
      });
    }
    if (options.refreshOnVisible) {
      scope.add(getDocumentTarget(), "visibilitychange", () => {
        if (isDocumentVisible()) void refreshQuietly();
      });
    }
  }

  function start(): void {
    if (disposed || running.value) return;
    running.value = true;
    attach();
    void loop();
  }

  function stop(): void {
    running.value = false;
    clearTimer();
    scope.removeAll();
  }

  function dispose(): void {
    stop();
    disposed = true;
  }

  attach();

  if (options.immediate) start();

  return { ...request, running, start, stop, refresh, dispose };
}
