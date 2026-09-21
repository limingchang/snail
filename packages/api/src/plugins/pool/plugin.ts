import { createPlugin } from "../../core/plugin";
import { SnailPoolError } from "./type";
import {
  RequestPoolScheduler,
  type RequestPoolOptions,
  type RequestPoolStats
} from "./scheduler";

/**
 * 插件名，同时也是 `Service.use()` / `Service.remove()` 使用的标识。
 *
 * Plugin name; also the identity used by `Service.use()` / `Service.remove()`.
 */
export const POOL_PLUGIN_NAME = "pool";

/**
 * 请求池所在优先级区间。
 *
 * **低于**缓存（`-100`），而这正是关键：正向钩子按优先级从高到低执行，所以请求池是
 * 抵达传输层之前的最后一环。缓存能应答的请求永远到不了请求池，也就不会占用槽位。
 * 若把请求池置于缓存之上，少量缓存读就会占满整个池，饿死排在后面的真实请求。
 *
 * Priority of the pool band.
 *
 * **Below** the cache (`-100`), which is the whole point: forward hooks run
 * highest-priority first, so the pool is the very last thing to run before the
 * transport. A request that the cache can answer never reaches the pool and never
 * consumes a slot. Putting the pool above the cache would let a handful of cached
 * reads occupy the entire pool and starve the real requests behind them.
 */
export const POOL_PRIORITY = -150;

/**
 * 请求池插件对象，并可直接访问它的调度器。
 *
 * The pool plugin object plus live access to its scheduler.
 */
export interface RequestPoolPlugin {
  /**
   * 插件名，恒为 `POOL_PLUGIN_NAME`。
   *
   * Plugin name; always `POOL_PLUGIN_NAME`.
   */
  readonly name: string;
  /**
   * 插件优先级，恒为 `POOL_PRIORITY`。
   *
   * Plugin priority; always `POOL_PRIORITY`.
   */
  readonly priority: number;

  /**
   * 调度器，在 `install` 执行之后才存在。
   *
   * 对外暴露，是为了让应用可以为加载指示器读取 {@link RequestPoolScheduler.stats}，
   * 或在得知后端扛得住时调大 `concurrency`。
   *
   * The scheduler, available once `install` has run.
   *
   * Exposed so an application can read {@link RequestPoolScheduler.stats} for a
   * loading indicator, or widen `concurrency` when it learns the backend is
   * coping.
   */
  readonly scheduler: RequestPoolScheduler | undefined;
}

/**
 * 限制同时进行中的请求数量。
 *
 * ## 它解决什么问题
 *
 * 见 {@link RequestPoolOptions} 中关于浏览器自带队列为何不够用的论证。简言之：内置队列
 * 是先入先出、不可见且无优先级的，某个页面的一次爆发就能饿死用户真正在等待的那个请求，
 * 而后备队列无限增长时也没有任何请求会快速失败。
 *
 * ## 它所在的位置
 *
 * 正向顺序的最后一环，紧挨网络调用；槽位只在传输期间被占用——`next()` 在响应收到后
 * 就 resolve，因此校验、转换和调用方的响应式更新都发生在槽位已经归还之后。
 *
 * 命中缓存的请求会在上游短路 `beforeRequest`，所以缓存读不消耗并发。
 *
 * ## 它覆盖不到的一条路径
 *
 * `useTokenAuth` 通过直接重跑传输层来重放收到 `401` 的请求，刻意不再进入
 * `beforeRequest`（再进一次会死循环）。因此这些重放**不经过本请求池**，也不计入
 * `concurrency`。
 *
 * 实际影响不大——重放次数受限于令牌过期时在途的请求数，而这些请求本来就没有被限流——
 * 但在拿请求池去保护后端免受认证风暴之前值得知道。若确实在意，请从源头限流：使用
 * `useRequest` 自带的并发控制，或让 `useTokenAuth` 主动提前刷新而不是等第一个 401。
 *
 * Bound how many requests are in flight at once.
 *
 * ```ts
 * Service.use(RequestPool({ concurrency: 4, maxQueue: 50, queueTimeout: 10_000 }));
 *
 * // `ctx.state` is readable from the priority callback, so an interactive request
 * // can jump ahead of a background prefetch.
 * Service.use(RequestPool({ concurrency: 4, priority: (ctx) => (ctx.state.get("prefetch") ? 100 : 0) }));
 * ```
 *
 * ## What problem this solves
 *
 * See {@link RequestPoolOptions} for why the browser's own queue is not enough.
 * In short: the built-in one is FIFO, invisible and unprioritised, so a burst from
 * one screen can starve the request the user is actually waiting for, and nothing
 * fails fast when the backlog grows without bound.
 *
 * ## Where it sits
 *
 * Last in forward order, immediately before the network call, and it holds its slot
 * only for the transport — `next()` resolves once the response has been received,
 * so validation, transformation and the caller's reactive updates happen after the
 * slot is already back in the pool.
 *
 * A cache hit short-circuits `beforeRequest` upstream of this plugin, so cached
 * reads cost no concurrency.
 *
 * ## One path it does not cover
 *
 * `useTokenAuth` replays a request that came back `401` by re-running the transport
 * directly, deliberately without re-entering `beforeRequest` (re-entering would
 * loop). Those replays therefore **do not pass through this pool** and are not
 * counted against `concurrency`.
 *
 * The practical impact is small — replays are bounded by the number of requests
 * that were in flight when the token expired, which were already uncapped — but it
 * is worth knowing before reaching for the pool to protect a backend from an auth
 * storm. If that matters, cap it at the source: use `useRequest`'s own concurrency
 * control, or let `useTokenAuth` refresh proactively rather than on the first 401.
 *
 * @param options 插件配置 / Plugin options.
 * @returns 请求池插件对象 / The pool plugin object.
 */
export function RequestPool(options?: RequestPoolOptions): RequestPoolPlugin {
  let scheduler: RequestPoolScheduler | undefined;

  const base = createPlugin<RequestPoolOptions>({
    name: POOL_PLUGIN_NAME,
    priority: POOL_PRIORITY,

    setup(_pluginOptions, api) {
      const instance = new RequestPoolScheduler(options);
      scheduler = instance;

      // Plugin-owned diagnostics, so a future rename in this file cannot break a
      // message another package owns.
      api.addMessages({
        "error.pool.queueFull": "请求池队列已满（等待中 %s 个），请稍后重试",
        "error.pool.queueTimeout": "请求池排队超时（已等待 %sms）",
        "error.pool.cleared": "请求池已清空，排队的请求被取消",
        "error.pool.aborted": "请求在排队期间被取消"
      });

      // A queued request must not outlive the plugin that would eventually admit it.
      api.onDispose(() => instance.clear());

      return {
        async beforeRequest(ctx, next) {
          const signal = ctx.request.signal ?? undefined;
          const ticket = await instance.acquire(ctx, signal);

          try {
            await next();
          } finally {
            // `finally`, not a success path: a transport failure, a validation
            // throw and a cancellation must all return the slot, or the pool
            // silently shrinks by one every time something goes wrong.
            ticket.release();
          }
        }
      };
    }
  })(options);

  return Object.defineProperty(base, "scheduler", {
    enumerable: true,
    configurable: true,
    // A getter, not `Object.assign`: the scheduler does not exist until `install`
    // runs, and `Object.assign` would freeze today's `undefined` onto the object.
    get: () => scheduler
  }) as RequestPoolPlugin;
}

/**
 * 读取已安装请求池插件的实时计数，未安装时为 `undefined`。
 *
 * Read the live counters of an installed pool plugin, or `undefined`.
 *
 * @param plugin 请求池插件对象 / The pool plugin object.
 * @returns 实时计数，或 `undefined` / The live counters, or `undefined`.
 */
export function poolStats(plugin: RequestPoolPlugin): RequestPoolStats | undefined {
  return plugin.scheduler?.stats;
}

/**
 * 丢弃已安装请求池插件中所有排队中的请求。
 *
 * Drop every queued request of an installed pool plugin.
 *
 * @param plugin 请求池插件对象 / The pool plugin object.
 * @param reason 每个排队请求被拒绝的原因 / The reason each queued request rejects with.
 */
export function clearPool(plugin: RequestPoolPlugin, reason?: unknown): void {
  plugin.scheduler?.clear(reason);
}

/**
 * 当 `error` 来自请求池而不是传输层时返回 `true`。
 *
 * 让调用方能把「还没发出去就被拒绝」——稍后重试是安全的——与真正的网络失败区分开。
 * 覆盖全部四条拒绝路径：队列已满、排队等待超时、排队期间被放弃，以及插件卸载清空了
 * 队列。
 *
 * `true` when `error` came from the pool rather than from the transport.
 *
 * Lets a caller tell "refused before it was ever sent" — safe to retry later —
 * apart from a real network failure. Covers all four refusal paths: a full queue,
 * a queue wait that timed out, a request abandoned while waiting, and a queue
 * cleared by an uninstall.
 */
export function isPoolError(error: unknown): error is SnailPoolError {
  return error instanceof SnailPoolError;
}
