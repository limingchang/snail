import { registerMessages } from "../locale";
import type { SnailMessages } from "../locale/types";
import type { SnailParamResolver } from "../typings/args";
import type {
  SnailNext,
  SnailPlugin,
  SnailPluginInstallContext,
  SnailPluginObject
} from "../typings/plugin";
import type { ResolvedServerOptions } from "../typings/server";
import { registerParamResolver } from "./args";
import { SnailHookError } from "../error/hook";
import { t } from "../locale";

/**
 * 插件机制。
 *
 * ## 一切都是插件
 *
 * 核心*不*内置任何可选行为：缓存、版本管理、拦截器、校验、转换全都是插件。
 * 核心只管三件事——装饰器写下的元数据、请求流水线，以及这里的插件生命周期。
 * 连框架集成都不是插件，而是 `stateAdapter` 服务器选项，因为它必须用一份声明
 * 同时驱动 `method.meta` 和各个 `use*` 策略。
 *
 * ## 两类钩子
 *
 * - **链式钩子**（`beforeRequest`、`afterResponse`）是 Koa 风格的中间件：
 *   钩子拿到 `next`，可以 `await` 它，也可以选择不调用它来终止请求。这正是
 *   横切关注点能够组合的原因。
 * - **副作用钩子**（`initMeta`、`beforeCreate`、`onError`、`afterRequest`）
 *   顺序执行，不能影响控制流。
 *
 * Plugin machinery.
 *
 * ## Everything is a plugin
 *
 * The core ships *no* optional behaviour: caching, versioning, interceptors,
 * validation and transformation are all plugins. Core owns exactly three things —
 * the metadata written by decorators, the request pipeline, and this plugin
 * lifecycle. Even the framework integration is not a plugin: it is the
 * `stateAdapter` server option, because it has to drive both `method.meta` and the
 * `use*` strategies from one declaration.
 *
 * ## Two kinds of hook
 *
 * - **Chain hooks** (`beforeRequest`, `afterResponse`) are Koa-style middleware:
 *   a hook receives `next`, may `await` it, and may decline to call it to stop
 *   the request. This is what makes cross-cutting concerns composable.
 * - **Effect hooks** (`initMeta`, `beforeCreate`, `onError`, `afterRequest`) run
 *   sequentially and cannot influence control flow.
 */

/**
 * 恒等辅助函数，用来保住插件工厂的选项类型。
 *
 * 它只是把传入的工厂原样返回；作用是让 `O` 从调用处推断出来，而不必在每一层
 * 手写泛型参数。
 *
 * Identity helper that preserves the option type of a plugin factory.
 *
 * @param factory 插件工厂 / The plugin factory.
 * @returns 同一个工厂 / The very same factory.
 */
export function definePlugin<O = unknown>(factory: SnailPlugin<O>): SnailPlugin<O> {
  return factory;
}

/**
 * 交给插件 `setup` 函数的一组构建块。
 *
 * Building blocks handed to a plugin's `setup` function.
 */
export interface PluginSetupApi {
  /**
   * 该插件所安装到的服务器名称。
   *
   * Name of the server this plugin was installed on.
   */
  readonly serverName: string;

  /**
   * 已补齐默认值的服务器选项。
   *
   * Fully resolved server options.
   */
  readonly serverOptions: ResolvedServerOptions;

  /**
   * 在该插件之前注册的插件名称列表。
   *
   * Names of the plugins registered before this one.
   */
  readonly installedPlugins: readonly string[];

  /**
   * 注册一个可用 `@Source("key")` 引用的自定义参数来源。
   *
   * 注册是全局的：解析器按 source 名查找，参数装饰器只写下名字。
   *
   * Register a custom parameter source usable as `@Source("key")`.
   *
   * @param source 来源名，`@Source(...)` 中写的就是它 / The source name used by `@Source(...)`.
   * @param resolver 取值函数 / The resolver that produces the value.
   * @example
   * ```ts
   * api.defineParamSource("tenant", ({ ctx, value }) => {
   *   ctx.request.headers.set("x-tenant", String(value));
   * });
   * ```
   */
  defineParamSource(source: string, resolver: SnailParamResolver): void;

  /**
   * 为本插件自己的错误输出贡献翻译文案。
   *
   * Contribute translated messages for this plugin's own error output.
   *
   * @param messages 以文案 id 为键的多语言条目 / Locale entries keyed by message id.
   */
  addMessages(messages: SnailMessages): void;

  /**
   * 注册在插件被卸载时执行的清理逻辑。
   *
   * 与 `uninstall` 不同，这里可以注册多个，卸载时按后进先出依次 await。
   *
   * Register cleanup to run when the plugin is uninstalled.
   *
   * @param dispose 清理函数，可返回 promise / The cleanup function, possibly async.
   */
  onDispose(dispose: () => void | Promise<void>): void;
}

/**
 * {@link createPlugin} 接受的声明式描述。
 *
 * Declarative description accepted by {@link createPlugin}.
 */
export interface PluginDefinition<O, Hooks extends object> {
  /**
   * 唯一的插件名。
   *
   * Unique plugin name.
   */
  readonly name: string;

  /**
   * 链内的执行顺序，数值越大越先执行。默认 `0`。
   *
   * Execution order inside a chain; higher runs first. Defaults to `0`.
   *
   * @defaultValue `0`
   */
  readonly priority?: number;

  /**
   * 必须先完成注册的插件名。
   *
   * Plugin names that must be registered first.
   */
  readonly dependsOn?: readonly string[];

  /**
   * 每个服务器安装时运行一次。
   *
   * 用它注册参数来源、添加文案、初始化状态，或在闭包里捕获选项。返回值即
   * 生命周期钩子。
   *
   * Runs once per server, at install time.
   *
   * Use it to register parameter sources, add messages, seed state or capture
   * options in a closure. Return the lifecycle hooks.
   *
   * @param options 调用插件工厂时传入的选项 / The options passed to the plugin factory.
   * @param api 本次安装的构建块 / The building blocks for this installation.
   * @returns 要挂到插件对象上的钩子，可不返回 /
   *   The hooks to attach to the plugin object; optional.
   */
  readonly setup?: (options: O, api: PluginSetupApi) => Hooks | void;
}

/**
 * 插件可以返回的生命周期钩子，不含注册用的那几项。
 *
 * 从 {@link SnailPluginObject} 里去掉 `name`、`priority`、`dependsOn`、
 * `install`、`uninstall`——这些由 {@link createPlugin} 负责装配。
 *
 * The lifecycle hooks a plugin may return, excluding registration plumbing.
 */
export type PluginHooks = Omit<SnailPluginObject, "name" | "priority" | "dependsOn" | "install" | "uninstall">;

/**
 * 创建一个第三方插件。
 *
 * 这是插件作者应当使用的入口：它校验名字、接好 `install` / `uninstall`、暴露
 * 作用域内的 {@link PluginSetupApi}，并让钩子对象保持完整类型。
 *
 * `setup` 返回的钩子会在安装时直接并入插件对象；`onDispose` 注册的清理函数
 * 按后进先出依次执行。
 *
 * Create a third-party plugin.
 *
 * This is the supported entry point for plugin authors. It validates the name,
 * wires `install`/`uninstall`, exposes a scoped {@link PluginSetupApi} and keeps
 * the hook object fully typed.
 *
 * @param definition 插件定义 / The plugin definition.
 * @returns 接收选项并返回插件对象的工厂 / A factory that takes options and returns a plugin.
 * @throws 名字缺失或为空时抛出 `TypeError` /
 *   `TypeError` when the name is missing or empty.
 * @example
 * ```ts
 * interface TraceOptions { header?: string }
 *
 * export const Trace = createPlugin<TraceOptions, { onSend?: (url: string) => void }>({
 *   name: "trace",
 *   priority: 20,
 *   setup(options, api) {
 *     const header = options?.header ?? "x-trace-id";
 *     api.addMessages({ "trace.missing": "trace header %s is missing" });
 *     return {
 *       beforeRequest(ctx) {
 *         ctx.request.headers.set(header, crypto.randomUUID());
 *       }
 *     };
 *   }
 * });
 *
 * Service.use(Trace({ header: "x-trace-id" }));
 * ```
 */
export function createPlugin<O = void, Hooks extends object = PluginHooks>(
  definition: PluginDefinition<O, Hooks>
): SnailPlugin<O> {
  if (!definition || typeof definition.name !== "string" || definition.name.length === 0) {
    throw new TypeError("[snail] createPlugin() requires a non-empty `name`");
  }

  const { name, priority = 0, dependsOn, setup } = definition;

  return (options?: O): SnailPluginObject<O> => {
    const disposers: Array<() => void | Promise<void>> = [];

    const plugin: SnailPluginObject<O> = {
      name,
      priority,
      dependsOn,
      options,
      install(installCtx: SnailPluginInstallContext) {
        if (!setup) return;

        const hooks = setup(options as O, {
          serverName: installCtx.serverName,
          serverOptions: installCtx.serverOptions,
          installedPlugins: installCtx.pluginNames,
          defineParamSource: registerParamResolver,
          addMessages: registerMessages,
          onDispose: (dispose) => {
            disposers.push(dispose);
          }
        });

        // Hooks are merged onto the object rather than revealed through getters.
        // `install` runs synchronously during `use()`, so anything reading the
        // hook list afterwards — the manager's `hooks()` and `hasHook()` — sees
        // exactly the same object either way, and this shape is far harder to
        // get subtly wrong.
        if (hooks) Object.assign(plugin, hooks);
      },
      async uninstall() {
        while (disposers.length > 0) {
          await disposers.pop()!();
        }
      }
    };

    return plugin;
  };
}

/**
 * 一个已绑定到所属插件的钩子。
 *
 * One hook bound to the plugin that owns it.
 */
export interface BoundHook {
  /**
   * 拥有该钩子的插件名，报错时用它定位。
   *
   * The name of the plugin that owns the hook, used in error messages.
   */
  readonly pluginName: string;
  /**
   * 钩子函数本身。
   *
   * The hook function itself.
   */
  readonly hook: (...args: any[]) => any;
}

/**
 * 把链式钩子合成一个 Koa 风格的函数。
 *
 * 返回的函数先运行 `entries[0]`（它们已由管理器排好序），并给每个钩子一个
 * 推进链条的 `next`。链条走完后运行 `downstream`——管理器正是在那里把真正的
 * HTTP 请求插进 `beforeRequest` 与 `afterResponse` 之间。
 *
 * 同一个钩子调用两次 `next()` 会抛出 {@link SnailHookError}；没有这道防线，
 * 第二次调用会悄悄把链条剩下的部分再跑一遍。
 *
 * Compose chain hooks into a single Koa-style function.
 *
 * The returned function runs `entries[0]` first (they are pre-sorted by the
 * manager), handing each hook a `next` that advances the chain. When the chain
 * is exhausted, `downstream` runs — that is where the manager splices in the
 * actual HTTP request between `beforeRequest` and `afterResponse`.
 *
 * Calling `next()` twice from one hook throws {@link SnailHookError}; without
 * that guard the second call silently re-runs the rest of the chain.
 *
 * @param hookName 钩子名，只用于报错 / The hook name, used for error messages only.
 * @param entries 已排序的钩子列表 / The pre-sorted hooks.
 * @returns 可执行的链式函数 / The runnable chain function.
 */
export function composeChain(
  hookName: string,
  entries: readonly BoundHook[]
): (ctx: unknown, downstream?: () => Promise<void> | void) => Promise<void> {
  return async function runChain(ctx, downstream) {
    let lastIndex = -1;

    const dispatch = async (index: number): Promise<void> => {
      if (index <= lastIndex) {
        const offender = entries[Math.max(lastIndex, 0)]?.pluginName ?? "unknown";
        throw new SnailHookError(
          hookName,
          t("error.hook.next.multiple", offender, hookName)
        );
      }
      lastIndex = index;

      const entry = entries[index];
      if (!entry) {
        await downstream?.();
        return;
      }

      let advanced = false;
      const next: SnailNext = async () => {
        if (advanced) {
          throw new SnailHookError(
            hookName,
            t("error.hook.next.multiple", entry.pluginName, hookName)
          );
        }
        advanced = true;
        await dispatch(index + 1);
      };

      await entry.hook(ctx, next);
    };

    await dispatch(0);
  };
}
