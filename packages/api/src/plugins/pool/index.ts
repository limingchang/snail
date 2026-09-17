/**
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
