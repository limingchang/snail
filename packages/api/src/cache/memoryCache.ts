import { CacheData } from "../typings";

export default class MemoryCache {
  private cache: Record<string, CacheData> = {};

  public ttl: number;
  constructor(ttl: number) {
    this.ttl = ttl;
  }
  public async get<T = any>(key: string): Promise<{ error: null; data: T } | { error: any; data: null }> {
    return new Promise((resolve, reject) => {
      try {
        const cacheItem = this.cache[key];
        if (!cacheItem) {
          return reject({ error: new Error("缓存不存在"), data: null });
        }
        
        const { data, exp } = cacheItem;
        if (exp < Date.now()) {
          this.delete(key);
          return reject({ error: new Error("缓存已过期"), data: null });
        }
        resolve({ error: null, data });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }

  public async set<T = any>(key: string, value: T): Promise<{ error: null; data: true } | { error: any; data: null }> {
    return new Promise((resolve, reject) => {
      try {
        this.cache[key] = {
          data: value,
          exp: Date.now() + this.ttl,
        };
        resolve({ error: null, data: true });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }

  public async delete(key: string): Promise<{ error: null; data: true } | { error: any; data: null }> {
    return new Promise((resolve, reject) => {
      try {
        delete this.cache[key];
        resolve({ error: null, data: true });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }
}
