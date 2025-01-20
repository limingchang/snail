export enum CacheType {
  Memory,
  IndexDB,
  LocalStorage,
}

interface MemoryCacheConfig {
  type: CacheType.Memory;
}

interface IndexDBCacheConfig {
  type: CacheType.IndexDB;
}

interface LocalStorageCacheConfig {
  type: CacheType.LocalStorage;
}

interface CacheCommonConfig {
  ttl?: number;
}

export type CacheManagementConfig = MemoryCacheConfig &
  (CacheCommonConfig | IndexDBCacheConfig | LocalStorageCacheConfig);
