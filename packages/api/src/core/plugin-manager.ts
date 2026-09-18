import { SnailPluginError } from "../error/plugin";
import { t } from "../locale";
import type { SnailPluginInstallContext, SnailPluginObject } from "../typings/plugin";
import type { ResolvedServerOptions } from "../typings/server";
import { composeChain, type BoundHook } from "./plugin";

/** Hook names that traverse the plugin list in the forward direction. */
const FORWARD_HOOKS = new Set<string>([
  "configureServer",
  "configureApi",
  "configureMethod",
  "initMeta",
  "beforeCreate",
  "beforeRequest",
  "requestInterceptor"
]);

/** Hook names that traverse the plugin list in the unwind direction. */
const UNWIND_HOOKS = new Set<string>([
  "afterResponse",
  "responseInterceptor",
  "onError",
  "afterRequest"
]);

/** A plugin registered on one server. */
export interface RegisteredPlugin {
  /** Plugin name. */
  readonly name: string;
  /** Chain ordering weight; higher runs first in the forward phase. */
  readonly priority: number;
  /** Registration sequence, used as a stable tie-breaker. */
  readonly index: number;
  /** The plugin object itself. */
  readonly instance: SnailPluginObject<any>;
}

/**
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

  constructor(
    private readonly serverName: string,
    private readonly serverOptions: ResolvedServerOptions
  ) {}

  /** Number of registered plugins. */
  get size(): number {
    return this.registry.size;
  }

  /** Resolves once every `install` hook has settled. */
  get ready(): Promise<void> {
    return Promise.all(this.installTasks).then(() => undefined);
  }

  /** `true` when a plugin with this name is registered. */
  has(name: string): boolean {
    return this.registry.has(name);
  }

  /** Read one registered plugin. */
  get(name: string): RegisteredPlugin | undefined {
    return this.registry.get(name);
  }

  /** Registered plugin names in chain order (forward phase). */
  names(): string[] {
    return this.sorted("forward").map((entry) => entry.name);
  }

  /** All registered plugins in chain order (forward phase). */
  list(): RegisteredPlugin[] {
    return this.sorted("forward");
  }

  /**
   * Validate and register a plugin. Synchronous by design.
   *
   * Throws {@link SnailPluginError} for a nameless plugin, a duplicate name or
   * an unsatisfied `dependsOn` — all before anything is mutated.
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

  /** Unregister a plugin, running its `uninstall` hook first. */
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

  /** Remove every plugin, unwinding in reverse registration order. */
  async clear(): Promise<void> {
    for (const name of [...this.order].reverse()) {
      await this.remove(name);
    }
  }

  /**
   * Sorted plugin list.
   *
   * `"forward"` → priority descending (highest first).
   * `"unwind"` → priority ascending (highest last).
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

  /** Hooks of one name, in the direction that hook traverses. */
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

  /** `true` when at least one plugin implements `hookName`. */
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
   * Run a chain hook over every plugin, then `downstream`.
   *
   * A plugin that never calls `next()` stops the chain: `downstream` (for
   * `beforeRequest`, the HTTP request itself) never runs. That is the mechanism
   * behind a cache hit.
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

  /** Run a non-chain hook over every plugin, sequentially and awaited. */
  async runEffects(hookName: string, ...args: unknown[]): Promise<void> {
    for (const { hook } of this.hooks(hookName)) {
      await hook(...args);
    }
  }

  /** Run a non-chain hook synchronously — for constructor-time hooks. */
  runEffectsSync(hookName: string, ...args: unknown[]): void {
    for (const { hook } of this.hooks(hookName)) {
      hook(...args);
    }
  }

  /**
   * Fold a value through every plugin's hook.
   *
   * Used by `requestInterceptor` / `responseInterceptor`, where each plugin may
   * return a replacement for the value it received. Returning `undefined` keeps
   * the previous value.
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
