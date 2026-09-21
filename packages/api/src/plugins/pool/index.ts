/**
 * 请求池插件。
 *
 * 限制同一时刻在途的请求数量，并配有一个按优先级排序、有界、带超时的队列。它之所以存在，
 * 是因为浏览器自带的请求队列是先入先出、不可见且无优先级的——完整论证（包括为什么
 * HTTP/2 也不能免除这个需求）见 `RequestPoolOptions`。
 *
 * `priority: -150` 把它放在缓存（`-100`）之下，因此它是抵达传输层之前的最后一环，命中
 * 缓存也永远不会消耗槽位。
 *
 * Request pool plugin.
 *
 * ```ts
 * import { RequestPool } from "@snail-js/api/plugins";
 *
 * Service.use(RequestPool({ concurrency: 4, maxQueue: 50, queueTimeout: 10_000 }));
 * ```
 *
 * Bounds how many requests are in flight at once, with a priority-ordered, bounded,
 * time-limited queue. It exists because the browser's own request queue is FIFO,
 * invisible and unprioritised — see `RequestPoolOptions` for the full reasoning,
 * including why HTTP/2 does not remove the need for it.
 *
 * `priority: -150` puts it below the cache (`-100`), so it is the last thing to run
 * before the transport and a cache hit never consumes a slot.
 *
 * @packageDocumentation
 */

export {
  RequestPool,
  POOL_PLUGIN_NAME,
  POOL_PRIORITY,
  clearPool,
  isPoolError,
  poolStats
} from "./plugin";
export type { RequestPoolPlugin } from "./plugin";

export { RequestPoolScheduler } from "./scheduler";
export type {
  AbortLike,
  PoolTicket,
  RequestPoolOptions,
  RequestPoolStats
} from "./scheduler";

export { POOL_ERROR_CODES, SnailPoolError } from "./type";
export type { PoolErrorCode } from "./type";
