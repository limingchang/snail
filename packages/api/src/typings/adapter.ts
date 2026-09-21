/**
 * 框架状态抽象层。
 *
 * 有两个调用方需要随请求推进而更新的值：策略钩子（`useRequest` 等）与核心本身
 * （它在 `method.meta` 上构建句柄）。“更新”在每个框架里的含义都不同，所以两者
 * 都不直接触碰 `ref()` 或 `useState()`，而是统一经过按服务选定一次的
 * {@link SnailStateAdapter}。
 *
 * 状态句柄刻意做到最小：任何带有可写 `value` 属性的对象都算数，这正是 Vue 的
 * `Ref<T>`。
 *
 * Framework state abstraction.
 *
 * Two callers need values that update as a request progresses: the strategy hooks
 * (`useRequest` and friends) and core itself, which builds the handles on
 * `method.meta`. "Updates" means something different in every framework, so neither
 * touches `ref()` or `useState()` directly — both go through a
 * {@link SnailStateAdapter}, chosen once per server.
 *
 * A state handle is intentionally minimal: anything with a mutable `value`
 * property qualifies, which is exactly what a Vue `Ref<T>` is.
 */

/**
 * 一个被追踪的值。
 *
 * A tracked value. Vue's `Ref<T>` structurally satisfies this.
 */
export interface SnailStateRef<T = unknown> {
  /**
   * 当前值。
   *
   * The current value.
   */
  value: T;
}

/**
 * 策略与某个 UI 框架响应式系统之间的桥梁。
 *
 * Bridge between the strategies and one UI framework's reactivity system.
 */
export interface SnailStateAdapter {
  /**
   * 用于错误信息中的标识符，例如 `"vue"`。
   *
   * Identifier used in error messages, e.g. `"vue"`.
   */
  readonly name: string;

  /**
   * 以初始值创建一个被追踪的值。
   *
   * Create a tracked value with an initial value.
   */
  create<T>(initial: T): SnailStateRef<T>;

  /**
   * 读取当前值。
   *
   * Read the current value.
   */
  read<T>(ref: SnailStateRef<T>): T;

  /**
   * 写入新值。
   *
   * Write a new value.
   */
  write<T>(ref: SnailStateRef<T>, value: T): void;

  /**
   * 订阅变化。
   *
   * 需要靠订阅触发重新渲染的框架（React）必须实现它；Vue 的 `ref()` 由渲染副作用
   * 自身追踪，因此其适配器省略了本方法。
   *
   * Subscribe to changes.
   *
   * Required by frameworks that re-render on subscription (React). Vue's
   * `ref()` is tracked by the render effect itself, so its adapter omits this.
   */
  subscribe?<T>(ref: SnailStateRef<T>, listener: (value: T) => void): () => void;

  /**
   * 在渲染期间读取状态，并订阅当前组件。
   *
   * React 的 `useSyncExternalStore` 就落在这里；Vue 不需要任何处理。
   *
   * Read a state during render, subscribing the current component.
   *
   * React's `useSyncExternalStore` lives here; Vue needs nothing.
   */
  useBind?<T>(ref: SnailStateRef<T>): T;

  /**
   * 当某个值已经是该框架的状态句柄时返回 `true`。
   *
   * `true` when a value already is a state handle of this framework.
   */
  isState?(value: unknown): boolean;

  /**
   * 释放适配器为该状态分配的资源。
   *
   * Release whatever the adapter allocated for this state.
   */
  dispose?<T>(ref: SnailStateRef<T>): void;
}

/**
 * 所有请求策略共用的选项。
 *
 * Options shared by every request strategy.
 */
export interface SnailStrategyCommonOptions {
  /**
   * 策略创建后立即发起请求。默认为 `false`。
   *
   * Run the request as soon as the strategy is created. Defaults to `false`.
   */
  immediate?: boolean;

  /**
   * 本钩子自有句柄所使用的状态适配器。
   *
   * 默认取该钩子所属方法所在服务的 `stateAdapter`，回退到 `SnailAdapter`。在这里
   * 覆盖只影响本钩子的状态 —— 它绝不会改动属于服务的 `method.meta`。
   *
   * State adapter for this hook's own handles.
   *
   * Defaults to the `stateAdapter` of the server that owns the method the hook was
   * given, falling back to `SnailAdapter`. Overriding it here affects only this
   * hook's state — it never changes `method.meta`, which belongs to the server.
   */
  adapter?: SnailStateAdapter;

  /**
   * 请求成功后调用。
   *
   * Called after a successful request.
   */
  onSuccess?: (data: unknown) => void;

  /**
   * 请求失败后调用。
   *
   * Called after a failed request.
   */
  onError?: (error: unknown) => void;

  /**
   * 请求结束时调用，无论成功与否。
   *
   * Called once the request settles, successfully or not.
   */
  onFinish?: () => void;
}
