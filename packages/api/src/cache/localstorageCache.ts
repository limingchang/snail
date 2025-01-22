import { CacheData } from "../typings";

export default class LocalStorageCache {
  public ttl: number;
  constructor(ttl: number) {
    this.ttl = ttl;
  }

  public async get<T = any>(
    key: string
  ): Promise<{ error: null; data: T } | { error: any; data: null }> {
    return new Promise((resolve, reject) => {
      try {
        const cacheItem = localStorage.getItem(key);
        if (!cacheItem) {
          return resolve({ error: `未找到${key}的缓存`, data: null });
        }

        const { data, exp } = JSON.parse(cacheItem) as CacheData<T>;
        if (exp < Math.ceil(new Date().getTime() / 1000)) {
          this.delete(key);
          return resolve({ error: `${key}的缓存已过期`, data: null });
        }
        resolve({ error: null, data });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }

  public async set<T = any>(
    key: string,
    value: T
  ): Promise<{ error: null; data: true } | { error: any; data: null }> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            data: value,
            exp: Math.ceil(new Date().getTime() / 1000) + this.ttl,
          })
        );
        resolve({ error: null, data: true });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }

  public async delete(
    key: string
  ): Promise<{ error: null; data: true } | { error: any; data: null }> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.removeItem(key);
        resolve({ error: null, data: true });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }
}
