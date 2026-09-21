import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../core/context";
import type { ResolvedServerOptions } from "./server";
import type { SnailApiOptions, SnailMethodOptions } from "./api";

/**
 * 传给每个链式插件钩子的 `next` 回调。
 *
 * 调用它即把控制权交给链中的下一个插件。当后续所有插件 —— 以及真正的 HTTP 请求
 * —— 都结束后，它才会 resolve。
 *
 * The `next` callback handed to every chain-style plugin hook.
 *
 * Calling it hands control to the next plugin in the chain. It resolves once
 * every later plugin — and the actual HTTP request — has finished.
 */
export type SnailNext = () => Promise<void>;

/**
 * 插件钩子运行的阶段。
 *
 * Stage at which a plugin hook runs.
 */
export type SnailHookKind = "config" | "chain" | "effect";

/**
 * 全部生命周期钩子的名称，按执行顺序排列。
 *
 * Names of every lifecycle hook, in execution order.
 */
export type SnailHookName =
  | "install"
  | "uninstall"
  | "configureServer"
  | "configureApi"
  | "configureMethod"
  | "initMeta"
  | "beforeCreate"
  | "beforeRequest"
  | "requestInterceptor"
  | "afterResponse"
  | "responseInterceptor"
  | "onError"
  | "afterRequest";

/**
 * 插件工厂返回的对象。它就是插件契约的全部。
 *
 * 只有 `name` 是必填的，其余都是可选的生命周期钩子；插件只需实现自己关心的那些。
 *
 * Object returned by a plugin factory. This is the whole plugin contract.
 *
 * Only `name` is required. Everything else is an optional lifecycle hook; a
 * plugin implements just the hooks it cares about.
 *
 * @example
 * ```ts
 * const Timing = definePlugin(() => ({
 *   name: "timing",
 *   beforeRequest: (ctx) => { ctx.state.set("t0", Date.now()); },
 *   afterRequest: (ctx) => console.log("took", Date.now() - ctx.state.get("t0"))
 * }));
 * Service.use(Timing());
 * ```
 */
export interface SnailPluginObject<O = unknown> {
  /**
   * 插件唯一名称。在同一个服务上重复注册同名插件会报错。
   *
   * Unique plugin name. Re-registering the same name on one server is an error.
   */
  readonly name: string;

  /**
   * 每条链内的执行顺序。**数值越大越先执行。** 默认为 `0`。
   *
   * 内置插件占用了以下区间，第三方插件可以插在它们之间：
   * - `100` 拦截器
   * - `50` 版本
   * - `0` 适配器 / 框架 / 用户插件
   * - `-50` 校验
   * - `-100` 缓存
   *
   * Execution order inside each chain. **Higher runs first.** Defaults to `0`.
   *
   * Built-in plugins claim the following bands so third-party plugins can slot
   * between them:
   * - `100` interceptor
   * - `50` version
   * - `0` adapter / framework / user plugins
   * - `-50` validate
   * - `-100` cache
   */
  readonly priority?: number;

  /**
   * 必须先于本插件注册的插件名称。
   *
   * Plugin names that must be registered before this one.
   */
  readonly dependsOn?: readonly string[];

  /**
   * 创建该实例时传入的选项，供调试查看。
   *
   * Options this instance was created with, surfaced for debugging.
   */
  readonly options?: O;

  // ── registration ──────────────────────────────────────────────────────────

  /**
   * 插件被添加到服务时调用一次。
   *
   * Called once, when the plugin is added to a server.
   */
  install?(ctx: SnailPluginInstallContext, options: O): void | Promise<void>;

  /**
   * 插件被移除或服务被销毁时调用。
   *
   * Called when the plugin is removed, or when the server is disposed.
   */
  uninstall?(ctx: SnailPluginInstallContext, options: O): void | Promise<void>;

  // ── configuration (run once per decorated target) ─────────────────────────

  /**
   * 修改已解析的服务选项。在服务实例构建时运行。
   *
   * Mutate the resolved server options. Runs when the server instance is built.
   */
  configureServer?(options: ResolvedServerOptions): void;

  /**
   * 修改已解析的 api 选项。首次代理某个方法时运行。
   *
   * Mutate the resolved api options. Runs the first time a method is proxied.
   */
  configureApi?(options: SnailApiOptions, apiClass: new () => unknown): void;

  /**
   * 修改已解析的方法选项。首次代理某个方法时运行。
   *
   * Mutate the resolved method options. Runs the first time a method is proxied.
   */
  configureMethod?(options: SnailMethodOptions, methodName: string): void;

  // ── per-request lifecycle ─────────────────────────────────────────────────

  /**
   * 把本插件拥有的响应式值添加到 `ctx.meta`。
   *
   * 这纯粹是扩展点：本钩子运行时，核心已经用服务的 `stateAdapter` 创建好了五个
   * 标准句柄，因此插件做的是追加而不是替换。它 **每个方法只运行一次**（构建
   * `SnailMethod` 时），而不是每次 `send()` 都运行 —— 这正是句柄能在多次重发之间
   * 保持稳定的原因。
   *
   * Add the reactive values this plugin owns to `ctx.meta`.
   *
   * Purely an extension point: core has already created the five standard handles
   * from the server's `stateAdapter` by the time this runs, so a plugin adds rather
   * than replaces. It runs **once per method**, when the `SnailMethod` is built —
   * not once per `send()` — which is what keeps a handle stable across re-sends.
   */
  initMeta?(ctx: SnailContext): void;

  /**
   * 在 `initMeta` 之后、参数装饰器应用之前运行。
   *
   * Runs after `initMeta`, before the argument decorators are applied.
   */
  beforeCreate?(ctx: SnailContext): void;

  /**
   * 在请求交给 axios 之前运行。
   *
   * 链式钩子：`await next()` 继续。不调用 `next()` 会中止请求。设置
   * `ctx.response` 并调用 `ctx.interrupt()` 可以完全短路网络调用 —— 缓存插件
   * 命中时就是这样做的。
   *
   * Runs before the request is handed to axios.
   *
   * Chain hook: `await next()` to continue. Skipping `next()` aborts the
   * request. Setting `ctx.response` and calling `ctx.interrupt()` short-circuits
   * the network call entirely — that is how the cache plugin serves a hit.
   */
  beforeRequest?(ctx: SnailContext, next: SnailNext): Promise<void> | void;

  /**
   * 对最终 axios 配置的底层改写。
   *
   * 在 `axios.request` 之前同步运行，按注册顺序执行。返回新配置即替换它。用于
   * 签名、链路追踪请求头，以及任何必须等其他插件都处理完之后才执行的事情。
   *
   * Low-level rewrite of the final axios config.
   *
   * Runs synchronously, right before `axios.request`, in registration order.
   * Return a new config to replace it. Use this for signing, tracing headers and
   * anything that must run after every other plugin settled.
   */
  requestInterceptor?(
    config: InternalAxiosRequestConfig,
    ctx: SnailContext
  ): AxiosRequestConfig | void;

  /**
   * HTTP 往返成功之后、信封校验之前运行。
   *
   * 链式钩子：`await next()` 继续。不调用 `next()` 时，后续插件与调用方看到的
   * 就是 `ctx.response` 当时持有的内容。
   *
   * Runs after a successful HTTP round-trip, before the envelope is validated.
   *
   * Chain hook: `await next()` to continue. Skipping `next()` means later
   * plugins and the caller see whatever `ctx.response` currently holds.
   */
  afterResponse?(ctx: SnailContext, next: SnailNext): Promise<void> | void;

  /**
   * 对 axios 响应的底层改写，按注册顺序执行。
   *
   * Low-level rewrite of the axios response, in registration order.
   */
  responseInterceptor?(
    response: import("axios").AxiosResponse,
    ctx: SnailContext
  ): import("axios").AxiosResponse | void;

  /**
   * 观察失败。它无法恢复失败；需要恢复请用 `beforeRequest`。
   *
   * Observe a failure. Cannot recover it; use `beforeRequest` for that.
   */
  onError?(ctx: SnailContext, error: unknown): void;

  /**
   * 在 `finally` 中运行，无论请求成功、失败还是被取消。插件在这里释放资源、
   * 停止定时器。
   *
   * Runs in `finally`, whether the request succeeded, failed or was cancelled.
   * This is where plugins release resources and stop timers.
   */
  afterRequest?(ctx: SnailContext): void;
}

/**
 * 插件在安装期间可以使用的服务能力子集。
 *
 * The subset of server capabilities a plugin may use during install.
 */
export interface SnailPluginInstallContext {
  /**
   * 插件所安装到的服务名。
   *
   * Name of the server the plugin was installed on.
   */
  readonly serverName: string;
  /**
   * 已解析的服务选项（可变，但更推荐用 `configureServer`）。
   *
   * Resolved server options (mutable, but prefer `configureServer`).
   */
  readonly serverOptions: ResolvedServerOptions;
  /**
   * 服务上当前已注册的全部插件名，按链顺序排列。
   *
   * Names of every plugin currently registered on the server, in chain order.
   */
  readonly pluginNames: readonly string[];
}

/**
 * 插件工厂：`(options) => SnailPluginObject`。
 *
 * A plugin factory: `(options) => SnailPluginObject`.
 */
export type SnailPlugin<O = unknown> = (options?: O) => SnailPluginObject<O>;
