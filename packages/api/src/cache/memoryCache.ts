import { CacheGetData, CacheStorageAdapter } from "../typings";

export default class MemoryCache implements CacheStorageAdapter {
  // private cache: Record<string, CacheSetData> = {};
  private CacheMap: Map<string, any> = new Map();

  public ttl: number;
  constructor(ttl: number) {
    this.ttl = ttl;
  }
  public async get<T = any>(key: string): Promise<CacheGetData<T>> {
    return new Promise((resolve, reject) => {
      try {
        const cacheItem = this.CacheMap.get(key);
        if (!cacheItem) {
          return resolve({
            error: new Error("[MemoryCache]未找到缓存，将执行请求"),
            data: null,
          });
        }

        const { data, exp } = cacheItem;
        if (exp < Math.ceil(new Date().getTime() / 1000)) {
          this.delete(key);
          return resolve({
            error: new Error("[MemoryCache]缓存已过期，将执行请求"),
            data: null,
          });
        }
        resolve({ error: null, data });
      } catch (error) {
        console.error("[MemoryCache]获取缓存错误：", error);
        reject(error);
      }
    });
  }

  public async set<T = any>(key: string, value: T): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.CacheMap.set(key, {
          data: value,
          exp: Math.ceil(new Date().getTime() / 1000) + this.ttl,
        });
        resolve(true);
      } catch (error) {
        console.error("[MemoryCache]设置缓存错误：", error);
        reject(error);
      }
    });
  }

  public async delete(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.CacheMap.delete(key);
        resolve(true);
      } catch (error) {
        console.error("[MemoryCache]删除缓存错误：", error);
        reject(error);
      }
    });
  }

  public async clear(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.CacheMap.clear();
        resolve(true);
      } catch (error) {
        console.error("[MemoryCache]清空缓存错误：", error);
        reject(error);
      }
    });
  }
  public async keys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      try {
        const keys = Array.from(this.CacheMap.keys());
        resolve(keys);
      } catch (error) {
        console.error("[MemoryCache]获取缓存键错误：", error);
        reject(error);
      }
    });
  }
}
