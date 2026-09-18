import type { SnailStateRef } from "../typings/adapter";
import { resolveStateAdapter } from "./shared/adapter";
import { createListenerScope, getDocumentTarget, getWindowTarget, isDocumentVisible } from "./shared/dom";
import type { StrategyMethod } from "./shared/method";
import { unrefTimer } from "./shared/timing";
import { useRequest } from "./use-request";
import type { UseRequestOptions, UseRequestResult } from "./use-request";

/** Options accepted by {@link useAutoRequest}. */
export interface UseAutoRequestOptions<TData> extends UseRequestOptions<TData> {
  /**
   * Poll every `pollingInterval` ms.
   *
   * The next tick is scheduled only **after** the previous request settles, so a
   * backend slower than the interval produces a queue of one, not an unbounded
   * pile of overlapping requests.
   */
  pollingInterval?: number;

  /** Refresh when the window regains focus. */
  enableFocusRefresh?: boolean;

  /** Refresh when the browser reports the network is back. */
  enableReconnectRefresh?: boolean;

  /** Refresh when the tab becomes visible again. */
  refreshOnVisible?: boolean;
}

/** What {@link useAutoRequest} returns. */
export interface UseAutoRequestResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends UseRequestResult<TData, TArgs> {
  /** `true` between `start()` and `stop()`. */
  readonly running: SnailStateRef<boolean>;

  /**
   * Arm polling and the refresh listeners.
   *
   * Also fires the first request immediately — waiting a whole interval before the
   * first call would leave the view empty for no reason. Because that first request
   * uses {@link refresh}, it carries no arguments unless a `send()` already
   * provided some.
   */
  start(): void;

  /** Disarm polling and remove every listener this hook registered. */
  stop(): void;

  /**
   * Run one request now, reusing the arguments of the previous send.
   *
   * Before any `send()`, that means no arguments at all — a method whose `@Params`
   * cannot be satisfied would reject, which is the same contract `immediate` has.
   */
  refresh(): Promise<TData>;

  /** `stop()` plus a permanent flag: a disposed hook ignores `start()`. */
  dispose(): void;
}

/**
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
