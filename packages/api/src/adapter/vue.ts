import { isRef, ref, type Ref } from "vue";
import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * Vue 3 状态适配器。
 *
 * Vue 的 `Ref<T>` 本身*就是*一个 `{ value: T }` 盒子，所以这个适配器几乎是恒等
 * 映射——`create` 直接返回 ref，`read`/`write` 触碰 `.value`。Vue 的渲染副作用
 * 自己就会追踪 `.value` 的访问，这正是无需实现 `subscribe` 的原因：没有任何东西
 * 需要手动通知。
 *
 * 在 `@Server` 上声明一次，就同时驱动**两种投影**：`method.meta` 上的句柄，以及
 * 每个 `use*` 钩子返回的状态。没有第二处需要配置，也没有全局状态需要争抢。
 *
 * 本模块是库中唯一导入 `vue` 的地方，且只能通过 `@snail-js/api/adapter/vue`
 * 子路径触达——因此从不导入它的应用永远不会把 Vue 打进来。
 *
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
  /**
   * 适配器标识符，出现在错误信息中。
   *
   * Adapter identifier, used in error messages.
   */
  name: "vue",

  /**
   * 创建一个新的 Vue ref；它本身就是状态句柄。
   *
   * Create a fresh Vue ref, which is itself the state handle.
   */
  create<T>(initial: T): SnailStateRef<T> {
    return ref(initial) as unknown as SnailStateRef<T>;
  },

  /**
   * 读取 ref 的 `.value`。
   *
   * Read the `.value` of the ref.
   */
  read<T>(state: SnailStateRef<T>): T {
    return (state as Ref<T>).value;
  },

  /**
   * 写入 ref 的 `.value`，由 Vue 负责通知。
   *
   * Write the ref's `.value`; Vue takes care of notifying.
   */
  write<T>(state: SnailStateRef<T>, value: T): void {
    (state as Ref<T>).value = value;
  },

  /**
   * 值本身已经是 Vue ref 时返回 `true`——让核心不必再包一层。
   *
   * `true` when a value already is a Vue ref — lets core avoid replacing one.
   */
  isState(value: unknown): boolean {
    return isRef(value);
  }
};
