import type { SnailLogger } from "../../core/logger";
import { createLogger } from "../../core/logger";
import { SnailPluginError } from "../../error";
import { t } from "../../locale";
import type { SnailMethodType } from "../../typings/api";
import { IndexedDBCacheAdapter } from "./adapters/indexeddb";
import { DEFAULT_L1_MAX_SIZE, MemoryCacheAdapter } from "./adapters/memory";
import { WebStorageCacheAdapter } from "./adapters/web-storage";
import type { CacheAdapter, CacheLookup, CacheOptions } from "./type";

export interface CacheManagerOptions extends CacheOptions {
  /**
   * Logger for L2 failures.
   *
   * The manager runs outside any request, so it has no `ctx.logger`; the plugin
   * injects one built from `@Server({ logLevel })`. Defaults to silent, because a
   * cache must not make an application noisy by itself.
   */
  logger?: SnailLogger;
}

/** `CacheOptions` with every default applied — the manager's public state. */
export interface ResolvedCacheOptions {
  ttl: number;
  maxSize: number;
  l1: boolean;
  l2: CacheAdapter | undefined;
  cacheFor: "all" | readonly SnailMethodType[];
  prefix: string;
  staleWhileRevalidate: boolean;
  dedupe: boolean;
}

/** Probe result that can tell "stored undefined" from "nothing stored". */
type Probe<T> = { found: true; value: T } | { found: false };

/** Verbs cached when `cacheFor` is not configured. */
const DEFAULT_CACHE_FOR: readonly SnailMethodType[] = ["GET"];

/**
 * Storage engine behind the cache plugin.
 *
 * ## Layers
 *
 * - **L1** is a {@link MemoryCacheAdapter}: always present unless `l1: false`,
 *   bounded by `maxSize`, and the only place an L2 hit is promoted into.
 * - **L2** is any {@link CacheAdapter}, usually a persistent store.
 *
 * ## What the manager owns that the adapters do not
 *
 * TTL, LRU and tags are policy, not storage. Keeping them here means a custom L2
 * adapter only has to answer "get/set/delete" and never has to know what a tag
 * is — which is what makes the adapter interface small enough to implement over
 * anything (IndexedDB, `localStorage`, an HTTP cache).
 *
 * ## Freshness vs. `staleWhileRevalidate`
 *
 * Freshness is always decided by this class, using the `expiresAt` it records on
 * `set`. In stale-while-revalidate mode L1 is told "never expire" so the stale
 * copy survives to be served while the plugin refreshes it; otherwise L1 is
 * given the real TTL and sweeps the entry itself. L2 always receives the real TTL
 * so a second tab (which has no shared in-memory index) never reads a stale one.
 */
export class CacheManager {
  /** Fully resolved options, exposed so the plugin can apply the same policy. */
  readonly options: ResolvedCacheOptions;

  private readonly l1: MemoryCacheAdapter | undefined;
  private readonly logger: SnailLogger;

  /** key → absolute expiry timestamp in ms; `0` means "never expires". */
  private readonly expiry = new Map<string, number>();

  /** tag → every key carrying it. */
  private readonly tagIndex = new Map<string, Set<string>>();

  /** key → every tag it carries, so a delete can unindex it in O(tags). */
  private readonly keyTags = new Map<string, Set<string>>();

  /** Cache key → the promise of the request currently being sent for it. */
  private readonly flight = new Map<string, Promise<unknown>>();

  constructor(options: CacheManagerOptions = {}) {
    this.logger = options.logger ?? createLogger("silent");
    this.options = resolveOptions(options, this.logger);

    this.l1 = this.options.l1
      ? new MemoryCacheAdapter({
          maxSize: this.options.maxSize,
          // Evictions the manager did not initiate must still unindex the key.
          onEvict: (key) => this.forgetKey(key)
        })
      : undefined;
  }

  /** Number of live **L1** entries. L2 is not enumerated, by design. */
  get size(): number {
    return this.l1?.size ?? 0;
  }

  /**
   * Read a fresh value.
   *
   * A stale entry (kept alive only for stale-while-revalidate) is *not* returned:
   * callers that must serve staleness ask {@link lookup} explicitly, so the
   * common path cannot accidentally serve expired data.
   */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const found = await this.lookup<T>(key);
    return found?.value;
  }

  /** `true` when a fresh value is stored under `key`. */
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  /**
   * Read a value together with its freshness.
   *
   * `allowStale` is the plugin's `staleWhileRevalidate` switch: when the entry is
   * past its TTL but still resident, it is returned with `stale: true` so the
   * caller can serve it now and refresh afterwards.
   */
  async lookup<T = unknown>(key: string, allowStale = false): Promise<CacheLookup<T> | undefined> {
    const fromL1 = await this.readL1<T>(key);
    if (fromL1.found) {
      const stale = this.isStale(key);
      if (!stale || allowStale) return { value: fromL1.value, stale };
    }

    const fromL2 = await this.readL2<T>(key);
    if (!fromL2.found) return undefined;

    // Promote into L1 so the next hit never pays for L2 again. The remaining L2
    // lifetime is not observable through the adapter contract, so the manager's
    // own TTL is used — a best effort, and never longer than the L2 entry can be
    // assumed fresh.
    this.markExpiry(key, this.options.ttl);
    const l1Ttl = this.options.staleWhileRevalidate ? 0 : this.options.ttl;
    await this.writeL1(key, fromL2.value, l1Ttl);

    return { value: fromL2.value, stale: false };
  }

  /**
   * Store a value in L1 and L2.
   *
   * `ttlSeconds` defaults to the configured TTL and `tags` may be empty; a tag
   * written here is what `@Invalidates("tag")` later purges.
   */
  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = this.options.ttl,
    tags: readonly string[] = []
  ): Promise<void> {
    this.markExpiry(key, ttlSeconds);
    this.rememberTags(key, tags);

    // In stale-while-revalidate mode L1 must keep the entry past its TTL, so the
    // adapter is told "never expire" and this class owns the freshness decision.
    await this.writeL1(key, value, this.options.staleWhileRevalidate ? 0 : ttlSeconds);
    await this.writeL2(key, value, ttlSeconds);
  }

  /** Remove one entry from every layer. */
  async delete(key: string): Promise<void> {
    this.forgetKey(key);
    await this.l1?.delete(key);

    if (!this.options.l2) return;
    try {
      await this.options.l2.delete(key);
    } catch (error) {
      this.warnL2("delete", error);
    }
  }

  /** Remove every entry this manager can see. */
  async clear(): Promise<void> {
    await this.l1?.clear();
    this.expiry.clear();
    this.tagIndex.clear();
    this.keyTags.clear();

    if (!this.options.l2) return;
    try {
      await this.options.l2.clear();
    } catch (error) {
      this.warnL2("clear", error);
    }
  }

  /**
   * Purge every entry carrying any of `tags`.
   *
   * Used by `@Invalidates(...)` / `@HitSource(...)` after a successful request.
   * Keys are collected first because deleting mutates the tags they came from.
   */
  async invalidateTags(tags: readonly string[]): Promise<void> {
    const keys = new Set<string>();
    for (const tag of tags) {
      for (const key of this.tagIndex.get(tag) ?? []) keys.add(key);
    }

    for (const key of keys) {
      await this.delete(key);
    }
  }

  /** Alias of {@link clear}, spelled the way `@Invalidates("*")`-style callers expect. */
  async invalidateAll(): Promise<void> {
    await this.clear();
  }

  // ── in-flight de-duplication ──────────────────────────────────────────────

  /** The promise of the request currently being sent for `key`, if any. */
  getInFlight(key: string): Promise<unknown> | undefined {
    return this.flight.get(key);
  }

  /**
   * Publish the promise of the request being sent for `key`.
   *
   * The entry removes itself when the promise settles, so a rejected shared
   * promise cannot be picked up by a later, unrelated request. The rejection is
   * also marked as observed: a leader that fails with no follower waiting would
   * otherwise surface as an unhandled rejection in Node.
   */
  setInFlight(key: string, promise: Promise<unknown>): void {
    const tracked = promise.then(
      (value) => {
        // Only one leader can exist per key: a follower never registers, and the
        // entry it would find is always the leader's.
        this.flight.delete(key);
        return value;
      },
      (error) => {
        this.flight.delete(key);
        throw error;
      }
    );

    void tracked.catch(() => undefined);
    this.flight.set(key, tracked);
  }

  // ── layers ────────────────────────────────────────────────────────────────

  private async readL1<T>(key: string): Promise<Probe<T>> {
    if (!this.l1) return { found: false };
    const value = await this.l1.get<T>(key);
    return value === undefined ? { found: false } : { found: true, value };
  }

  private async readL2<T>(key: string): Promise<Probe<T>> {
    const l2 = this.options.l2;
    if (!l2) return { found: false };

    try {
      const value = await l2.get<T>(key);
      return value === undefined ? { found: false } : { found: true, value };
    } catch (error) {
      this.warnL2("read", error);
      return { found: false };
    }
  }

  private async writeL1(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.l1) return;
    await this.l1.set(key, value, ttlSeconds);
  }

  private async writeL2(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const l2 = this.options.l2;
    if (!l2) return;

    try {
      await l2.set(key, value, ttlSeconds);
    } catch (error) {
      // A persistent store can refuse a write (quota, private mode, offline).
      // That must never fail a request that has already succeeded.
      this.warnL2("write", error);
    }
  }

  // ── index bookkeeping ─────────────────────────────────────────────────────

  private markExpiry(key: string, ttlSeconds: number): void {
    this.expiry.set(key, ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0);
  }

  private isStale(key: string): boolean {
    const expiresAt = this.expiry.get(key);
    return expiresAt !== undefined && expiresAt !== 0 && expiresAt <= Date.now();
  }

  private rememberTags(key: string, tags: readonly string[]): void {
    if (tags.length === 0) return;

    const owned = this.keyTags.get(key) ?? new Set<string>();
    for (const tag of tags) {
      owned.add(tag);
      const keys = this.tagIndex.get(tag) ?? new Set<string>();
      keys.add(key);
      this.tagIndex.set(tag, keys);
    }
    this.keyTags.set(key, owned);
  }

  private forgetKey(key: string): void {
    this.expiry.delete(key);

    const tags = this.keyTags.get(key);
    if (!tags) return;

    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (!keys) continue;
      keys.delete(key);
      if (keys.size === 0) this.tagIndex.delete(tag);
    }
    this.keyTags.delete(key);
  }

  private warnL2(operation: string, error: unknown): void {
    this.logger.warn(
      t("cache.warn.l2.failed", this.options.prefix, `${operation}: ${String(error)}`)
    );
  }
}

// ── option resolution ───────────────────────────────────────────────────────

/** Apply every default and turn the L2 selector into a live adapter. */
function resolveOptions(options: CacheManagerOptions, logger: SnailLogger): ResolvedCacheOptions {
  const prefix = options.prefix ?? "[snail-cache]";

  return {
    ttl: positive(options.ttl, 60),
    maxSize: positive(options.maxSize, DEFAULT_L1_MAX_SIZE),
    l1: options.l1 ?? true,
    l2: createL2(options.l2, prefix, logger),
    cacheFor: normalizeCacheFor(options.cacheFor),
    prefix,
    staleWhileRevalidate: options.staleWhileRevalidate ?? false,
    dedupe: options.dedupe ?? true
  };
}

/**
 * Turn the `l2` selector into an adapter.
 *
 * A missing environment global becomes "no L2 at all" plus one warning, rather
 * than an adapter that silently misses on every read: the warning is the only
 * signal an application gets that its persistence intent was not honoured.
 */
function createL2(
  selector: CacheOptions["l2"],
  prefix: string,
  logger: SnailLogger
): CacheAdapter | undefined {
  if (selector === undefined) return undefined;
  if (typeof selector !== "string") return selector;

  const normalized = selector.toLowerCase();
  if (normalized === "localstorage" || normalized === "sessionstorage") {
    const area = normalized === "localstorage" ? "localStorage" : "sessionStorage";
    const adapter = new WebStorageCacheAdapter(
      () => (globalThis as unknown as Record<string, Storage | undefined>)[area],
      { prefix, label: area }
    );

    if (!adapter.available) {
      logger.warn(t("cache.warn.l2.unavailable", prefix, area));
      return undefined;
    }
    return adapter;
  }

  if (normalized === "indexeddb") {
    const adapter = new IndexedDBCacheAdapter({ storeName: prefix });
    if (!adapter.available) {
      logger.warn(t("cache.warn.l2.unavailable", prefix, "indexedDB"));
      return undefined;
    }
    return adapter;
  }

  throw new SnailPluginError(t("error.plugin.cache.adapter", selector), {
    pluginName: "cache"
  });
}

/** Normalise `cacheFor` into `"all"` or an uppercase verb list. */
function normalizeCacheFor(
  input: CacheOptions["cacheFor"]
): "all" | readonly SnailMethodType[] {
  if (input === undefined) return DEFAULT_CACHE_FOR;
  if (typeof input === "string") {
    return input.toLowerCase() === "all"
      ? "all"
      : [input.toUpperCase() as SnailMethodType];
  }
  return input.map((verb) => String(verb).toUpperCase() as SnailMethodType);
}

/** Coerce an optional count to a positive finite number, else `fallback`. */
function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
