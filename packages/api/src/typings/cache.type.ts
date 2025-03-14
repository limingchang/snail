import MemoryCache from "../cache/memoryCache";
import LocalStorageCache from "../cache/localstorageCache";
import IndexDBCache from "../cache/indexDBCache";

export interface CacheSetData<T = any> {
  data: T;
  // 在什么时间过期
  exp: number;
}
// { error: null; data: T } | { error: any; data: null }

export type CacheGetData<T = any> =
  | {
      error: null;
      data: T;
    }
  | { error: Error | Event; data: null };

export type CacheStorage =
  | MemoryCache
  | LocalStorageCache
  | IndexDBCache
  | CacheStorageAdapter;

export abstract class CacheStorageAdapter {
  // 修改: 移除了abstract修饰符，因为构造函数不能使用abstract修饰符
  abstract get<T = any>(key: string): Promise<CacheGetData<T>>;
  abstract set<T = any>(key: string, value: CacheSetData<T>): Promise<boolean>;
  abstract delete(key: string): Promise<boolean>;
  abstract clear(): Promise<boolean>;
  abstract keys(): Promise<string[]>;
}

export type AdapterConstructor = new (options?: any) => CacheStorageAdapter;
