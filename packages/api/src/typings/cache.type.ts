import MemoryCache from "../cache/memoryCache";
import LocalStorageCache from "../cache/localstorageCache";
import IndexDBCache from "../cache/indexDBCache";

export interface CacheData<T=any> {
  data: T;
  // 在什么时间过期
  exp: number;
}

export type CacheStorage = MemoryCache | LocalStorageCache | IndexDBCache;
