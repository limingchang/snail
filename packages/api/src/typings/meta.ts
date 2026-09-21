import type { SnailStateRef } from "./adapter";

/**
 * 框架适配器发布在 `SnailMethod.meta` 上、供调用方使用的句柄。
 *
 * ## 扩展方式
 *
 * 这个接口是适配器类型的 `declare module` 扩展点，与 `SnailEnvelopeSchema` 之于
 * 响应信封的关系完全一致：应用在自己的 `env.d.ts` 中声明句柄的真实类型即可。
 *
 * ## 为什么这里不声明 `data` / `code` / `message`
 *
 * 它们的名字来自 `@Server({ dataKey, codeKey, messageKey })`，这是一个运行时的
 * 值 —— 静态接口无法命名一个只有配置时才确定的键。用占位类型声明它们会让模块
 * 增强变得不可能（接口合并只能 *添加*，永远不能收窄），所以留给应用用真实载荷
 * 类型自行声明。
 *
 * `loading` 与 `error` 不同：每个适配器都拥有这两个名字且类型固定，因此在这里
 * 声明并给出精确类型。
 *
 * The caller-visible handles a framework adapter publishes on
 * `SnailMethod.meta`.
 *
 * ## Augmenting it
 *
 * This interface is the `declare module` extension point for the adapter types,
 * mirroring how `SnailEnvelopeSchema` is the one for the response envelope:
 *
 * ```ts
 * // app/env.d.ts
 * import type { Ref } from "vue";
 *
 * declare module "@snail-js/api" {
 *   interface SnailMeta {
 *     data: Ref<User>;
 *     code: Ref<number>;
 *     message: Ref<string>;
 *   }
 * }
 *
 * const method = userApi.getUser("1");
 * method.meta.data; // Ref<User>
 * ```
 *
 * ## Why `data` / `code` / `message` are not declared here
 *
 * Their names come from `@Server({ dataKey, codeKey, messageKey })`, which is a
 * runtime value — a static interface cannot name a key that is only known at
 * configuration time. Declaring them with a placeholder type would make
 * augmentation impossible (interface merging can only *add*, never narrow), so
 * they are left to the application to declare with its real payload type.
 *
 * `loading` and `error` are different: every adapter owns those two names and
 * their types are fixed, so they are declared here and typed precisely.
 */
export interface SnailMeta {
  /**
   * 请求进行中时为 `true`。任何状态适配器都会提供它。
   *
   * `true` while a request is in flight. Present with any state adapter.
   */
  loading?: SnailStateRef<boolean>;

  /**
   * 最近一次失败，没有则为 `undefined`。任何状态适配器都会提供它。
   *
   * The most recent failure, or `undefined`. Present with any state adapter.
   */
  error?: SnailStateRef<unknown>;
}
