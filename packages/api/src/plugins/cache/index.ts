/**
 * 缓存插件。
 *
 * `priority: -100` 是保留给缓存的优先级区间：在正向顺序中最后执行，因此键是对最终的
 * url/params/body 做哈希得到的；在回卷顺序中最先执行，因此原始信封在校验与转换碰到它
 * 之前就被存储。
 *
 * Cache plugin.
 *
 * ```ts
 * import { Cache, Cacheable, Invalidates, NoCache } from "@snail-js/api/plugins";
 *
 * Service.use(Cache({ ttl: 30, l2: "localStorage" }));
 *
 * @Api("/user")
 * class UserApi {
 *   @Get("/")
 *   @Cacheable({ tags: ["users"] })
 *   list(): Promise<User[]> { return null!; }
 *
 *   @Post("/")
 *   @Invalidates("users")
 *   create(@Data() body: NewUser): Promise<User> { return null!; }
 * }
 * ```
 *
 * `priority: -100` is the reserved cache band: last in forward order, so the key
 * is hashed from the final url/params/body, and first in unwind order, so the raw
 * envelope is stored before validation and transformation touch it.
 *
 * @packageDocumentation
 */

export { IndexedDBCacheAdapter } from "./adapters/indexeddb";
export type { IndexedDBCacheAdapterOptions } from "./adapters/indexeddb";
export { DEFAULT_L1_MAX_SIZE, MemoryCacheAdapter } from "./adapters/memory";
export type { MemoryCacheAdapterOptions } from "./adapters/memory";
export { WebStorageCacheAdapter } from "./adapters/web-storage";
export type { WebStorageCacheAdapterOptions } from "./adapters/web-storage";
export {
  Cacheable,
  HitSource,
  Invalidates,
  NoCache,
  readCacheable,
  readInvalidates,
  readNoCache
} from "./decorators";
export { buildCacheKey } from "./key";
export type { CacheKeyInput } from "./key";
export { CacheManager } from "./manager";
export type { CacheManagerOptions, ResolvedCacheOptions } from "./manager";
export { CACHE_PLUGIN_NAME, CACHE_PRIORITY, Cache, makeCachedResponse } from "./plugin";
export type { CachePlugin } from "./plugin";
export type {
  CacheableOptions,
  CacheAdapter,
  CacheLookup,
  CacheOptions
} from "./type";
