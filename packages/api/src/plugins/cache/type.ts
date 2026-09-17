import type { SnailMethodType } from "../../typings/api";

/**
 * Shared shapes of the cache plugin.
 *
 * The design splits into three layers, each with one job:
 *
 * - a **decorator** says what to do (`@Cacheable`, `@NoCache`, `@Invalidates`),
 * - the **plugin** turns that metadata plus the cache options into a per-request
 *   plan, and
 * - a **`CacheManager`** owns storage: L1, optional L2, TTL, LRU and tag index.
 */

/**
 * A persistent (or at least outliving) cache store — "L2".
 *
 * Every method is asynchronous on purpose. `localStorage` is synchronous and
 * IndexedDB is not; forcing the synchronous one to pretend does not cost
 * anything, while letting an async store pretend to be synchronous is impossible.
 * IndexedDB therefore needs no special case anywhere in the plugin.
 *
 * An implementation must never throw for a missing environment — the built-in
 * IndexedDB and Web Storage adapters degrade to no-ops — but the manager guards
 * the calls anyway, because a quota error (`QuotaExceededError`) is a normal
 * outcome that must not fail the request.
 */
export interface CacheAdapter {
  /** Read a value. `undefined` means "not stored" or "expired". */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /** Store a value. `ttlSeconds <= 0` means "no expiry". */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;

  /** Remove one key. Removing an absent key is not an error. */
  delete(key: string): Promise<void>;

  /** Remove everything this adapter owns. */
  clear(): Promise<void>;

  /**
   * Every key currently stored, when the backend can enumerate them.
   *
   * Optional because a custom adapter may front a store that cannot list keys
   * (an HTTP cache, for example). The plugin never requires it; it exists for
   * maintenance tooling and for tests.
   */
  keys?(): Promise<string[]>;
}

/** Options accepted by `Cache(...)`. */
export interface CacheOptions {
  /**
   * Entry lifetime in seconds. Default 60.
   *
   * Must be positive; a zero, negative or non-finite value falls back to the
   * default rather than silently storing an entry that never expires.
   */
  ttl?: number;

  /**
   * L1 LRU capacity. Default 100.
   *
   * A non-positive value also means 100 — an unbounded in-memory cache is a leak
   * with extra steps, so it is not reachable by accident.
   */
  maxSize?: number;

  /** L1 on/off. Default true. */
  l1?: boolean;

  /**
   * L2 store.
   *
   * A string selects a built-in adapter and resolves its global lazily; an
   * object is used as-is. When the selected environment global is missing
   * (Node has neither `localStorage` nor `indexedDB`), the plugin warns once and
   * continues with L1 only instead of throwing.
   */
  l2?: "localStorage" | "sessionStorage" | "indexedDB" | CacheAdapter;

  /** Which verbs are cacheable. Default `["GET"]`. Accepts `"all"`. */
  cacheFor?: "all" | SnailMethodType | SnailMethodType[];

  /** Key prefix, defaults to the server name. */
  prefix?: string;

  /** Serve a stale entry immediately and refresh in the background. Default false. */
  staleWhileRevalidate?: boolean;

  /** Collapse concurrent identical requests into one. Default true. */
  dedupe?: boolean;
}

/**
 * Options accepted by `@Cacheable(...)`.
 *
 * Passing this decorator is an explicit opt-in: a method (or every method of a
 * class) marked with it is cached even for a verb that `cacheFor` does not list.
 * Without it, `cacheFor` decides.
 */
export interface CacheableOptions {
  /**
   * Entry lifetime in seconds for this target, overriding `CacheOptions.ttl`.
   *
   * Per-target rather than per-call because the decorator is static metadata: a
   * method that needs a different lifetime for different arguments wants two
   * methods.
   */
  ttl?: number;

  /**
   * Tags attached to the stored entry, so `@Invalidates("tag")` can purge it
   * without knowing its key.
   */
  tags?: readonly string[];

  /**
   * Explicit cache key, bypassing the method/url/params/body hash.
   *
   * Every call of that method then shares one entry. Reach for it when the
   * request has volatile parts that must not take part in the identity — a
   * nonce, a timestamp — and accept that those parts are ignored.
   */
  key?: string;
}

/** One cached value plus its freshness, as returned by `CacheManager.lookup`. */
export interface CacheLookup<T = unknown> {
  /** The stored body. */
  value: T;

  /** `true` when the entry is past its TTL but was kept for `staleWhileRevalidate`. */
  stale: boolean;
}
