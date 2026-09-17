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

/** Plugin name; also the identity used by `Service.use()` / `Service.remove()`. */
export const INTERCEPTOR_PLUGIN_NAME = "interceptor";

/** The reserved interceptor priority band (see `docs/guide/plugin-lifecycle.md` §2.1). */
export const INTERCEPTOR_PRIORITY = 100;

/** Programmatic interceptors shared by every request of one server. */
export interface InterceptorOptions {
  /** Entries that run on every request, after the class- and method-level ones. */
  request?: InterceptorEntry<InternalAxiosRequestConfig>[];

  /** Entries that run on every response, after the class- and method-level ones. */
  response?: InterceptorEntry<AxiosResponse>[];
}

/**
 * The plugin object plus the two registries behind it.
 *
 * `use()` / `eject()` are exposed on the instance because an interceptor added
 * from `Interceptor({ request })` is fixed at construction time, and a real
 * application usually learns its token or tenant long after the server module
 * has been evaluated.
 */
export interface InterceptorPlugin extends SnailPluginObject<InterceptorOptions> {
  /** Server-wide request interceptors. */
  readonly request: InterceptorManager<InternalAxiosRequestConfig>;

  /** Server-wide response interceptors. */
  readonly response: InterceptorManager<AxiosResponse>;
}

/**
 * Create the interceptor plugin.
 *
 * ```ts
 * const interceptors = Interceptor({
 *   request: [{ onFulfilled: (config) => { config.headers.set("x-app", "web"); } }]
 * });
 * Service.use(interceptors);
 * interceptors.request.use({ onFulfilled: (config, ctx) => ctx.logger.debug(ctx.fullName) });
 * ```
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
