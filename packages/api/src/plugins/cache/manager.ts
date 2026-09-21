import type { SnailLogger } from "../../core/logger";
import { createLogger } from "../../core/logger";
import { SnailPluginError } from "../../error";
import { t } from "../../locale";
import type { SnailMethodType } from "../../typings/api";
import { IndexedDBCacheAdapter } from "./adapters/indexeddb";
import { DEFAULT_L1_MAX_SIZE, MemoryCacheAdapter } from "./adapters/memory";
import { WebStorageCacheAdapter } from "./adapters/web-storage";
import type { CacheAdapter, CacheLookup, CacheOptions } from "./type";

/**
 * {@link CacheManager} 的构造选项：`CacheOptions` 再加上一个日志器。
 *
 * Options for constructing a {@link CacheManager}: `CacheOptions` plus a logger.
 */
export interface CacheManagerOptions extends CacheOptions {
  /**
   * 用于记录 L2 失败的日志器。
   *
   * 管理器运行在任何请求之外，因此没有 `ctx.logger`；插件会注入一个依据
   * `@Server({ logLevel })` 构建的日志器。默认静默，因为缓存本身不应让应用变得嘈杂。
   *
   * Logger for L2 failures.
   *
   * The manager runs outside any request, so it has no `ctx.logger`; the plugin
   * injects one built from `@Server({ logLevel })`. Defaults to silent, because a
   * cache must not make an application noisy by itself.
   */
  logger?: SnailLogger;
}

/**
 * 已应用全部默认值的 `CacheOptions`——也就是管理器的公开状态。
 *
 * `CacheOptions` with every default applied — the manager's public state.
 */
export interface ResolvedCacheOptions {
  /**
   * 条目存活秒数，已解析为正数。
   *
   * Entry lifetime in seconds, already resolved to a positive number.
   */
  ttl: number;
  /**
   * L1 的 LRU 容量，已解析为正数。
   *
   * L1 LRU capacity, already resolved to a positive number.
   */
  maxSize: number;
  /**
   * 是否启用 L1 存储。
   *
   * Whether the L1 store is enabled.
   */
  l1: boolean;
  /**
   * 已构造好的 L2 适配器；未配置或所选环境不可用时为 `undefined`。
   *
   * The resolved L2 adapter, or `undefined` when unconfigured or unavailable.
   */
  l2: CacheAdapter | undefined;
  /**
   * `"all"`，或已归一化为大写的请求方法列表。
   *
   * `"all"`, or an uppercased verb list.
   */
  cacheFor: "all" | readonly SnailMethodType[];
  /**
   * 已解析的键前缀。
   *
   * The resolved key prefix.
   */
  prefix: string;
  /**
   * 是否启用“先返回过期值再后台刷新”（默认值已应用）。
   *
   * Whether stale-while-revalidate is on (default applied).
   */
  staleWhileRevalidate: boolean;
  /**
   * 是否把并发相同请求合并为一次（默认值已应用）。
   *
   * Whether concurrent identical requests are collapsed into one (default applied).
   */
  dedupe: boolean;
}

/** Probe result that can tell "stored undefined" from "nothing stored". */
type Probe<T> = { found: true; value: T } | { found: false };

/** Verbs cached when `cacheFor` is not configured. */
const DEFAULT_CACHE_FOR: readonly SnailMethodType[] = ["GET"];

/**
 * 缓存插件背后的存储引擎。
 *
 * ## 层次
 *
 * - **L1** 是一个 {@link MemoryCacheAdapter}：除非 `l1: false`，否则总是存在，
 *   受 `maxSize` 约束，也是 L2 命中后唯一的回填目标。
 * - **L2** 是任意 {@link CacheAdapter}，通常是持久化存储。
 *
 * ## 适配器不管、由管理器负责的部分
 *
 * TTL、LRU 与标签是策略而非存储。把它们放在这里，意味着自定义 L2 适配器只需回答
 * “get/set/delete”，完全不必知道标签是什么——这正是适配器接口小到可以架设在任何东西
 * （IndexedDB、`localStorage`、HTTP 缓存）之上的原因。
 *
 * ## 新鲜度与 `staleWhileRevalidate`
 *
 * 新鲜度始终由本类根据它在 `set` 时记录的 `expiresAt` 判定。在 stale-while-revalidate
 * 模式下，L1 被告知“永不过期”，好让过期副本留存下来，在插件后台刷新它期间继续对外提供；
 * 否则 L1 会拿到真实 TTL 并自行清扫该条目。L2 始终拿到真实 TTL，这样另一个标签页
 * （没有共享的内存索引）永远不会读到过期数据。
 *
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
  /**
   * 完全解析后的选项，对外暴露以便插件套用同一套策略。
   *
   * Fully resolved options, exposed so the plugin can apply the same policy.
   */
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

  /**
   * 创建一个管理器：解析全部选项，并在启用 L1 时装配 L1 存储。
   *
   * Creates a manager: every option is resolved and, when L1 is enabled, the L1
   * store is assembled.
   *
   * @param options 选项与日志器；缺省即全部使用默认值 / Options and a logger; omitted
   *   means "all defaults"
   */
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

  /**
   * **L1** 中的存活条目数。按设计不枚举 L2。
   *
   * Number of live **L1** entries. L2 is not enumerated, by design.
   */
  get size(): number {
    return this.l1?.size ?? 0;
  }

  /**
   * 读取一个新鲜的值。
   *
   * 过期条目（仅为 stale-while-revalidate 保留）*不会*被返回：需要提供过期数据的调用方
   * 必须显式调用 {@link lookup}，这样常见路径就不可能意外地提供已失效的数据。
   *
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

  /**
   * 当 `key` 下存有新鲜值时为 `true`。
   *
   * `true` when a fresh value is stored under `key`.
   */
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  /**
   * 读取一个值，并同时返回它的新鲜度。
   *
   * `allowStale` 对应插件的 `staleWhileRevalidate` 开关：当条目已超过 TTL 但仍驻留在
   * 存储中时，会带着 `stale: true` 返回，让调用方可以先提供它、事后再刷新。
   *
   * Read a value together with its freshness.
   *
   * `allowStale` is the plugin's `staleWhileRevalidate` switch: when the entry is
   * past its TTL but still resident, it is returned with `stale: true` so the
   * caller can serve it now and refresh afterwards.
   *
   * @param key 缓存键 / Cache key
   * @param allowStale 是否允许返回过期条目；默认 false / Whether a stale entry may be
   *   returned; defaults to false
   * @returns 值与新鲜度，或 `undefined` / The value with its freshness, or `undefined`
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
   * 把值写入 L1 与 L2。
   *
   * `ttlSeconds` 默认为配置的 TTL，`tags` 可以为空；在这里写入的标签，就是之后
   * `@Invalidates("tag")` 要清除的目标。
   *
   * Store a value in L1 and L2.
   *
   * `ttlSeconds` defaults to the configured TTL and `tags` may be empty; a tag
   * written here is what `@Invalidates("tag")` later purges.
   *
   * @param key 缓存键 / Cache key
   * @param value 要存储的值 / The value to store
   * @param ttlSeconds 存活秒数；默认取配置的 TTL / Lifetime in seconds; defaults to the
   *   configured TTL
   * @param tags 附加到该条目上的标签；默认空 / Tags attached to the entry; empty by default
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

  /**
   * 从每一层删除一个条目。
   *
   * Remove one entry from every layer.
   */
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

  /**
   * 删除本管理器能看到的所有条目。
   *
   * Remove every entry this manager can see.
   */
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
   * 清除所有带有 `tags` 中任意一个标签的条目。
   *
   * 由 `@Invalidates(...)` / `@HitSource(...)` 在请求成功后调用。这里先收集键再删除，
   * 因为删除会改动这些键所属的标签索引。
   *
   * Purge every entry carrying any of `tags`.
   *
   * Used by `@Invalidates(...)` / `@HitSource(...)` after a successful request.
   * Keys are collected first because deleting mutates the tags they came from.
   *
   * @param tags 要清除的标签 / The tags to purge
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

  /**
   * {@link clear} 的别名，其拼写迎合 `@Invalidates("*")` 风格的调用方。
   *
   * Alias of {@link clear}, spelled the way `@Invalidates("*")`-style callers expect.
   */
  async invalidateAll(): Promise<void> {
    await this.clear();
  }

  // ── in-flight de-duplication ──────────────────────────────────────────────

  /**
   * 当前正在为 `key` 发送的请求所对应的 promise（如果存在）。
   *
   * The promise of the request currently being sent for `key`, if any.
   */
  getInFlight(key: string): Promise<unknown> | undefined {
    return this.flight.get(key);
  }

  /**
   * 发布正在为 `key` 发送的请求所对应的 promise。
   *
   * 该条目会在 promise 敲定时自行移除，因此一个被拒绝的共享 promise 不会被之后无关的
   * 请求取走。这次拒绝同时被标记为已观察：否则在没有跟随者等待时失败的领头请求，
   * 会在 Node 中表现为未处理的 rejection。
   *
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
