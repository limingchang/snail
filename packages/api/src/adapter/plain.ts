import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * Framework-free state adapter.
 *
 * A plain mutable box. Values update correctly, they just do not *trigger*
 * anything — which is exactly right for a test, an SSR pass or a script, and is
 * the safe default when no UI framework is present.
 *
 * A framework adapter registered with `setStateAdapter` replaces it.
 */
export const plainStateAdapter: SnailStateAdapter = {
  name: "plain",

  create<T>(initial: T): SnailStateRef<T> {
    return { value: initial };
  },

  read<T>(ref: SnailStateRef<T>): T {
    return ref.value;
  },

  write<T>(ref: SnailStateRef<T>, value: T): void {
    ref.value = value;
  }
};
