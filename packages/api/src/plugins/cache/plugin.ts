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
 * 缓存插件。
 *
 * ## 在管线中的位置
 *
 * `priority: -100` 是保留给缓存的优先级区间，它带来契约在
 * `docs/guide/plugin-lifecycle.md` §2.2 中写明的两点：
 *
 * - **正向顺序的最后**——拦截器（`100`）和所有参数装饰器都已执行，因此构造键时
 *   `ctx.request` 里已是最终的 url、params 与 body。对更早的形态做哈希，会把两个不同的
 *   请求算成同一个键（或把同一个请求算成两个）。
 * - **回卷顺序的最前**——原始信封在校验与转换插件碰它之前就被存储，因此命中时重放的
 *   是服务器发来的原样内容，而不是处理后的派生结果。
 *
 * ## 存储服务器发来的内容
 *
 * 条目里存的是 `ctx.response.data`，而不是 `SnailResult`。结果是把信封投影到调用方信封
 * schema 上的产物；缓存它会把某个服务器的键名冻结进另一个服务器的缓存里。
 *
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

/**
 * 插件名称；同时也是 `Service.use()` / `Service.remove()` 使用的标识。
 *
 * Plugin name; also the identity used by `Service.use()` / `Service.remove()`.
 */
export const CACHE_PLUGIN_NAME = "cache";

/**
 * 保留给缓存的优先级区间（见 `docs/guide/plugin-lifecycle.md` §2.1）。
 *
 * The reserved cache priority band (see `docs/guide/plugin-lifecycle.md` §2.1).
 */
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

/**
 * 插件对象，以及它背后的管理器。
 *
 * The plugin object plus the manager behind it.
 */
export interface CachePlugin extends SnailPluginObject<CacheOptions> {
  /**
   * 存储引擎；插件被 `Service.use(...)` 安装后才可用——服务名（默认键前缀）与解析后的
   * 日志级别都是在 `install` 阶段才确定的。
   *
   * The storage engine, available once the plugin has been installed by
   * `Service.use(...)` — `install` is where the server name (the default key
   * prefix) and the resolved log level become known.
   */
  readonly manager: CacheManager | undefined;
}

/**
 * 创建缓存插件；返回对象上的 `manager` 要等插件被安装之后才可用。
 *
 * Create the cache plugin.
 *
 * ```ts
 * const cache = Cache({ ttl: 30, l2: "localStorage" });
 * Service.use(cache);
 * await cache.manager?.invalidateAll();
 * ```
 *
 * @param options 缓存插件的选项，全部可选 / Cache plugin options; all optional
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
 * 把缓存中的响应体包装成插件必须回传的 axios 响应。
 *
 * `headers` 刻意为空：存储的条目只有响应体，凭空造出请求头会让下游插件对服务器从未
 * 发送过的值作出反应。`config` 是当前请求，因此任何读取 `response.config` 的代码看到的
 * 都是产生这次命中的那个请求。
 *
 * 响应体是被**复制**过的。若不做复制，交给调用方的对象就是缓存持有的那个对象，
 * 一句 `result.data.name = "x"` 就会悄悄改写缓存条目；更糟的是，就地填充载荷的响应转换器
 * 会破坏已存储的值，影响之后每一次命中。
 *
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
 *
 * @param body 要包装的缓存响应体 / The cached body to wrap
 * @param config 产生这次命中的请求配置 / The request config that produced the hit
 * @returns 一个 `status` 为 200 的 axios 响应，响应体为副本 / An axios response with
 *   `status` 200 and a copied body
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
