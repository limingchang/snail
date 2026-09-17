import { isRef, ref, type Ref } from "vue";
import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * Vue 3 state adapter.
 *
 * A Vue `Ref<T>` already *is* a `{ value: T }` box, so this adapter is almost
 * pure identity — `create` hands back the ref and `read`/`write` touch `.value`.
 * Vue's render effect tracks the `.value` access itself, which is why no
 * `subscribe` implementation is needed: there is nothing to notify manually.
 *
 * This module is the only place in the library that imports `vue`, and it is only
 * reachable from the strategies' default entry point and the `VueAdapter` plugin.
 * Applications that never import either never pull Vue in.
 */
export const vueStateAdapter: SnailStateAdapter = {
  name: "vue",

  create<T>(initial: T): SnailStateRef<T> {
    return ref(initial) as unknown as SnailStateRef<T>;
  },

  read<T>(state: SnailStateRef<T>): T {
    return (state as Ref<T>).value;
  },

  write<T>(state: SnailStateRef<T>, value: T): void {
    (state as Ref<T>).value = value;
  },

  /** `true` when a value already is a Vue ref. */
  isState(value: unknown): boolean {
    return isRef(value);
  }
};
