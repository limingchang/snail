import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../core/context";
import type { ResolvedServerOptions } from "./server";
import type { SnailApiOptions, SnailMethodOptions } from "./api";

/**
 * The `next` callback handed to every chain-style plugin hook.
 *
 * Calling it hands control to the next plugin in the chain. It resolves once
 * every later plugin — and the actual HTTP request — has finished.
 */
export type SnailNext = () => Promise<void>;

/** Stage at which a plugin hook runs. */
export type SnailHookKind = "config" | "chain" | "effect";

/** Names of every lifecycle hook, in execution order. */
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
  /** Unique plugin name. Re-registering the same name on one server is an error. */
  readonly name: string;

  /**
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

  /** Plugin names that must be registered before this one. */
  readonly dependsOn?: readonly string[];

  /** Options this instance was created with, surfaced for debugging. */
  readonly options?: O;

  // ── registration ──────────────────────────────────────────────────────────

  /** Called once, when the plugin is added to a server. */
  install?(ctx: SnailPluginInstallContext, options: O): void | Promise<void>;

  /** Called when the plugin is removed, or when the server is disposed. */
  uninstall?(ctx: SnailPluginInstallContext, options: O): void | Promise<void>;

  // ── configuration (run once per decorated target) ─────────────────────────

  /** Mutate the resolved server options. Runs when the server instance is built. */
  configureServer?(options: ResolvedServerOptions): void;

  /** Mutate the resolved api options. Runs the first time a method is proxied. */
  configureApi?(options: SnailApiOptions, apiClass: new () => unknown): void;

  /** Mutate the resolved method options. Runs the first time a method is proxied. */
  configureMethod?(options: SnailMethodOptions, methodName: string): void;

  // ── per-request lifecycle ─────────────────────────────────────────────────

  /**
   * Add the reactive values this plugin owns to `ctx.meta`.
   *
   * Runs once per `send()`, before any request work. Framework adapters use it
   * to expose `loading` / `data` / `error`.
   */
  initMeta?(ctx: SnailContext): void;

  /** Runs after `initMeta`, before the argument decorators are applied. */
  beforeCreate?(ctx: SnailContext): void;

  /**
   * Runs before the request is handed to axios.
   *
   * Chain hook: `await next()` to continue. Skipping `next()` aborts the
   * request. Setting `ctx.response` and calling `ctx.interrupt()` short-circuits
   * the network call entirely — that is how the cache plugin serves a hit.
   */
  beforeRequest?(ctx: SnailContext, next: SnailNext): Promise<void> | void;

  /**
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
   * Runs after a successful HTTP round-trip, before the envelope is validated.
   *
   * Chain hook: `await next()` to continue. Skipping `next()` means later
   * plugins and the caller see whatever `ctx.response` currently holds.
   */
  afterResponse?(ctx: SnailContext, next: SnailNext): Promise<void> | void;

  /** Low-level rewrite of the axios response, in registration order. */
  responseInterceptor?(
    response: import("axios").AxiosResponse,
    ctx: SnailContext
  ): import("axios").AxiosResponse | void;

  /** Observe a failure. Cannot recover it; use `beforeRequest` for that. */
  onError?(ctx: SnailContext, error: unknown): void;

  /**
   * Runs in `finally`, whether the request succeeded, failed or was cancelled.
   * This is where plugins release resources and stop timers.
   */
  afterRequest?(ctx: SnailContext): void;
}

/** The subset of server capabilities a plugin may use during install. */
export interface SnailPluginInstallContext {
  /** Name of the server the plugin was installed on. */
  readonly serverName: string;
  /** Resolved server options (mutable, but prefer `configureServer`). */
  readonly serverOptions: ResolvedServerOptions;
  /** Names of every plugin currently registered on the server, in chain order. */
  readonly pluginNames: readonly string[];
}

/** A plugin factory: `(options) => SnailPluginObject`. */
export type SnailPlugin<O = unknown> = (options?: O) => SnailPluginObject<O>;
