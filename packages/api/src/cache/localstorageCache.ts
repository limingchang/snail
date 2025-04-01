import { CacheGetData, CacheStorageAdapter } from "../typings";

export default class LocalStorageCache implements CacheStorageAdapter {
  public ttl: number;
  constructor(ttl: number) {
    this.ttl = ttl;
  }

  public async get<T = any>(key: string): Promise<CacheGetData<T>> {
    return new Promise((resolve, reject) => {
      try {
        const cacheItem = localStorage.getItem(key);
        if (!cacheItem) {
          return resolve({
            error: new Error(`未找到${key}的缓存`),
            data: null,
          });
        }
        const { data, exp } = JSON.parse(cacheItem);
        if (exp < Math.ceil(new Date().getTime() / 1000)) {
          this.delete(key);
          return resolve({
            error: new Error(`${key}的缓存已过期`),
            data: null,
          });
        }
        resolve({ error: null, data });
      } catch (error) {
        reject({ error, data: null });
      }
    });
  }

  public async set<T = any>(key: string, value: T): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            data: value,
            exp: Math.ceil(new Date().getTime() / 1000) + this.ttl,
          })
        );
        resolve(true);
      } catch (error) {
        console.error("[LocalStorage]插入数据错误：", error);
        reject({ error, data: null });
      }
    });
  }

  public async delete(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.removeItem(key);
        resolve(true);
      } catch (error) {
        console.error("[LocalStorage]删除数据错误：", error);
        reject(error);
      }
    });
  }

  public async clear(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.clear();
        resolve(true);
      } catch (error) {
        console.error("[LocalStorage]清空数据错误：", error);
        reject(false);
      }
    });
  }

  public async keys(): Promise<string[]> {
    return new Promise((resolve) => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }
      resolve(keys);
    });
  }
}
