import type { CacheAdapter } from "../type";

/** One persisted record, mirroring the in-memory shape. */
interface StoredRecord {
  value: unknown;
  /** Absolute ms timestamp; `0` means "never expires". */
  expiresAt: number;
}

/**
 * {@link IndexedDBCacheAdapter} 接受的选项。
 *
 * Options accepted by {@link IndexedDBCacheAdapter}.
 */
export interface IndexedDBCacheAdapterOptions {
  /**
   * 数据库名称。默认 `"snail-js-api"`。
   *
   * Database name. Defaults to `"snail-js-api"`.
   */
  databaseName?: string;

  /**
   * 对象仓库名称，也就是命名空间。默认 `"cache"`。
   *
   * Object store name, and therefore the namespace. Defaults to `"cache"`.
   */
  storeName?: string;

  /**
   * 架构版本，在仓库结构变化时递增。
   *
   * Schema version, bumped when the store layout changes.
   */
  version?: number;
}

/**
 * 基于 IndexedDB 的 L2 适配器。
 *
 * ## 为什么每个方法都降级而不是 reject
 *
 * IndexedDB 在 Node 中不存在，在隐私浏览模式下也可能不可用。L2 存储只是一种优化：
 * 即使它缺失，请求也必须成功（并且结果正确）。因此每个公开方法都以“没有存储任何东西”
 * 或空操作结束，而不是抛错；连接是延迟打开的，所以导入本模块——或构造适配器——
 * 都不会触碰任何全局对象。
 *
 * ## 为什么超时存在每条记录里，而不是建索引
 *
 * 用 TTL 索引的话，读取一个已过期的键仍然需要第二次查询。记录自带 `expiresAt`，
 * 于是新鲜度检查就只是对已取回的值做一次纯内存比较。
 *
 * L2 adapter over IndexedDB.
 *
 * ## Why every method degrades instead of rejecting
 *
 * IndexedDB is absent in Node and can be unavailable in private browsing modes.
 * An L2 store is an optimisation: a request must succeed (and stay correct) when
 * it is missing. Every public method therefore resolves to "nothing stored" or a
 * no-op rather than throwing, and the connection is opened lazily so importing
 * this module — or constructing the adapter — never touches a global.
 *
 * ## Why the timeout is stored per record, not as an index
 *
 * A TTL index would make reads of an expired key need a second query anyway. The
 * record carries its own `expiresAt`, which makes the freshness check a pure
 * in-memory comparison on the value already fetched.
 */
export class IndexedDBCacheAdapter implements CacheAdapter {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly version: number;

  private database: IDBDatabase | undefined;
  private opening: Promise<IDBDatabase> | undefined;

  /**
   * 创建一个 IndexedDB 适配器；此时不会打开数据库。
   *
   * Creates an IndexedDB adapter without opening the database yet.
   *
   * @param options 适配器选项（`databaseName`、`storeName`、`version`）
   *   / Adapter options (`databaseName`, `storeName`, `version`)
   */
  constructor(options: IndexedDBCacheAdapterOptions = {}) {
    this.databaseName = options.databaseName ?? "snail-js-api";
    this.storeName = options.storeName ?? "cache";
    this.version = options.version ?? 1;
  }

  /**
   * 当环境完全没有 IndexedDB 时为 `false`。
   *
   * `false` when the environment has no IndexedDB at all.
   */
  get available(): boolean {
    try {
      return typeof globalThis.indexedDB !== "undefined";
    } catch {
      return false;
    }
  }

  /**
   * 读取一个值；已过期的记录会在读取时被删除。
   *
   * Reads a value; an expired record is deleted while it is read.
   *
   * @param key 缓存键 / Cache key
   * @returns 存储的值；缺失、已过期或读取失败时为 `undefined` / The stored value, or
   *   `undefined` when absent, expired or the read failed
   */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    try {
      const database = await this.open();
      const record = await this.read(database, key);
      if (record === undefined) return undefined;

      if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
        await this.delete(key);
        return undefined;
      }

      return record.value as T;
    } catch {
      return undefined;
    }
  }

  /**
   * 存储一个值。环境没有 IndexedDB 时是空操作；真正的写入错误（配额、事务中止）
   * 会向上抛出，由管理器记录。
   *
   * Stores a value. A no-op when the environment has no IndexedDB; a real write
   * error (quota, aborted transaction) propagates for the manager to log.
   *
   * @param key 缓存键 / Cache key
   * @param value 要存储的值 / The value to store
   * @param ttlSeconds 存活秒数；`<= 0` 表示永不过期 / Lifetime in seconds; `<= 0` means no expiry
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    // A missing global is an environment fact, not a failure: no-op so a Node
    // test can construct and exercise the adapter. A *real* write error (quota,
    // aborted transaction) propagates — the manager logs it and the request
    // still succeeds.
    if (!this.available) return;

    const database = await this.open();
    const record: StoredRecord = {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0
    };

    await this.transaction(database, "readwrite", (store) => {
      store.put(record, key);
    });
  }

  /**
   * 删除一个键；任何失败都被吞掉，因为删除本身就不存在的东西不算失败。
   *
   * Removes a key; any failure is swallowed, because deleting something that is
   * not there is not a failure.
   */
  async delete(key: string): Promise<void> {
    try {
      const database = await this.open();
      await this.transaction(database, "readwrite", (store) => {
        store.delete(key);
      });
    } catch {
      // Removing something from a store that does not exist is not a failure.
    }
  }

  /**
   * 清空本适配器使用的对象仓库；任何失败都被吞掉。
   *
   * Clears the object store this adapter uses; any failure is swallowed.
   */
  async clear(): Promise<void> {
    try {
      const database = await this.open();
      await this.transaction(database, "readwrite", (store) => {
        store.clear();
      });
    } catch {
      /* no store to clear */
    }
  }

  /**
   * 对象仓库中的全部键；读取失败时返回空数组。
   *
   * Every key in the object store, or an empty array when the read fails.
   */
  async keys(): Promise<string[]> {
    try {
      const database = await this.open();
      const transaction = database.transaction(this.storeName, "readonly");
      const request = transaction.objectStore(this.storeName).getAllKeys();
      const keys = await requestToPromise<IDBValidKey[]>(request);
      return keys.map(String);
    } catch {
      return [];
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Open (once) and memoise the database connection.
   *
   * The in-flight promise is stored before it settles, so two concurrent
   * requests cannot open the same database twice and leak a connection.
   */
  private open(): Promise<IDBDatabase> {
    if (this.database) return Promise.resolve(this.database);
    if (this.opening) return this.opening;

    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const factory = globalThis.indexedDB;
      if (!factory) {
        reject(new Error("[snail] IndexedDB is not available in this environment"));
        return;
      }

      const request = factory.open(this.databaseName, this.version);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => {
        this.database = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("[snail] IndexedDB upgrade is blocked"));
    }).finally(() => {
      // A failed open must be retried on the next call rather than cached.
      this.opening = undefined;
    });

    return this.opening;
  }

  private async read(database: IDBDatabase, key: string): Promise<StoredRecord | undefined> {
    const transaction = database.transaction(this.storeName, "readonly");
    const request = transaction.objectStore(this.storeName).get(key);
    const value = await requestToPromise<StoredRecord | undefined>(request);
    if (value === undefined || value === null || typeof value !== "object") return undefined;
    if (!("value" in value) || !("expiresAt" in value)) return undefined;
    return value;
  }

  private transaction(
    database: IDBDatabase,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode);
      run(transaction.objectStore(this.storeName));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

/** Bridge a one-shot `IDBRequest` into a promise. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
