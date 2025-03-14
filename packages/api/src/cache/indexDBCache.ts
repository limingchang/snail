import { CacheSetData,CacheGetData,CacheStorageAdapter } from "../typings";

const INDEXDB_DATABASE_NAME = "SNAIL_CACHE";
const INDEXDB_VERSION = 3;
const INDEXDB_OBJECT_STORE_NAME = "SNAIL_CACHE_OBJECT";
const INDEXDB_INDEX_NAME = "SNAIL_CACHE_INDEX";
// const INDEXDB_OBJECT_STORE_KEY = "SNAIL_CACHE_KEY";

export default class IndexDBCache implements CacheStorageAdapter {
  public ttl: number;
  private db?: IDBDatabase | null;

  constructor(ttl: number) {
    this.ttl = ttl;
  }

  async init() {
    this.db = await this.openDB();
  }
  private async openDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXDB_DATABASE_NAME, INDEXDB_VERSION);
      request.onupgradeneeded = function (event: IDBVersionChangeEvent) {
        const db = (event.target as any).result as IDBDatabase;
        // 为数据库创建对象存储（objectStore）
        const objectStore = db.createObjectStore(INDEXDB_OBJECT_STORE_NAME, {
          keyPath: "key",
        });
        // 创建索引
        objectStore.createIndex(INDEXDB_INDEX_NAME, "key", {
          unique: false,
        });
      };
      request.onsuccess = function (event) {
        const db = (event.target as any).result as IDBDatabase;
        resolve(db);
      };
      request.onerror = (event) => {
        console.error(`[indexDB]连接数据库错误：${event.target}`);
        reject(null);
      };
    });
  }

  public async get<T = any>(
    key: string
  ) : Promise<CacheGetData<T>>{
    return new Promise(async (resolve, reject) => {
      if (this.db === null || this.db === undefined) {
        // return reject({ error: new Error("数据库未初始化"), data: null });
        await this.init();
      }
      const select: IDBRequest<T> = (this.db as IDBDatabase)
        .transaction(INDEXDB_OBJECT_STORE_NAME, "readonly")
        .objectStore(INDEXDB_OBJECT_STORE_NAME)
        .get(key);

      select.onsuccess = () => {
        const result = select.result as CacheSetData<T>;
        if (!result || result.exp < Math.ceil(new Date().getTime() / 1000)) {
          this.delete(key);
          return resolve({ error: new Error("缓存已过期"), data: null });
        }
        resolve({ error: null, data: result.data });
      };

      select.onerror = (event) => {
        reject({
          error: new Error(`查询数据错误：${event.target}`),
          data: null,
        });
      };
    });
  }

  public async set<T = any>(
    key: string,
    value: T
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      if (this.db === null || this.db === undefined) {
        await this.init();
      }

      const select = (this.db as IDBDatabase)
        .transaction(INDEXDB_OBJECT_STORE_NAME, "readwrite")
        .objectStore(INDEXDB_OBJECT_STORE_NAME)
        .put({
          data: value,
          exp: Math.ceil(new Date().getTime() / 1000) + this.ttl,
          key,
        });

      select.onsuccess = () => {
        resolve(true);
      };

      select.onerror = (event) => {
        console.error(`[indexDB]插入数据错误：${event.target}`);
        reject(event);
      };
    });
  }

  public async delete(
    key: string
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      if (this.db === null || this.db === undefined) {
        await this.init();
      }

      const select = (this.db as IDBDatabase)
        .transaction(INDEXDB_OBJECT_STORE_NAME, "readwrite")
        .objectStore(INDEXDB_OBJECT_STORE_NAME)
        .delete(key);

      select.onsuccess = () => {
        resolve(true);
      };

      select.onerror = (event) => {
        console.error(`[indexDB]删除数据错误：${event.target}`);
        reject(event);
      };
    });
  }

  public async clear(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) await this.init();
      
      const transaction = (this.db as IDBDatabase)
        .transaction(INDEXDB_OBJECT_STORE_NAME, "readwrite");
      const request = transaction
        .objectStore(INDEXDB_OBJECT_STORE_NAME)
        .clear();

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => {
        console.error(`[indexDB]清空数据错误：${event.target}`);
        reject(false);
      };
    });
  }

  public async keys(): Promise<string[]> {
    return new Promise(async (resolve, reject) => {
      if (!this.db) await this.init();
      
      const transaction = (this.db as IDBDatabase)
        .transaction(INDEXDB_OBJECT_STORE_NAME, "readonly");
      const request = transaction
        .objectStore(INDEXDB_OBJECT_STORE_NAME)
        .getAllKeys();

      request.onsuccess = () => 
        resolve(request.result.map(key => key.toString()));
      request.onerror = (event) => {
        console.error(`[indexDB]获取键名错误：${event.target}`);
        reject([]);
      };
    });
  }
}
