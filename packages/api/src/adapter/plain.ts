import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * 与框架无关的状态适配器——默认实现。
 *
 * 一个普通的可变盒子。值能正确更新，只是不会*触发*任何东西；对于测试、SSR
 * 渲染、Node 脚本或手动驱动请求的应用，这正是想要的行为。
 *
 * 可以按 server 指定，也可以完全不指定（示例见下）。
 *
 * ## 为什么它是一个值，而不是一次全局注册
 *
 * 框架的选择过去由 `setStateAdapter()` 在进程范围内安装，这让它变成了一种导入
 * 副作用——引入任意一个 strategies 入口都会静默改写同一个包中其他所有 server 的
 * 配置——也让两个使用不同框架的 server 无法共存。现在它是 server 的一个已解析
 * 选项，见 `SnailServerOptions.stateAdapter`。
 *
 * The framework-free state adapter — the default.
 *
 * A plain mutable box. Values update correctly, they just do not *trigger*
 * anything, which is exactly right for a test, an SSR pass, a Node script or an
 * application that drives requests by hand.
 *
 * Assign it per server, or not at all:
 *
 * ```ts
 * @Server({ baseURL: "/api" })                             // SnailAdapter, implicitly
 * @Server({ baseURL: "/api", stateAdapter: SnailAdapter }) // or explicitly
 * class BackEnd extends SnailServer {}
 * ```
 *
 * ## Why this is a value rather than a global registration
 *
 * The framework choice used to be installed process-wide by `setStateAdapter()`.
 * That turned it into an import side effect — importing one strategies entry point
 * silently reconfigured every other server in the bundle — and made two servers
 * with different frameworks impossible. It is now a resolved server option; see
 * `SnailServerOptions.stateAdapter`.
 */
export const SnailAdapter: SnailStateAdapter = {
  /**
   * 适配器标识符，出现在错误信息中。
   *
   * Adapter identifier, used in error messages.
   */
  name: "plain",

  /**
   * 以初始值创建一个普通可变盒子。
   *
   * Create a plain mutable box holding the initial value.
   */
  create<T>(initial: T): SnailStateRef<T> {
    return { value: initial };
  },

  /**
   * 直接读取盒子的 `value`。
   *
   * Read the box's `value` directly.
   */
  read<T>(ref: SnailStateRef<T>): T {
    return ref.value;
  },

  /**
   * 直接改写盒子的 `value`，不做任何通知。
   *
   * Write the box's `value` directly, with no notification.
   */
  write<T>(ref: SnailStateRef<T>, value: T): void {
    ref.value = value;
  }
};
