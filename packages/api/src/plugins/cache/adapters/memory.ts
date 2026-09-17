import type { CacheAdapter } from "../type";

/** Options accepted by {@link MemoryCacheAdapter}. */
export interface MemoryCacheAdapterOptions {
  /**
   * Maximum number of live entries. Least-recently-used entries are evicted
   * first.
   *
   * A non-positive or non-finite value means {@link DEFAULT_L1_MAX_SIZE}: an
   * unbounded in-memory store is a leak, so it must not be reachable by accident.
   */
  maxSize?: number;

  /**
   * Called whenever an entry leaves the store without the owner asking —
   * expiry or capacity eviction.
   *
   * The `CacheManager` uses it to drop the key from its tag index and TTL map;
   * without it, evicted keys would keep their tags forever and
   * `invalidateTags` would keep firing `delete` calls for keys that are gone.
   */
  onEvict?: (key: string) => void;
}

/** L1 capacity used whenever the configured one is missing or not positive. */
export const DEFAULT_L1_MAX_SIZE = 100;

/** One stored value plus the absolute timestamp it stops being fresh. */
interface MemoryRecord {
  value: unknown;
  /** `0` means "never expires". */
  expiresAt: number;
}

/**
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

  constructor(options: MemoryCacheAdapterOptions = {}) {
    const maxSize = options.maxSize;
    this.maxSize =
      typeof maxSize === "number" && Number.isFinite(maxSize) && maxSize > 0
        ? Math.floor(maxSize)
        : DEFAULT_L1_MAX_SIZE;
    this.onEvict = options.onEvict;
  }

  /** Number of live entries. */
  get size(): number {
    this.sweep();
    return this.records.size;
  }

  /** `true` when the key is present and still fresh. */
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

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

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

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
