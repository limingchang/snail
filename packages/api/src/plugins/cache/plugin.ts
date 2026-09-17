import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../../core/context";
import { createLogger } from "../../core/logger";
import { createPlugin } from "../../core/plugin";
import { coerceJSONStringBody } from "../../core/response";
import { t } from "../../locale";
import type { SnailMethodType } from "../../typings/api";
import type { SnailNext, SnailPluginObject } from "../../typings/plugin";
import { deferred } from "../../utils";
import { readCacheable, readInvalidates, readNoCache } from "./decorators";
import { buildCacheKey } from "./key";
import { CacheManager } from "./manager";
import type { ResolvedCacheOptions } from "./manager";
import type { CacheOptions } from "./type";

/**
 * The cache plugin.
 *
 * ## Where it sits in the pipeline
 *
 * `priority: -100` is the reserved cache band, which buys two things the contract
 * spells out in `docs/guide/plugin-lifecycle.md` §2.2:
 *
 * - **last in forward order** — the interceptor (`100`) and every argument
 *   decorator have already run, so `ctx.request` holds the final url, params and
 *   body when the key is built. Hashing an earlier shape would key two different
 *   requests identically (or one request twice).
 * - **first in unwind order** — the raw envelope is stored before the validation
 *   and transformation plugins touch it, so a hit replays exactly what the server
 *   sent rather than a processed derivative.
 *
 * ## Stores what the server sent
 *
 * The entry holds `ctx.response.data`, not the `SnailResult`. The result is a
 * projection of the envelope onto the caller's envelope schema; caching it would
 * freeze one server's key names into another's cache.
 */

/** Plugin name; also the identity used by `Service.use()` / `Service.remove()`. */
export const CACHE_PLUGIN_NAME = "cache";

/** The reserved cache priority band (see `docs/guide/plugin-lifecycle.md` §2.1). */
export const CACHE_PRIORITY = -100;

/** `ctx.state` slot holding the {@link CachePlan} of the current send. */
const CACHE_PLAN_STATE = "snail:cache:plan";

/** The plan resolved once in `beforeRequest` and consumed in `afterResponse`. */
interface CachePlan {
  /** Key to read and write, or `undefined` when this request is not cacheable. */
  readonly key: string | undefined;

  /** Lifetime to store under. */
  readonly ttl: number;

  /** Tags attached to the stored entry. */
  readonly tags: readonly string[];

  /** Tags whose entries must be purged once this request succeeded. */
  readonly invalidate: readonly string[];
}

/** The plugin object plus the manager behind it. */
export interface CachePlugin extends SnailPluginObject<CacheOptions> {
  /**
   * The storage engine, available once the plugin has been installed by
   * `Service.use(...)` — `install` is where the server name (the default key
   * prefix) and the resolved log level become known.
   */
  readonly manager: CacheManager | undefined;
}

/**
 * Create the cache plugin.
 *
 * ```ts
 * const cache = Cache({ ttl: 30, l2: "localStorage" });
 * Service.use(cache);
 * await cache.manager?.invalidateAll();
 * ```
 */
export function Cache(options?: CacheOptions): CachePlugin {
  let manager: CacheManager | undefined;

  const base = createPlugin<CacheOptions>({
    name: CACHE_PLUGIN_NAME,
    priority: CACHE_PRIORITY,
    setup(pluginOptions, api) {
      const instance = new CacheManager({
        ...pluginOptions,
        // The server name is the only prefix that is unique without the
        // application having to think about it, and two servers sharing an origin
        // would otherwise collide inside the same `localStorage`.
        prefix: pluginOptions?.prefix ?? api.serverName,
        logger: createLogger(api.serverOptions.logLevel)
      });
      manager = instance;

      // Plugin-owned strings: the core catalogue has no cache diagnostics, and
      // owning them here keeps a future rename from breaking another package.
      api.addMessages({
        "cache.warn.l2.failed": "[%s] L2 cache %s failed; continuing without it",
        "cache.warn.l2.unavailable": "[%s] %s is unavailable in this environment; the cache plugin uses L1 only",
        "cache.warn.store.failed": "[%s] the response could not be cached: %s",
        "cache.warn.revalidate.failed": "[%s] background revalidation failed: %s",
        "info.cache.stale": "[%s] served a stale entry; revalidating in the background"
      });

      return {
        beforeRequest: (ctx, next) => serveFromCache(instance, ctx, next),
        afterResponse: (ctx, next) => storeResponse(instance, ctx, next)
      };
    }
  })(options);

  // A getter rather than `Object.assign`: the manager does not exist until
  // `install` runs, and `Object.assign` would copy today's `undefined` into the
  // property for good.
  Object.defineProperty(base, "manager", {
    enumerable: true,
    configurable: true,
    get: () => manager
  });

  return base as CachePlugin;
}

// ── forward phase: read ─────────────────────────────────────────────────────

/**
 * Serve a cache hit, or register this request as the one that will fill the gap.
 *
 * Three outcomes, in order of cost:
 *
 * 1. **fresh hit** — `ctx.interrupt(response)` and no `next()`, so axios is never
 *    reached;
 * 2. **stale hit** (only with `staleWhileRevalidate`) — the stale body is served
 *    immediately and the refresh happens out of band;
 * 3. **miss** — `next()` runs the request, and a follower of an identical
 *    in-flight request waits for its leader instead of sending a second one.
 */
async function serveFromCache(
  manager: CacheManager,
  ctx: SnailContext,
  next: SnailNext
): Promise<void> {
  const plan = resolveCachePlan(ctx, manager.options);
  ctx.state.set(CACHE_PLAN_STATE, plan);

  // Everything below the dynamic checks, so `@NoCache` and a non-cacheable verb
  // cost one metadata read and never build a key.
  const key = plan.key;
  if (key === undefined) return next();

  const found = await manager.lookup(key, manager.options.staleWhileRevalidate);
  if (found) {
    ctx.markCacheHit();
    ctx.interrupt(makeCachedResponse(found.value, ctx.request));
    ctx.logger.debug(t("info.cache.hit", ctx.fullName));

    if (found.stale) {
      ctx.logger.debug(t("info.cache.stale", ctx.fullName));
      revalidate(manager, ctx, plan, key);
    }
    return;
  }

  if (!manager.options.dedupe) return next();

  const pending = manager.getInFlight(key);
  if (pending) {
    const shared = await pending.catch(() => undefined);
    if (shared !== undefined) {
      ctx.markCacheHit();
      ctx.interrupt(makeCachedResponse(shared, ctx.request));
      return;
    }
    // The leader failed. This request is not its follower in any useful sense,
    // so it goes to the network on its own rather than inheriting the failure.
    return next();
  }

  const flight = deferred<unknown>();
  manager.setInFlight(key, flight.promise);

  try {
    await next();
    flight.resolve(ctx.getResponse()?.data);
  } catch (error) {
    // The rejection only reaches followers; `setInFlight` marks it as observed
    // so a failed request with no follower is not an unhandled rejection.
    flight.reject(error);
    throw error;
  }
}

// ── unwind phase: write ─────────────────────────────────────────────────────

/**
 * Invalidate first, then store, then continue the chain.
 *
 * The order of the first two is load-bearing: a method that is both cacheable
 * and declares `@Invalidates` for one of its own tags stores *after* the purge,
 * so it cannot delete the entry it just wrote. Storing before `next()` is what
 * makes the cached value the raw envelope — later plugins see the response
 * afterwards, and the cache keeps what the server actually sent.
 */
async function storeResponse(
  manager: CacheManager,
  ctx: SnailContext,
  next: SnailNext
): Promise<void> {
  const plan = ctx.state.get<CachePlan>(CACHE_PLAN_STATE);

  // A hit performed no network work, so it must neither store nor invalidate.
  //
  // This matters most for a stale-while-revalidate hit: the response in hand is
  // the *old* body while a background refresh is already fetching the new one.
  // Storing here would overwrite the refresh's result with the stale value it was
  // called to replace. The same reasoning applies to `@Invalidates` — the mutation
  // this request was supposed to perform never reached the server.
  if (plan && !ctx.isCacheHit) {
    if (plan.invalidate.length > 0) {
      await manager.invalidateTags(plan.invalidate);
      ctx.logger.debug(
        t("info.cache.invalidate", ctx.fullName, plan.invalidate.join(", "))
      );
    }

    if (plan.key !== undefined && ctx.response) {
      try {
        // Snapshotted so a later `afterResponse` plugin — the transform plugin
        // hydrates the payload in place — cannot rewrite what was stored.
        await manager.set(plan.key, snapshot(ctx.response.data), plan.ttl, plan.tags);
        ctx.logger.debug(t("info.cache.set", ctx.fullName));
      } catch (error) {
        ctx.logger.warn(t("cache.warn.store.failed", ctx.fullName, String(error)));
      }
    }
  }

  // Chain hook, unlike the interceptors it wraps: the remaining unwind plugins
  // must still see the response.
  await next();
}

// ── policy ──────────────────────────────────────────────────────────────────

/**
 * Decide what the cache should do with this request, from the decorators and the
 * configured verb list.
 *
 * Precedence, and why:
 *
 * 1. `@NoCache()` on the method — an explicit opt-out is never overridden;
 * 2. `@Cacheable()` on the method — an explicit opt-in beats a class-wide
 *    decision, in both directions (this is what "method-level wins" means);
 * 3. `@NoCache()` on the class;
 * 4. `@Cacheable()` on the class — every method of the class;
 * 5. otherwise, the verb must be listed in `cacheFor`, which defaults to `GET`.
 *
 * Tags from both levels are merged, class first, so a method can add its own
 * without losing the class's. `ttl` and `key` are *not* merged: the most specific
 * declaration wins outright.
 */
function resolveCachePlan(ctx: SnailContext, options: ResolvedCacheOptions): CachePlan {
  const classCacheable = readCacheable(ctx.apiClass);
  const methodCacheable = readCacheable(ctx.apiClass, ctx.methodName);

  const cacheable = readNoCache(ctx.apiClass, ctx.methodName)
    ? false
    : methodCacheable !== undefined
      ? true
      : readNoCache(ctx.apiClass)
        ? false
        : classCacheable !== undefined
          ? true
          : matchesCacheFor(ctx.methodType, options.cacheFor);

  const explicitKey = methodCacheable?.key ?? classCacheable?.key;

  return {
    key: cacheable
      ? buildCacheKey({
          prefix: options.prefix,
          request: ctx.request,
          methodType: ctx.methodType,
          explicitKey
        })
      : undefined,
    ttl: methodCacheable?.ttl ?? classCacheable?.ttl ?? options.ttl,
    tags: [
      ...new Set([...(classCacheable?.tags ?? []), ...(methodCacheable?.tags ?? [])])
    ],
    invalidate: [
      ...new Set([
        ...readInvalidates(ctx.apiClass),
        ...readInvalidates(ctx.apiClass, ctx.methodName)
      ])
    ]
  };
}

/** `true` when `cacheFor` covers this verb. */
function matchesCacheFor(
  method: SnailMethodType,
  cacheFor: ResolvedCacheOptions["cacheFor"]
): boolean {
  return cacheFor === "all" || cacheFor.includes(method);
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Wrap a cached body into the axios response a plugin must hand back.
 *
 * `headers` is empty on purpose: the stored entry is only the body, and inventing
 * headers would make downstream plugins react to values the server never sent.
 * `config` is the live request, so anything reading `response.config` sees the
 * request that produced the hit.
 *
 * The body is **copied**. Without that, the object handed to the caller would be
 * the very object the cache holds, so one `result.data.name = "x"` would silently
 * rewrite the cache entry — and, worse, a response transformer that hydrates the
 * payload in place would corrupt the stored value for every later hit.
 */
export function makeCachedResponse<T>(
  body: T,
  config: InternalAxiosRequestConfig
): AxiosResponse<T> {
  return {
    data: snapshot(body),
    status: 200,
    statusText: "Cache Hit (snail)",
    headers: {},
    config
  };
}

/**
 * Copy a value so the cache and the caller can never share a mutable reference.
 *
 * `structuredClone` is preferred because it preserves `Date`, `Map`, `Set` and
 * typed arrays, which a JSON round-trip flattens. JSON is the fallback for older
 * engines, and if both fail (a function-valued field, a class instance with
 * private state) the original reference is returned — a shared reference is a
 * far smaller problem than throwing inside a cache read.
 */
function snapshot<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  const cloner = (globalThis as { structuredClone?: <V>(input: V) => V })
    .structuredClone;
  if (typeof cloner === "function") {
    try {
      return cloner(value);
    } catch {
      /* not cloneable — fall through to JSON */
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

/**
 * Refresh an entry after serving stale data.
 *
 * The refresh deliberately does **not** call this request's `next()`: the caller
 * is still reading `ctx.response`, and a detached chain step would write the
 * fresh response into the very same context — corrupting the result the caller is
 * about to receive, or a later `send()` that reused the context. Instead the
 * final config is replayed through the server's own axios instance and the
 * response is normalised the same way `dispatch` normalises it, so the refreshed
 * entry is byte-for-byte what a normal miss would have stored.
 */
function revalidate(
  manager: CacheManager,
  ctx: SnailContext,
  plan: CachePlan,
  key: string
): void {
  // `requestInterceptor` is the last chance to rewrite the config before
  // transport, and the hit path skipped `dispatch`, so it has not run yet.
  const config = ctx.server.pluginManager.reduce("requestInterceptor", ctx.request, ctx);

  void (async () => {
    try {
      let response = await ctx.server.axios.request(config);
      response = coerceJSONStringBody(response, ctx.serverOptions.coerceJSONString);
      response = ctx.server.pluginManager.reduce("responseInterceptor", response, ctx);

      await manager.set(key, response.data, plan.ttl, plan.tags);
    } catch (error) {
      ctx.logger.warn(t("cache.warn.revalidate.failed", ctx.fullName, String(error)));
    }
  })();
}
