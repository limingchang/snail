import type { CacheAdapter } from "../type";

/** One persisted record, mirroring the in-memory shape. */
interface StoredRecord {
  value: unknown;
  /** Absolute ms timestamp; `0` means "never expires". */
  expiresAt: number;
}

/**
 * {@link WebStorageCacheAdapter} 接受的选项。
 *
 * Options accepted by {@link WebStorageCacheAdapter}.
 */
export interface WebStorageCacheAdapterOptions {
  /**
   * 应用到每个键上的前缀，使两个适配器可以共用同一个存储区域。
   *
   * Prefix applied to every key, so two adapters can share one storage area.
   */
  prefix?: string;

  /**
   * 诊断信息中使用的名称，例如 `"localStorage"`。
   *
   * Name used in diagnostics, e.g. `"localStorage"`.
   */
  label?: string;
}

/**
 * 面向任意 Web Storage 区域的 L2 适配器。
 *
 * 一个类同时驱动 `localStorage` 与 `sessionStorage`：二者共享 `Storage` 接口，
 * 包装两次只会把下面每一处防护逻辑都复制一份。
 *
 * ## 为什么通过 getter 解析存储区域
 *
 * `localStorage` 在 Node 中不存在，而在浏览器里用户屏蔽站点数据后访问它会*抛错*。
 * 在构造函数里读取会让 `import` 时的行为依赖环境——Node 测试甚至无法构造出适配器来断言
 * 它会降级。因此 getter 在每次操作时调用且吞掉失败；存储退化为一个始终为空的缓存，
 * 由管理器把它变成“仅 L1”。
 *
 * L2 adapter over any Web Storage area.
 *
 * One class drives both `localStorage` and `sessionStorage`: they share the
 * `Storage` interface, and wrapping them twice would duplicate every guard below.
 *
 * ## Why the area is resolved through a getter
 *
 * `localStorage` does not exist in Node, and in a browser it *throws* on access
 * when the user has blocked site data. Reading it in the constructor would make
 * `import`-time behaviour environment-dependent — and a Node test could not even
 * construct the adapter to assert that it degrades. The getter is therefore
 * called per operation and its failure is swallowed; the store behaves as an
 * always-empty cache, which the manager turns into "L1 only".
 */
export class WebStorageCacheAdapter implements CacheAdapter {
  private readonly resolveStorage: () => Storage | undefined;
  private readonly prefix: string;

  /**
   * 诊断信息中使用的名称。
   *
   * Name used in diagnostics.
   */
  readonly label: string;

  /**
   * 创建一个 Web Storage 适配器。
   *
   * Creates a Web Storage adapter.
   *
   * @param resolveStorage 每次操作时解析目标存储区域；抛错即视为不可用 / Resolves the
   *   backing area per operation; throwing means "unavailable"
   * @param options 适配器选项（`prefix`、`label`） / Adapter options (`prefix`, `label`)
   */
  constructor(
    resolveStorage: () => Storage | undefined,
    options: WebStorageCacheAdapterOptions = {}
  ) {
    this.resolveStorage = resolveStorage;
    this.prefix = options.prefix ?? "[snail-cache]";
    this.label = options.label ?? "web storage";
  }

  /**
   * 当底层存储区域缺失时为 `false`——此时管理器会放弃 L2。
   *
   * `false` when the backing area is missing — the manager then drops L2.
   */
  get available(): boolean {
    return this.storage() !== undefined;
  }

  /**
   * 读取一个值；无法解析或已过期的条目会在读取时被顺手删除。
   *
   * Reads a value; an entry that cannot be parsed or has expired is removed
   * while it is read.
   *
   * @param key 缓存键，前缀会自动补上 / Cache key; the prefix is added for you
   * @returns 存储的值；缺失或已过期时为 `undefined` / The stored value, or `undefined` if absent or expired
   */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const storage = this.storage();
    if (!storage) return undefined;

    const raw = storage.getItem(this.key(key));
    if (raw === null) return undefined;

    const record = this.parse(raw);
    if (record === undefined) {
      // Someone else wrote that key, or the JSON is corrupt. Removing it keeps a
      // broken entry from being re-parsed on every request.
      storage.removeItem(this.key(key));
      return undefined;
    }

    if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
      storage.removeItem(this.key(key));
      return undefined;
    }

    return record.value as T;
  }

  /**
   * 存储一个值。配额错误会向上抛出，由管理器记录后让请求照常成功。
   *
   * Stores a value. A quota error propagates; the manager logs it and lets the
   * request succeed anyway.
   *
   * @param key 缓存键 / Cache key
   * @param value 要存储的值 / The value to store
   * @param ttlSeconds 存活秒数；`<= 0` 表示永不过期 / Lifetime in seconds; `<= 0` means no expiry
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const storage = this.storage();
    if (!storage) return;

    const record: StoredRecord = {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0
    };

    // Let a quota error propagate: the manager logs it and continues, which is
    // the only place that knows the request must not fail because of it.
    storage.setItem(this.key(key), JSON.stringify(record));
  }

  /**
   * 删除一个键；底层存储区域缺失时是空操作。
   *
   * Removes a key; a no-op when the backing area is missing.
   */
  async delete(key: string): Promise<void> {
    this.storage()?.removeItem(this.key(key));
  }

  /**
   * 只删除此前缀下的键，存储区域里的其他键保持不动。
   *
   * Removes only the keys under this prefix, leaving every other key in the
   * area alone.
   */
  async clear(): Promise<void> {
    const storage = this.storage();
    if (!storage) return;

    for (const key of this.keysOf(storage)) {
      storage.removeItem(key);
    }
  }

  /**
   * 当前存储的全部键，前缀已被去掉。
   *
   * Every key currently stored, with the prefix stripped.
   */
  async keys(): Promise<string[]> {
    const storage = this.storage();
    if (!storage) return [];

    return this.keysOf(storage).map((key) => key.slice(this.prefix.length));
  }

  private storage(): Storage | undefined {
    try {
      return this.resolveStorage();
    } catch {
      // Accessing `localStorage` can throw a SecurityError in a locked-down
      // browser; that is a missing area, not a crash.
      return undefined;
    }
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  /** Every storage key this adapter owns, prefix included. */
  private keysOf(storage: Storage): string[] {
    const owned: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(this.prefix)) owned.push(key);
    }
    return owned;
  }

  private parse(raw: string): StoredRecord | undefined {
    try {
      const parsed = JSON.parse(raw) as StoredRecord | null;
      if (parsed === null || typeof parsed !== "object") return undefined;
      if (!("value" in parsed) || !("expiresAt" in parsed)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }
}
