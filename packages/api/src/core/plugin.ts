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

/** Identity helper that preserves the option type of a plugin factory. */
export function definePlugin<O = unknown>(factory: SnailPlugin<O>): SnailPlugin<O> {
  return factory;
}

/** Building blocks handed to a plugin's `setup` function. */
export interface PluginSetupApi {
  /** Name of the server this plugin was installed on. */
  readonly serverName: string;

  /** Fully resolved server options. */
  readonly serverOptions: ResolvedServerOptions;

  /** Names of the plugins registered before this one. */
  readonly installedPlugins: readonly string[];

  /**
   * Register a custom parameter source usable as `@Source("key")`.
   *
   * @example
   * ```ts
   * api.defineParamSource("tenant", ({ ctx, value }) => {
   *   ctx.request.headers.set("x-tenant", String(value));
   * });
   * ```
   */
  defineParamSource(source: string, resolver: SnailParamResolver): void;

  /** Contribute translated messages for this plugin's own error output. */
  addMessages(messages: SnailMessages): void;

  /** Register cleanup to run when the plugin is uninstalled. */
  onDispose(dispose: () => void | Promise<void>): void;
}

/** Declarative description accepted by {@link createPlugin}. */
export interface PluginDefinition<O, Hooks extends object> {
  /** Unique plugin name. */
  readonly name: string;

  /** Execution order inside a chain; higher runs first. Defaults to `0`. */
  readonly priority?: number;

  /** Plugin names that must be registered first. */
  readonly dependsOn?: readonly string[];

  /**
   * Runs once per server, at install time.
   *
   * Use it to register parameter sources, add messages, seed state or capture
   * options in a closure. Return the lifecycle hooks.
   */
  readonly setup?: (options: O, api: PluginSetupApi) => Hooks | void;
}

/** The lifecycle hooks a plugin may return, excluding registration plumbing. */
export type PluginHooks = Omit<SnailPluginObject, "name" | "priority" | "dependsOn" | "install" | "uninstall">;

/**
 * Create a third-party plugin.
 *
 * This is the supported entry point for plugin authors. It validates the name,
 * wires `install`/`uninstall`, exposes a scoped {@link PluginSetupApi} and keeps
 * the hook object fully typed.
 *
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

/** One hook bound to the plugin that owns it. */
export interface BoundHook {
  readonly pluginName: string;
  readonly hook: (...args: any[]) => any;
}

/**
 * Compose chain hooks into a single Koa-style function.
 *
 * The returned function runs `entries[0]` first (they are pre-sorted by the
 * manager), handing each hook a `next` that advances the chain. When the chain
 * is exhausted, `downstream` runs — that is where the manager splices in the
 * actual HTTP request between `beforeRequest` and `afterResponse`.
 *
 * Calling `next()` twice from one hook throws {@link SnailHookError}; without
 * that guard the second call silently re-runs the rest of the chain.
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
