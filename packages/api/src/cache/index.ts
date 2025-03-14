import MemoryCache from "./memoryCache";
import LocalStorageCache from "./localstorageCache";
import IndexDBCache from "./indexDBCache";
import {
  CacheType,
  CacheStorageAdapter,
  CacheStorage,
  AdapterConstructor,
  CacheCommonOption,
  MemoryCacheOption,
  IndexDBCacheOption,
  LocalStorageCacheOption,
  CustomCacheOption,
  CacheManagementOption,
} from "../typings";

export function createCache<T extends CacheManagementOption>(
  options: T
): CacheStorage;
export function createCache<T extends MemoryCacheOption>(
  optios: T
): MemoryCache;
export function createCache<T extends LocalStorageCacheOption>(
  optios: T
): LocalStorageCache;
export function createCache<T extends IndexDBCacheOption>(
  optios: T
): IndexDBCache;
export function createCache<T extends CustomCacheOption>(
  optios: T
): CacheStorageAdapter;
export function createCache(optios: any): CacheStorage {
  const { type } = optios;
  if (type === CacheType.Custom) {
    const adapter = optios.adapter;
    return new adapter(optios.options);
  }
  if (type === CacheType.LocalStorage) {
    const { ttl } = optios;
    return new LocalStorageCache(ttl as number);
  }
  if (type === CacheType.IndexDB) {
    const { ttl } = optios;
    const db = new IndexDBCache(ttl as number);
    db.init();
    return db;
  }
  const { ttl } = optios;
  return new MemoryCache(ttl as number);
}
