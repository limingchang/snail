/**
 * Guarded access to the browser globals a strategy listens to.
 *
 * The tests for this layer run in Node, where `window` and `document` do not
 * exist at all. Reading them lazily — inside a function, never at module scope —
 * is what lets the same module be imported in both environments, and it is the
 * only reason `useAutoRequest` can be created in a server-side render without
 * throwing.
 */

/**
 * The subset of `EventTarget` this layer uses.
 *
 * `(...args: any[]) => void` rather than `() => void` on purpose: `window`'s own
 * `addEventListener` expects an `EventListener`, and a zero-argument listener type
 * would make the real object structurally incompatible.
 */
export interface DomEventTargetLike {
  addEventListener(type: string, listener: (...args: any[]) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (...args: any[]) => void, options?: unknown): void;
}

/** The global `window`, or `undefined` outside a DOM environment. */
export function getWindowTarget(): DomEventTargetLike | undefined {
  if (typeof window === "undefined") return undefined;
  return window as unknown as DomEventTargetLike;
}

/** The global `document`, or `undefined` outside a DOM environment. */
export function getDocumentTarget(): DomEventTargetLike | undefined {
  if (typeof document === "undefined") return undefined;
  return document as unknown as DomEventTargetLike;
}

/**
 * `true` when the page is on screen.
 *
 * Node reports `true` so a `visibilitychange`-driven strategy still works in a
 * script; there is no hidden page to miss.
 */
export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/** A collection of registered listeners that can be removed as one unit. */
export interface ListenerScope {
  /**
   * Register `listener`. Returns `false` when the target does not exist — the
   * Node case — so the caller can tell "not attached" from "attached".
   */
  add(
    target: DomEventTargetLike | undefined,
    type: string,
    listener: (...args: any[]) => void
  ): boolean;

  /** Remove every listener registered through this scope. Safe to call twice. */
  removeAll(): void;

  /** Number of listeners currently attached. */
  readonly size: number;
}

/**
 * Create a listener bookkeeping scope.
 *
 * `stop()` and `dispose()` are called from event handlers, from `finally` blocks
 * and sometimes twice; without one central registry it is far too easy to remove a
 * listener with a *different* function reference than the one added, which leaks
 * silently and keeps the component from being collected.
 */
export function createListenerScope(): ListenerScope {
  const registered: Array<{
    target: DomEventTargetLike;
    type: string;
    listener: (...args: any[]) => void;
  }> = [];

  return {
    get size(): number {
      return registered.length;
    },

    add(
      target: DomEventTargetLike | undefined,
      type: string,
      listener: (...args: any[]) => void
    ): boolean {
      if (!target) return false;
      target.addEventListener(type, listener);
      registered.push({ target, type, listener });
      return true;
    },

    removeAll(): void {
      while (registered.length > 0) {
        const entry = registered.pop()!;
        entry.target.removeEventListener(entry.type, entry.listener);
      }
    }
  };
}
