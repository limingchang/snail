import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../../core/context";
import { createPlugin } from "../../core/plugin";
import { t } from "../../locale";
import type { SnailNext, SnailPluginObject } from "../../typings/plugin";
import {
  classAfterEntries,
  classBeforeEntries,
  methodAfterEntries,
  methodBeforeEntries
} from "./decorators";
import { InterceptorManager } from "./manager";
import type { InterceptorEntry } from "./type";

/**
 * 拦截器插件。
 *
 * ## 在管线中的位置
 *
 * `priority: 100` 是保留给拦截器的优先级区间，因此本插件在正向顺序中第一个看到请求，
 * 在回卷顺序中最后一个看到响应。正因如此，`@BeforeRequest()` 才能在缓存插件（`-100`）
 * 把最终的 url、params 与 body 哈希成缓存键*之前*改写配置。
 *
 * ## 请求与响应
 *
 * `beforeRequest` 是链式钩子：先运行拦截器，之后钩子才用 `next()` 把控制权交出去。
 * 因此一个无法挽回的拦截器失败，会在任何东西到达网络之前终止请求。
 *
 * `afterResponse` 是**回卷**钩子。它运行时响应已经存在，所以先调用 `next()` 会让后续插件
 * 观察到尚未被拦截器改写的响应。拦截器先针对 `ctx.response` 运行，之后才推进链条。
 * 拦截器回调本身不是链式钩子——它们收到的是响应而不是 `next`——所以回调内部没有任何东西
 * 能推进或终止链条。
 *
 * The interceptor plugin.
 *
 * ## Where it sits in the pipeline
 *
 * `priority: 100` is the reserved interceptor band, so this plugin is the first
 * to see the request in forward order and the last to see the response in unwind
 * order. That is what lets `@BeforeRequest()` rewrite the config *before* the
 * cache plugin (`-100`) hashes the final url, params and body into a cache key.
 *
 * ## Request vs response
 *
 * `beforeRequest` is a chain hook: the interceptors run first, and only then
 * does the hook hand control on with `next()`. An interceptor that fails
 * unrecoverably therefore stops the request before anything reaches the network.
 *
 * `afterResponse` is an **unwind** hook. The response already exists when it
 * runs, so calling `next()` *first* would let later plugins observe a response
 * the interceptors had not rewritten yet. The interceptors run against
 * `ctx.response` first and the chain is advanced afterwards. The interceptor
 * callbacks themselves are not chain hooks — they receive the response rather
 * than a `next` — so nothing inside one of them can advance or stop the chain.
 */

/**
 * 插件名称；同时也是 `Service.use()` / `Service.remove()` 使用的标识。
 *
 * Plugin name; also the identity used by `Service.use()` / `Service.remove()`.
 */
export const INTERCEPTOR_PLUGIN_NAME = "interceptor";

/**
 * 保留给拦截器的优先级区间（见 `docs/guide/plugin-lifecycle.md` §2.1）。
 *
 * The reserved interceptor priority band (see `docs/guide/plugin-lifecycle.md` §2.1).
 */
export const INTERCEPTOR_PRIORITY = 100;

/**
 * 一个服务的每个请求共享的编程式拦截器。
 *
 * Programmatic interceptors shared by every request of one server.
 */
export interface InterceptorOptions {
  /**
   * 对每个请求都运行的条目，在类级与方法级条目之后运行。
   *
   * Entries that run on every request, after the class- and method-level ones.
   */
  request?: InterceptorEntry<InternalAxiosRequestConfig>[];

  /**
   * 对每个响应都运行的条目，在类级与方法级条目之后运行。
   *
   * Entries that run on every response, after the class- and method-level ones.
   */
  response?: InterceptorEntry<AxiosResponse>[];
}

/**
 * 插件对象，以及它背后的两个注册表。
 *
 * `use()` / `eject()` 之所以暴露在实例上，是因为通过 `Interceptor({ request })` 添加的
 * 拦截器在构造时就固定下来，而真实应用往往在服务模块早已求值之后才知道自己的 token
 * 或租户。
 *
 * The plugin object plus the two registries behind it.
 *
 * `use()` / `eject()` are exposed on the instance because an interceptor added
 * from `Interceptor({ request })` is fixed at construction time, and a real
 * application usually learns its token or tenant long after the server module
 * has been evaluated.
 */
export interface InterceptorPlugin extends SnailPluginObject<InterceptorOptions> {
  /**
   * 服务级的请求拦截器。
   *
   * Server-wide request interceptors.
   */
  readonly request: InterceptorManager<InternalAxiosRequestConfig>;

  /**
   * 服务级的响应拦截器。
   *
   * Server-wide response interceptors.
   */
  readonly response: InterceptorManager<AxiosResponse>;
}

/**
 * 创建拦截器插件。
 *
 * 通过 `options` 传入的条目会立即注册，之后还可以用返回实例上的 `request.use()` /
 * `response.use()` 继续追加。
 *
 * Create the interceptor plugin.
 *
 * ```ts
 * const interceptors = Interceptor({
 *   request: [{ onFulfilled: (config) => { config.headers.set("x-app", "web"); } }]
 * });
 * Service.use(interceptors);
 * interceptors.request.use({ onFulfilled: (config, ctx) => ctx.logger.debug(ctx.fullName) });
 * ```
 *
 * @param options 服务级拦截器与各阶段回调；全部可选 / Server-wide interceptors and their
 *   callbacks; all optional
 * @returns 插件实例，同时带上 `request` / `response` 两个注册表 / The plugin instance,
 *   carrying the `request` / `response` registries
 */
export function Interceptor(options?: InterceptorOptions): InterceptorPlugin {
  const request = new InterceptorManager<InternalAxiosRequestConfig>();
  const response = new InterceptorManager<AxiosResponse>();

  for (const entry of options?.request ?? []) request.use(entry);
  for (const entry of options?.response ?? []) response.use(entry);

  const base = createPlugin<InterceptorOptions>({
    name: INTERCEPTOR_PLUGIN_NAME,
    priority: INTERCEPTOR_PRIORITY,
    setup(_pluginOptions, api) {
      // Plugin-owned diagnostics: the core catalogue has no interceptor keys and
      // contributing them here keeps the two lists from drifting apart.
      api.addMessages({
        "info.interceptor.request": "[%s] %s request interceptor(s) applied",
        "info.interceptor.response": "[%s] %s response interceptor(s) applied"
      });

      return {
        beforeRequest: (ctx, next) => runRequestInterceptors(request, ctx, next),
        afterResponse: (ctx, next) => runResponseInterceptors(response, ctx, next)
      };
    }
  })(options);

  return Object.assign(base, { request, response });
}

// ── request phase ───────────────────────────────────────────────────────────

/**
 * Run every request interceptor, then continue the chain.
 *
 * Order is class → method → server-wide, each list in its own application order.
 * One interceptor's failure is offered to that same interceptor's `onRejected`
 * before it is allowed to abort the request, which is the only recovery point in
 * the whole pipeline — `onError` merely observes.
 */
async function runRequestInterceptors(
  manager: InterceptorManager<InternalAxiosRequestConfig>,
  ctx: SnailContext,
  next: SnailNext
): Promise<void> {
  const entries: InterceptorEntry<InternalAxiosRequestConfig>[] = [
    ...classBeforeEntries(ctx.apiClass),
    ...methodBeforeEntries(ctx.apiClass, ctx.methodName),
    ...manager.entries
  ];

  if (entries.length > 0) {
    ctx.logger.debug(t("info.interceptor.request", ctx.fullName, String(entries.length)));
  }

  for (const entry of entries) {
    if (typeof entry.onFulfilled !== "function") continue;

    try {
      const replaced = await entry.onFulfilled(ctx.request, ctx);
      if (replaced !== undefined) ctx.setRequest(replaced);
    } catch (error) {
      ctx.setRequest(await recover<InternalAxiosRequestConfig>(entry, error, ctx));
    }
  }

  await next();
}

// ── response phase ──────────────────────────────────────────────────────────

/**
 * Run every response interceptor against the response that already exists.
 *
 * The callbacks are not chain hooks: they get the response, not a `next`, so a
 * response interceptor can rewrite but never interrupt. The plugin's own
 * `afterResponse` hook still advances the chain at the end, which is what lets
 * lower-priority plugins (validation, transformation) see the rewritten value.
 */
async function runResponseInterceptors(
  manager: InterceptorManager<AxiosResponse>,
  ctx: SnailContext,
  next: SnailNext
): Promise<void> {
  const entries: InterceptorEntry<AxiosResponse>[] = [
    ...classAfterEntries(ctx.apiClass),
    ...methodAfterEntries(ctx.apiClass, ctx.methodName),
    ...manager.entries
  ];

  if (entries.length > 0) {
    ctx.logger.debug(t("info.interceptor.response", ctx.fullName, String(entries.length)));
  }

  for (const entry of entries) {
    if (typeof entry.onFulfilled !== "function") continue;

    try {
      const replaced = await entry.onFulfilled(ctx.requireResponse(), ctx);
      if (replaced !== undefined) ctx.setResponse(replaced);
    } catch (error) {
      ctx.setResponse(await recover<AxiosResponse>(entry, error, ctx));
    }
  }

  await next();
}

// ── shared ──────────────────────────────────────────────────────────────────

/**
 * Give an interceptor's `onRejected` a chance to recover from `error`.
 *
 * Only a *value* recovers: `undefined` means "I handled the notification but
 * have nothing to continue with", which must not silently produce an undefined
 * config. The original error is rethrown in that case, so the caller sees the
 * real cause rather than a downstream symptom.
 */
async function recover<T>(
  entry: InterceptorEntry<T>,
  error: unknown,
  ctx: SnailContext
): Promise<T> {
  if (typeof entry.onRejected !== "function") throw error;

  const recovered = await entry.onRejected(error, ctx);
  if (recovered === undefined) throw error;

  return recovered as T;
}
