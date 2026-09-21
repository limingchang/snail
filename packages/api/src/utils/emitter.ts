/**
 * 极简的类型化事件发射器。
 *
 * 用于 `SnailMethod` 的事件接口（`onSuccess`、`onError` 等）。它刻意做得很小：
 * 不支持通配事件、没有 `once`、也不做异步调度。
 *
 * Minimal typed event emitter.
 *
 * Used for the `SnailMethod` event surface (`onSuccess`, `onError`, …). It is
 * deliberately tiny: no wildcard events, no `once`, no async scheduling.
 */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: any) => void>>();

  /**
   * 注册一个监听器。
   *
   * Register a listener.
   *
   * @param type 事件名 / The event name.
   * @param listener 事件回调 / The listener callback.
   * @returns 取消订阅函数，比为了调用 {@link off} 而长期保留引用更顺手 /
   *   an unsubscribe function — the ergonomic alternative to keeping a
   *   reference around just to call {@link off}.
   */
  on<K extends keyof Events>(
    type: K,
    listener: (payload: Events[K]) => void
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => this.off(type, listener);
  }

  /**
   * 移除之前注册的监听器。
   *
   * Remove a previously registered listener.
   *
   * @param type 事件名 / The event name.
   * @param listener 之前注册的那个回调 / The previously registered listener.
   */
  off<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * `type` 上已注册的监听器数量。
   *
   * Number of listeners registered for `type`.
   *
   * @param type 事件名 / The event name.
   * @returns 监听器数量 / The listener count.
   */
  count<K extends keyof Events>(type: K): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /**
   * 触发 `type` 的所有监听器。
   *
   * 一个抛错的监听器不能拖垮请求生命周期：`send()` 的 promise 已经正确
   * settle，一个坏掉的 UI 回调没有资格把成功的请求变成失败；同一事件的
   * 其余监听器仍会继续执行。因此错误只被**上报**，不会被重新抛出——在
   * 微任务里重新抛出是显而易见的备选方案，但它是错的：在 Node 中会变成
   * 未捕获异常，一个抛错的 toast 回调就足以带走整个进程。
   *
   * Invoke every listener for `type`.
   *
   * A throwing listener must not derail the request lifecycle: the promise from
   * `send()` has already settled correctly, and one broken UI callback has no
   * business turning a successful request into a failure. The other listeners for
   * the same event still run.
   *
   * The error is therefore *reported*, not rethrown. Rethrowing from a microtask
   * was the obvious alternative and is wrong: in Node it becomes an uncaught
   * exception, so a throwing toast handler could take the process down.
   */
  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;

    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        reportListenerError(type, error);
      }
    }
  }

  /**
   * 丢弃所有监听器；传入 `type` 时只清理该事件。
   *
   * Drop every listener, optionally only for one event type.
   *
   * @param type 只清理该事件；省略时清理全部 / Clear only this event; all when omitted.
   */
  clear<K extends keyof Events>(type?: K): void {
    if (type === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(type);
  }
}

/**
 * 把监听器抛出的异常暴露出来，同时不让它逃逸。
 *
 * `globalThis.reportError` 正是 HTML 为这一场景（异步回调失败）定义的标准，现代
 * 浏览器均已支持：它能把错误送达 `window.onerror` 与 devtools，且不会展开调用栈。
 * Node 与更早的运行时则退化为 `console.error`。
 *
 * 静默吞掉是刻意排除的选项：掩盖开发者的 bug 比多一行日志更糟。
 *
 * Surface a listener's exception without letting it escape.
 *
 * `globalThis.reportError` is the HTML standard for exactly this situation —
 * asynchronous callback failure — and exists in every modern browser, where it
 * reaches `window.onerror` and devtools without unwinding anything. Node and
 * older runtimes get `console.error`.
 *
 * Swallowing it silently is deliberately not an option: hiding a developer's bug
 * is worse than a log line.
 */
function reportListenerError(type: PropertyKey, error: unknown): void {
  const reporter = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof reporter === "function") {
    reporter(error);
    return;
  }

  console.error(`[snail] a listener for "${String(type)}" threw`, error);
}
