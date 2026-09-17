import { createPlugin } from "../../core/plugin";
import { SnailPoolError } from "./type";
import {
  RequestPoolScheduler,
  type RequestPoolOptions,
  type RequestPoolStats
} from "./scheduler";

/** Plugin name; also the identity used by `Service.use()` / `Service.remove()`. */
export const POOL_PLUGIN_NAME = "pool";

/**
 * Priority of the pool band.
 *
 * **Below** the cache (`-100`), which is the whole point: forward hooks run
 * highest-priority first, so the pool is the very last thing to run before the
 * transport. A request that the cache can answer never reaches the pool and never
 * consumes a slot. Putting the pool above the cache would let a handful of cached
 * reads occupy the entire pool and starve the real requests behind them.
 */
export const POOL_PRIORITY = -150;

/** The pool plugin object plus live access to its scheduler. */
export interface RequestPoolPlugin {
  readonly name: string;
  readonly priority: number;

  /**
   * The scheduler, available once `install` has run.
   *
   * Exposed so an application can read {@link RequestPoolScheduler.stats} for a
   * loading indicator, or widen `concurrency` when it learns the backend is
   * coping.
   */
  readonly scheduler: RequestPoolScheduler | undefined;
}

/**
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

/** Read the live counters of an installed pool plugin, or `undefined`. */
export function poolStats(plugin: RequestPoolPlugin): RequestPoolStats | undefined {
  return plugin.scheduler?.stats;
}

/** Drop every queued request of an installed pool plugin. */
export function clearPool(plugin: RequestPoolPlugin, reason?: unknown): void {
  plugin.scheduler?.clear(reason);
}

/**
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
