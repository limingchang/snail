export enum CacheType {
  Memory,
  IndexDB,
  LocalStorage,
}

interface MemoryCacheOption {
  type: CacheType.Memory;
}

interface IndexDBCacheOption {
  type: CacheType.IndexDB;
}

interface LocalStorageCacheOption {
  type: CacheType.LocalStorage;
}

interface CacheCommonOption {
  ttl?: number;
}

export type CacheManagementOption = CacheCommonOption &
  (MemoryCacheOption | IndexDBCacheOption | LocalStorageCacheOption);
