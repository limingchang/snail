import { useSyncExternalStore } from "react";
import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * A React state box.
 *
 * Wider than {@link SnailStateRef} on purpose: React needs a subscription and a
 * snapshot that changes identity to know a re-render is due. A bare `{ value }`
 * box gives it neither, which is the classic `useSyncExternalStore` pitfall — if
 * the snapshot is the value itself, two renders with an equal primitive look
 * unchanged and React bails out.
 */
interface ReactStateBox<T> extends SnailStateRef<T> {
  /** Monotonic counter used as the `useSyncExternalStore` snapshot. */
  version: number;
  listeners: Set<() => void>;
}

function box<T>(state: SnailStateRef<T>): ReactStateBox<T> {
  return state as ReactStateBox<T>;
}

/**
 * React state adapter.
 *
 * `create` returns a subscribable box; `useBind` is what a component calls during
 * render to subscribe and re-render. Strategies therefore work in both a
 * component (via `useBind`) and an event handler (via `read`).
 *
 * This module is the only place in the library that imports `react`. It is
 * reachable solely from `@snail-js/api/strategies/react` and the `ReactAdapter`
 * plugin.
 */
export const reactStateAdapter: SnailStateAdapter = {
  name: "react",

  create<T>(initial: T): SnailStateRef<T> {
    const state: ReactStateBox<T> = {
      value: initial,
      version: 0,
      listeners: new Set()
    };
    return state;
  },

  read<T>(state: SnailStateRef<T>): T {
    return state.value;
  },

  write<T>(state: SnailStateRef<T>, value: T): void {
    const target = box(state);
    target.value = value;
    target.version += 1;
    for (const listener of [...target.listeners]) listener();
  },

  subscribe<T>(state: SnailStateRef<T>, listener: (value: T) => void): () => void {
    const target = box(state);
    // The box stores a 0-argument listener internally; the public signature
    // matches `SnailStateAdapter` and receives the new value.
    const wrapped = (): void => listener(target.value);
    target.listeners.add(wrapped);
    return () => {
      target.listeners.delete(wrapped);
    };
  },

  /**
   * Read a state during render, subscribing the current component.
   *
   * The snapshot is the version counter, not the value: React compares snapshots
   * with `Object.is`, so returning `{ id: 1 }` again would look unchanged and the
   * component would not re-render.
   */
  useBind<T>(state: SnailStateRef<T>): T {
    const target = box(state);
    useSyncExternalStore(
      (listener) => reactStateAdapter.subscribe!(state, listener),
      () => target.version,
      () => target.version
    );
    return target.value;
  },

  dispose<T>(state: SnailStateRef<T>): void {
    box(state).listeners.clear();
  }
};
