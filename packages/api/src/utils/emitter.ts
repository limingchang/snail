/**
 * Minimal typed event emitter.
 *
 * Used for the `SnailMethod` event surface (`onSuccess`, `onError`, …). It is
 * deliberately tiny: no wildcard events, no `once`, no async scheduling.
 */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: any) => void>>();

  /**
   * Register a listener.
   *
   * @returns an unsubscribe function — the ergonomic alternative to keeping a
   * reference around just to call {@link off}.
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

  /** Remove a previously registered listener. */
  off<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Number of listeners registered for `type`. */
  count<K extends keyof Events>(type: K): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /**
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

  /** Drop every listener, optionally only for one event type. */
  clear<K extends keyof Events>(type?: K): void {
    if (type === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(type);
  }
}

/**
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
