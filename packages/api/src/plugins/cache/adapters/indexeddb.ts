import type { CacheAdapter } from "../type";

/** One persisted record, mirroring the in-memory shape. */
interface StoredRecord {
  value: unknown;
  /** Absolute ms timestamp; `0` means "never expires". */
  expiresAt: number;
}

/** Options accepted by {@link IndexedDBCacheAdapter}. */
export interface IndexedDBCacheAdapterOptions {
  /** Database name. Defaults to `"snail-js-api"`. */
  databaseName?: string;

  /** Object store name, and therefore the namespace. Defaults to `"cache"`. */
  storeName?: string;

  /** Schema version, bumped when the store layout changes. */
  version?: number;
}

/**
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

  constructor(options: IndexedDBCacheAdapterOptions = {}) {
    this.databaseName = options.databaseName ?? "snail-js-api";
    this.storeName = options.storeName ?? "cache";
    this.version = options.version ?? 1;
  }

  /** `false` when the environment has no IndexedDB at all. */
  get available(): boolean {
    try {
      return typeof globalThis.indexedDB !== "undefined";
    } catch {
      return false;
    }
  }

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
