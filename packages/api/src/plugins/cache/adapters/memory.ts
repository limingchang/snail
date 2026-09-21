import type { CacheAdapter } from "../type";

/**
 * {@link MemoryCacheAdapter} 接受的选项。
 *
 * Options accepted by {@link MemoryCacheAdapter}.
 */
export interface MemoryCacheAdapterOptions {
  /**
   * 存活条目的最大数量，超出时优先淘汰最久未使用的条目。
   *
   * 非正数或非有限值都按 {@link DEFAULT_L1_MAX_SIZE} 处理：无上限的内存存储就是泄漏，
   * 因此不允许被无意触发。
   *
   * Maximum number of live entries. Least-recently-used entries are evicted
   * first.
   *
   * A non-positive or non-finite value means {@link DEFAULT_L1_MAX_SIZE}: an
   * unbounded in-memory store is a leak, so it must not be reachable by accident.
   */
  maxSize?: number;

  /**
   * 当条目在持有者未主动要求的情况下离开存储时调用——过期或被容量淘汰。
   *
   * `CacheManager` 用它把键从标签索引和过期时间表中移除；没有它，被淘汰的键会永久
   * 保留标签，`invalidateTags` 也会不断对已经不存在的键触发 `delete`。
   *
   * Called whenever an entry leaves the store without the owner asking —
   * expiry or capacity eviction.
   *
   * The `CacheManager` uses it to drop the key from its tag index and TTL map;
   * without it, evicted keys would keep their tags forever and
   * `invalidateTags` would keep firing `delete` calls for keys that are gone.
   */
  onEvict?: (key: string) => void;
}

/**
 * 当配置的 L1 容量缺失或非正数时使用的容量。
 *
 * L1 capacity used whenever the configured one is missing or not positive.
 */
export const DEFAULT_L1_MAX_SIZE = 100;

/** One stored value plus the absolute timestamp it stops being fresh. */
interface MemoryRecord {
  value: unknown;
  /** `0` means "never expires". */
  expiresAt: number;
}

/**
 * L1 存储：一个带 TTL 与 LRU 容量的 `Map`。
 *
 * ## 为什么没有清扫定时器
 *
 * 重写前的内存适配器跑着一个 `setInterval`，它（a）让 Node 进程永不退出，
 * （b）让测试一直挂起直到 vitest 强制杀掉。因此过期改为*惰性*清扫，在每次操作开始时
 * 执行：最多检查 `maxSize` 条记录，在任何现实容量下都比它替代的定时器便宜，
 * 而且不可能比存储本身活得更久。
 *
 * ## 为什么用 `Map` 而不是 `WeakMap`
 *
 * LRU 需要枚举和顺序。`Map` 保留插入顺序，所以“最久未使用”就是“第一个键”，
 * 触碰一个条目只是删除再写入——不需要维护一条与数据保持同步的链表。
 *
 * The L1 store: a `Map` with TTL and LRU capacity.
 *
 * ## Why there is no sweep timer
 *
 * The pre-rewrite memory adapter ran a `setInterval` that (a) kept a Node
 * process alive forever and (b) made tests hang until vitest force-killed them.
 * Expiry is therefore swept *lazily*, at the start of every operation: at most
 * `maxSize` records are inspected, which is cheaper than the timer it replaces
 * for any realistic capacity, and it cannot outlive the store.
 *
 * ## Why a `Map` and not a `WeakMap`
 *
 * LRU needs enumeration and ordering. `Map` preserves insertion order, so
 * "least recently used" is simply "first key" and touching an entry is
 * delete + set — no linked list to keep in sync with the data.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private readonly records = new Map<string, MemoryRecord>();
  private readonly maxSize: number;
  private readonly onEvict: ((key: string) => void) | undefined;

  /**
   * 创建一个 L1 存储，并把 `maxSize` 解析为有效容量。
   *
   * Creates an L1 store and resolves `maxSize` to an effective capacity.
   *
   * @param options 适配器选项（`maxSize`、`onEvict`） / Adapter options (`maxSize`, `onEvict`)
   */
  constructor(options: MemoryCacheAdapterOptions = {}) {
    const maxSize = options.maxSize;
    this.maxSize =
      typeof maxSize === "number" && Number.isFinite(maxSize) && maxSize > 0
        ? Math.floor(maxSize)
        : DEFAULT_L1_MAX_SIZE;
    this.onEvict = options.onEvict;
  }

  /**
   * 存活条目数。取值前会先清扫过期条目。
   *
   * Number of live entries.
   */
  get size(): number {
    this.sweep();
    return this.records.size;
  }

  /**
   * 当键存在且仍然新鲜时为 `true`。
   *
   * `true` when the key is present and still fresh.
   */
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  /**
   * 读取一个值，并把该键移到 LRU 顺序的末尾。
   *
   * Reads a value and moves the key to the end of the LRU order.
   *
   * @param key 缓存键 / Cache key
   * @returns 存储的值；未存储或已过期时为 `undefined` / The stored value, or `undefined` if absent or expired
   */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    this.sweep();

    const record = this.records.get(key);
    if (!record) return undefined;

    // Re-inserting moves the key to the end of the iteration order, which is
    // what makes the eviction above least-recently-*used* rather than FIFO.
    this.records.delete(key);
    this.records.set(key, record);

    return record.value as T;
  }

  /**
   * 存储一个值，必要时先按容量淘汰。`ttlSeconds <= 0` 表示永不过期。
   *
   * Stores a value, evicting for capacity first when needed.
   * `ttlSeconds <= 0` means "never expires".
   *
   * @param key 缓存键 / Cache key
   * @param value 要存储的值 / The value to store
   * @param ttlSeconds 存活秒数；`<= 0` 表示永不过期 / Lifetime in seconds; `<= 0` means no expiry
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.sweep();

    // Delete first so an update also counts as a "most recent use".
    const existed = this.records.delete(key);
    if (!existed) this.evictForCapacity(1);

    this.records.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0
    });
  }

  /**
   * 删除一个键。删除不存在的键是空操作。
   *
   * Removes a key. Removing an absent key is a no-op.
   */
  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  /**
   * 删除全部条目（包括尚未清扫的过期条目）。
   *
   * Removes every entry, including expired ones not yet swept.
   */
  async clear(): Promise<void> {
    this.records.clear();
  }

  /**
   * 当前存储的全部键，取值前会先清扫过期条目。
   *
   * Every key currently stored; expired ones are swept before listing.
   *
   * @returns 键数组，顺序与 `Map` 的迭代顺序一致 / The keys, in `Map` iteration order
   */
  async keys(): Promise<string[]> {
    this.sweep();
    return [...this.records.keys()];
  }

  /** Drop expired records. Called before every operation, never on a timer. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, record] of this.records) {
      if (record.expiresAt !== 0 && record.expiresAt <= now) {
        this.records.delete(key);
        this.onEvict?.(key);
      }
    }
  }

  /** Make room for `incoming` new entries by dropping the oldest ones. */
  private evictForCapacity(incoming: number): void {
    while (this.records.size + incoming > this.maxSize) {
      const oldest = this.records.keys().next();
      if (oldest.done) return;
      this.records.delete(oldest.value);
      this.onEvict?.(oldest.value);
    }
  }
}
