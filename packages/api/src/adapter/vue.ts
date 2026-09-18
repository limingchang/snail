import { isRef, ref, type Ref } from "vue";
import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * Vue 3 state adapter.
 *
 * A Vue `Ref<T>` already *is* a `{ value: T }` box, so this adapter is almost pure
 * identity — `create` hands back the ref and `read`/`write` touch `.value`. Vue's
 * render effect tracks the `.value` access itself, which is why no `subscribe`
 * implementation is needed: there is nothing to notify manually.
 *
 * ```ts
 * import { VueRef } from "@snail-js/api/adapter/vue";
 *
 * @Server({ baseURL: "/api", stateAdapter: VueRef })
 * class BackEnd extends SnailServer {}
 *
 * const user = Service.createApi(UserApi).getUser("1");
 * user.meta.loading;                     // Ref<boolean>
 *
 * const { data, loading } = useRequest(userApi.getUser);
 * data;                                  // Ref<User | undefined>
 * ```
 *
 * Declaring it once on `@Server` drives **both** projections: the handles on
 * `method.meta` and the state every `use*` hook returns. There is no second place
 * to configure and no global to fight over.
 *
 * This module is the only place in the library that imports `vue`, and it is
 * reached solely through the `@snail-js/api/adapter/vue` subpath — so an
 * application that never imports it never pulls Vue in.
 */
export const VueRef: SnailStateAdapter = {
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

  /** `true` when a value already is a Vue ref — lets core avoid replacing one. */
  isState(value: unknown): boolean {
    return isRef(value);
  }
};
