import { SnailPluginError } from "../error/plugin";
import { t } from "../locale";
import type { SnailPluginInstallContext, SnailPluginObject } from "../typings/plugin";
import type { ResolvedServerOptions } from "../typings/server";
import { composeChain, type BoundHook } from "./plugin";

/**
 * 正向遍历插件列表的钩子名。
 *
 * Hook names that traverse the plugin list in the forward direction.
 */
const FORWARD_HOOKS = new Set<string>([
  "configureServer",
  "configureApi",
  "configureMethod",
  "initMeta",
  "beforeCreate",
  "beforeRequest",
  "requestInterceptor"
]);

/**
 * 回卷方向遍历插件列表的钩子名。
 *
 * Hook names that traverse the plugin list in the unwind direction.
 */
const UNWIND_HOOKS = new Set<string>([
  "afterResponse",
  "responseInterceptor",
  "onError",
  "afterRequest"
]);

/**
 * 注册在某个服务器上的一条插件记录。
 *
 * A plugin registered on one server.
 */
export interface RegisteredPlugin {
  /**
   * 插件名。
   *
   * Plugin name.
   */
  readonly name: string;
  /**
   * 链内排序权重；正向阶段里数值越大越先执行。
   *
   * Chain ordering weight; higher runs first in the forward phase.
   */
  readonly priority: number;
  /**
   * 注册序号，用作稳定的并列名次判定。
   *
   * Registration sequence, used as a stable tie-breaker.
   */
  readonly index: number;
  /**
   * 插件对象本身。
   *
   * The plugin object itself.
   */
  readonly instance: SnailPluginObject<any>;
}

/**
 * 每个服务器一份的插件注册表。
 *
 * ## 为什么不是单例
 *
 * 重写前的实现维护一个全局管理器，外加一个可变的 `_server` 指针，每个调用方
 * 都得先在 `getHooks()` 之前用 `switchServer()` 设置它。只要同时存在两个服务器
 * ——或者只是两个交错的 `await`——就会静默读到*错误*服务器的插件。现在每个
 * `SnailServer` 拥有自己的管理器，并在构造函数里把自己的名字传进来，这类 bug
 * 变得无法表达。
 *
 * ## 排序
 *
 * 插件按 `priority` 降序排列，相同则按注册顺序。
 *
 * - **正向钩子**按优先级从高到低执行，所以拦截器（`100`）会先于缓存
 *   （`-100`）安装。
 * - **回卷钩子**按相反方向执行，收拢成洋葱模型：离网络最近的插件最先对响应
 *   作出反应。
 *
 * ## 同步注册，异步安装
 *
 * `register()` 是同步的、立即返回，所以 `Service.use(A).use(B)` 可以自然链式
 * 书写，而 `dependsOn` 写错仍然会当场抛错。`install` 钩子本身可以是异步的；
 * {@link PluginManager.ready} 在每个请求开始、任何插件钩子运行之前被 await 一次。
 *
 * Per-server plugin registry.
 *
 * ## Why this is not a singleton
 *
 * The pre-rewrite implementation kept one global manager plus a mutable
 * `_server` pointer that every caller had to set with `switchServer()` before
 * `getHooks()`. Any two servers in flight — or simply two interleaved `await`s —
 * silently read the *wrong* server's plugins. Each `SnailServer` now owns its
 * own manager and passes its name in the constructor, so that class of bug is
 * unrepresentable.
 *
 * ## Ordering
 *
 * Plugins sort by `priority` descending, ties broken by registration order.
 *
 * - **Forward hooks** run highest-priority first, so an interceptor (`100`)
 *   installs before the cache (`-100`).
 * - **Unwind hooks** run in the opposite direction, closing the onion: the
 *   plugin closest to the network reacts to the response first.
 *
 * ## Sync registration, async install
 *
 * `register()` is synchronous and returns immediately, so `Service.use(A).use(B)`
 * chains naturally while a `dependsOn` mistake still throws on the spot. The
 * `install` hooks themselves may be async; {@link PluginManager.ready} is awaited
 * once per request, before any plugin hook runs.
 */
export class PluginManager {
  private readonly registry = new Map<string, RegisteredPlugin>();
  private readonly order: string[] = [];
  private readonly installTasks: Array<Promise<void>> = [];
  private sequence = 0;

  /**
   * 为一个服务器创建注册表。
   *
   * 服务器名与已解析的选项在构造时固定下来，之后 `install` 上下文和错误信息
   * 都取自这两项，因此不存在需要调用方维护的「当前服务器」状态。
   *
   * Create the registry for one server.
   *
   * @param serverName 服务器名 / The server name.
   * @param serverOptions 已解析的服务器选项 / The resolved server options.
   */
  constructor(
    private readonly serverName: string,
    private readonly serverOptions: ResolvedServerOptions
  ) {}

  /**
   * 已注册插件的数量。
   *
   * Number of registered plugins.
   */
  get size(): number {
    return this.registry.size;
  }

  /**
   * 所有 `install` 钩子都落定后 resolve。
   *
   * 每个请求开始前 await 它一次，异步安装的钩子因此不会缺席。
   *
   * Resolves once every `install` hook has settled.
   */
  get ready(): Promise<void> {
    return Promise.all(this.installTasks).then(() => undefined);
  }

  /**
   * 是否已注册该名字的插件。
   *
   * `true` when a plugin with this name is registered.
   *
   * @param name 插件名 / The plugin name.
   * @returns 已注册时为 `true` / `true` when it is registered.
   */
  has(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * 读取一条已注册的插件记录。
   *
   * Read one registered plugin.
   *
   * @param name 插件名 / The plugin name.
   * @returns 插件记录；未注册时为 `undefined` /
   *   The registered plugin, or `undefined` when it is not registered.
   */
  get(name: string): RegisteredPlugin | undefined {
    return this.registry.get(name);
  }

  /**
   * 按链序（正向阶段）列出已注册的插件名。
   *
   * Registered plugin names in chain order (forward phase).
   *
   * @returns 插件名数组 / The plugin names.
   */
  names(): string[] {
    return this.sorted("forward").map((entry) => entry.name);
  }

  /**
   * 按链序（正向阶段）列出全部插件记录。
   *
   * All registered plugins in chain order (forward phase).
   *
   * @returns 插件记录数组 / The registered plugin entries.
   */
  list(): RegisteredPlugin[] {
    return this.sorted("forward");
  }

  /**
   * 校验并注册一个插件。刻意保持同步。
   *
   * 插件不是对象、名字为空或重复、`dependsOn` 未满足时都会抛出
   * {@link SnailPluginError}——而且都发生在改动任何状态之前。`install` 钩子能
   * 同步执行就立即执行，钩子因此在 `use()` 返回的那一刻就已接好线；返回
   * promise 的 `install` 会进入 `ready` 的等待队列，若最终失败则回滚注册。
   *
   * Validate and register a plugin. Synchronous by design.
   *
   * Throws {@link SnailPluginError} for a nameless plugin, a duplicate name or
   * an unsatisfied `dependsOn` — all before anything is mutated.
   *
   * @param plugin 要注册的插件对象 / The plugin object to register.
   * @throws 校验失败或 `install` 抛错/拒绝时抛出 `SnailPluginError` /
   *   `SnailPluginError` when validation fails or `install` throws/rejects.
   */
  register(plugin: SnailPluginObject<any>): void {
    if (!plugin || typeof plugin !== "object") {
      throw new SnailPluginError("[snail] use() expects a plugin object");
    }

    const { name } = plugin;
    if (typeof name !== "string" || name.length === 0) {
      throw new SnailPluginError("[snail] a plugin must declare a non-empty `name`");
    }

    if (this.registry.has(name)) {
      throw new SnailPluginError(
        t("error.options.plugin.exists", name, this.serverName),
        { pluginName: name }
      );
    }

    for (const dependency of plugin.dependsOn ?? []) {
      if (!this.registry.has(dependency)) {
        throw new SnailPluginError(
          t("error.options.plugin.missing", name, dependency),
          { pluginName: name }
        );
      }
    }

    this.registry.set(name, {
      name,
      priority: Number.isFinite(plugin.priority) ? (plugin.priority as number) : 0,
      index: this.sequence++,
      instance: plugin
    });
    this.order.push(name);

    if (typeof plugin.install === "function") {
      const context: SnailPluginInstallContext = {
        serverName: this.serverName,
        serverOptions: this.serverOptions,
        pluginNames: this.names()
      };

      // `install` is invoked eagerly and synchronously when it can be, so a
      // plugin's hooks are wired the moment `use()` returns. Plugins that
      // contribute to `ctx.meta` depend on that: their `initMeta` hook must exist
      // before the first `createApi()` call. A promise-returning `install` is
      // queued on `ready`.
      let outcome: unknown;
      try {
        outcome = plugin.install(context, plugin.options);
      } catch (error) {
        this.registry.delete(name);
        this.order.pop();
        throw new SnailPluginError(
          `[snail] plugin "${name}" failed to install: ${String(error)}`,
          { pluginName: name, cause: error }
        );
      }

      if (outcome && typeof (outcome as PromiseLike<unknown>).then === "function") {
        this.installTasks.push(
          Promise.resolve(outcome).then(
            () => undefined,
            (error: unknown) => {
              throw new SnailPluginError(
                `[snail] plugin "${name}" failed to install: ${String(error)}`,
                { pluginName: name, cause: error }
              );
            }
          )
        );
      }
    }
  }

  /**
   * 注销一个插件，先运行它的 `uninstall` 钩子。
   *
   * 名字未注册时抛错；`uninstall` 成功后才从链表里摘除。
   *
   * Unregister a plugin, running its `uninstall` hook first.
   *
   * @param name 插件名 / The plugin name.
   * @throws 该名字未注册时抛出 `SnailPluginError` /
   *   `SnailPluginError` when the name is not registered.
   */
  async remove(name: string): Promise<void> {
    const entry = this.registry.get(name);
    if (!entry) {
      throw new SnailPluginError(
        t("error.options.plugin.notFound", name, this.serverName),
        { pluginName: name }
      );
    }

    await entry.instance.uninstall?.(
      {
        serverName: this.serverName,
        serverOptions: this.serverOptions,
        pluginNames: this.names()
      },
      entry.instance.options
    );

    this.registry.delete(name);
    const at = this.order.indexOf(name);
    if (at !== -1) this.order.splice(at, 1);
  }

  /**
   * 移除所有插件，按注册顺序的反向逐个卸载。
   *
   * Remove every plugin, unwinding in reverse registration order.
   */
  async clear(): Promise<void> {
    for (const name of [...this.order].reverse()) {
      await this.remove(name);
    }
  }

  /**
   * 排好序的插件列表。
   *
   * `"forward"` → 优先级降序（最高在前）。
   * `"unwind"` → 优先级升序（最高在后）。
   *
   * Sorted plugin list.
   *
   * `"forward"` → priority descending (highest first).
   * `"unwind"` → priority ascending (highest last).
   *
   * @param direction 遍历方向 / The traversal direction.
   * @returns 排好序的插件记录 / The sorted plugin entries.
   */
  sorted(direction: "forward" | "unwind"): RegisteredPlugin[] {
    const entries = this.order
      .map((name) => this.registry.get(name))
      .filter((entry): entry is RegisteredPlugin => entry !== undefined);

    entries.sort((a, b) =>
      a.priority === b.priority ? a.index - b.index : b.priority - a.priority
    );

    return direction === "forward" ? entries : entries.reverse();
  }

  /**
   * 某一类钩子的绑定列表，按该类钩子自己的遍历方向排列。
   *
   * 只收拢实现了该钩子的插件；钩子名既不在正向表也不在回卷表里时抛错，避免
   * 把拼错的钩子名当成「没有插件实现」而静默通过。
   *
   * Hooks of one name, in the direction that hook traverses.
   *
   * @param hookName 钩子名 / The hook name.
   * @returns 已绑定插件名的钩子列表 / The hooks, each tagged with its plugin name.
   * @throws 未知钩子名时抛出 `SnailPluginError` /
   *   `SnailPluginError` when the hook name is unknown.
   */
  hooks(hookName: string): BoundHook[] {
    if (!FORWARD_HOOKS.has(hookName) && !UNWIND_HOOKS.has(hookName)) {
      throw new SnailPluginError(t("error.hook.unknown", hookName));
    }

    const direction = FORWARD_HOOKS.has(hookName) ? "forward" : "unwind";
    const bound: BoundHook[] = [];

    for (const entry of this.sorted(direction)) {
      const hook = (entry.instance as unknown as Record<string, unknown>)[hookName];
      if (typeof hook === "function") {
        bound.push({ pluginName: entry.name, hook: hook as BoundHook["hook"] });
      }
    }

    return bound;
  }

  /**
   * 是否至少有一个插件实现了 `hookName`。
   *
   * `true` when at least one plugin implements `hookName`.
   *
   * @param hookName 钩子名 / The hook name.
   * @returns 有实现时为 `true` / `true` when some plugin implements it.
   */
  hasHook(hookName: string): boolean {
    for (const name of this.order) {
      const hook = (this.registry.get(name)!.instance as unknown as Record<string, unknown>)[
        hookName
      ];
      if (typeof hook === "function") return true;
    }
    return false;
  }

  /**
   * 让所有插件依次跑一遍链式钩子，最后执行 `downstream`。
   *
   * 某个插件若始终不调用 `next()`，链条就停在那里，`downstream`（对
   * `beforeRequest` 而言就是 HTTP 请求本身）永远不执行——缓存命中的机制正是
   * 如此。没有任何插件实现该钩子时直接执行 `downstream`。
   *
   * Run a chain hook over every plugin, then `downstream`.
   *
   * A plugin that never calls `next()` stops the chain: `downstream` (for
   * `beforeRequest`, the HTTP request itself) never runs. That is the mechanism
   * behind a cache hit.
   *
   * @param hookName 钩子名 / The hook name.
   * @param ctx 传给每个钩子的上下文 / The context handed to every hook.
   * @param downstream 链条走完后执行的收尾逻辑 / The tail run after the chain ends.
   */
  async runChain(
    hookName: string,
    ctx: unknown,
    downstream?: () => Promise<void> | void
  ): Promise<void> {
    const hooks = this.hooks(hookName);
    if (hooks.length === 0) {
      await downstream?.();
      return;
    }
    await composeChain(hookName, hooks)(ctx, downstream);
  }

  /**
   * 让所有插件跑一遍非链式钩子，逐个 await、顺序执行。
   *
   * Run a non-chain hook over every plugin, sequentially and awaited.
   *
   * @param hookName 钩子名 / The hook name.
   * @param args 传给每个钩子的参数 / The arguments handed to every hook.
   */
  async runEffects(hookName: string, ...args: unknown[]): Promise<void> {
    for (const { hook } of this.hooks(hookName)) {
      await hook(...args);
    }
  }

  /**
   * 同步跑一遍非链式钩子——用于构造函数阶段的钩子。
   *
   * 与 {@link PluginManager.runEffects} 不同，它不等返回值，所以只适合
   * 纯同步的钩子（如 `configureServer`）。
   *
   * Run a non-chain hook synchronously — for constructor-time hooks.
   *
   * @param hookName 钩子名 / The hook name.
   * @param args 传给每个钩子的参数 / The arguments handed to every hook.
   */
  runEffectsSync(hookName: string, ...args: unknown[]): void {
    for (const { hook } of this.hooks(hookName)) {
      hook(...args);
    }
  }

  /**
   * 把一个值穿过所有插件的同名钩子做折叠。
   *
   * 供 `requestInterceptor` / `responseInterceptor` 使用：每个插件都可以返回
   * 它所收到值的替代品，返回 `undefined` 或 `null` 则保留上一个值。
   *
   * Fold a value through every plugin's hook.
   *
   * Used by `requestInterceptor` / `responseInterceptor`, where each plugin may
   * return a replacement for the value it received. Returning `undefined` keeps
   * the previous value.
   *
   * @param hookName 钩子名 / The hook name.
   * @param initial 折叠的初始值 / The initial value to fold.
   * @param args 追加传给每个钩子的参数 / Extra arguments passed to every hook.
   * @returns 折叠后的最终值 / The final folded value.
   */
  reduce<T>(hookName: string, initial: T, ...args: unknown[]): T {
    let current = initial;
    for (const { hook } of this.hooks(hookName)) {
      const next = hook(current, ...args);
      if (next !== undefined && next !== null) current = next as T;
    }
    return current;
  }
}
