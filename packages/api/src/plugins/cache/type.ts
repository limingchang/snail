import type { SnailMethodType } from "../../typings/api";

/**
 * 缓存插件共享的类型定义。
 *
 * 整体设计分为三层，每层只承担一件事：
 *
 * - **装饰器**声明要做什么（`@Cacheable`、`@NoCache`、`@Invalidates`），
 * - **插件**把这些元数据与缓存选项组合成一次请求的计划，
 * - **`CacheManager`** 负责存储：L1、可选的 L2、TTL、LRU 与标签索引。
 *
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
 * 持久化（或至少比单次请求活得更久）的缓存存储，即 “L2”。
 *
 * 所有方法刻意设计为异步：`localStorage` 是同步的，IndexedDB 不是；让同步实现伪装成异步
 * 没有额外代价，反过来让异步存储伪装成同步则不可能。因此 IndexedDB 在整个插件里
 * 都不需要任何特殊分支。
 *
 * 实现不得因环境缺失而抛错——内置的 IndexedDB 与 Web Storage 适配器会退化为空操作——
 * 但管理器仍然对调用做了保护，因为配额错误（`QuotaExceededError`）是正常结果，
 * 绝不能让请求因此失败。
 *
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
  /**
   * 读取一个值。`undefined` 表示“未存储”或“已过期”。
   *
   * Read a value. `undefined` means "not stored" or "expired".
   */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * 存储一个值。`ttlSeconds <= 0` 表示“永不过期”。
   *
   * Store a value. `ttlSeconds <= 0` means "no expiry".
   */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;

  /**
   * 删除一个键。删除不存在的键不算错误。
   *
   * Remove one key. Removing an absent key is not an error.
   */
  delete(key: string): Promise<void>;

  /**
   * 删除此适配器拥有的全部数据。
   *
   * Remove everything this adapter owns.
   */
  clear(): Promise<void>;

  /**
   * 当前存储的全部键，前提是后端能够枚举它们。
   *
   * 之所以是可选的，是因为自定义适配器可能对接无法列出键的存储（例如 HTTP 缓存）。
   * 插件从不依赖它，它只服务于运维工具和测试。
   *
   * Every key currently stored, when the backend can enumerate them.
   *
   * Optional because a custom adapter may front a store that cannot list keys
   * (an HTTP cache, for example). The plugin never requires it; it exists for
   * maintenance tooling and for tests.
   */
  keys?(): Promise<string[]>;
}

/**
 * `Cache(...)` 接受的选项。
 *
 * Options accepted by `Cache(...)`.
 */
export interface CacheOptions {
  /**
   * 条目存活时间，单位为秒。默认 60。
   *
   * 必须为正数；0、负数或非有限值会回退到默认值，而不是静默存入一个永不过期的条目。
   *
   * Entry lifetime in seconds. Default 60.
   *
   * Must be positive; a zero, negative or non-finite value falls back to the
   * default rather than silently storing an entry that never expires.
   */
  ttl?: number;

  /**
   * L1 的 LRU 容量。默认 100。
   *
   * 非正数同样按 100 处理——无上限的内存缓存本质上就是换了个说法的内存泄漏，
   * 因此不允许被无意触发。
   *
   * L1 LRU capacity. Default 100.
   *
   * A non-positive value also means 100 — an unbounded in-memory cache is a leak
   * with extra steps, so it is not reachable by accident.
   */
  maxSize?: number;

  /**
   * L1 开关。默认 true。
   *
   * L1 on/off. Default true.
   */
  l1?: boolean;

  /**
   * L2 存储。
   *
   * 传入字符串会选择内置适配器并延迟解析其全局对象；传入对象则按原样使用。
   * 当所选的环境全局对象缺失时（Node 中既没有 `localStorage` 也没有 `indexedDB`），
   * 插件只警告一次并仅使用 L1，而不是抛错。
   *
   * L2 store.
   *
   * A string selects a built-in adapter and resolves its global lazily; an
   * object is used as-is. When the selected environment global is missing
   * (Node has neither `localStorage` nor `indexedDB`), the plugin warns once and
   * continues with L1 only instead of throwing.
   */
  l2?: "localStorage" | "sessionStorage" | "indexedDB" | CacheAdapter;

  /**
   * 哪些请求方法可被缓存。默认 `["GET"]`，也接受 `"all"`。
   *
   * Which verbs are cacheable. Default `["GET"]`. Accepts `"all"`.
   */
  cacheFor?: "all" | SnailMethodType | SnailMethodType[];

  /**
   * 键前缀，默认为服务名。
   *
   * Key prefix, defaults to the server name.
   */
  prefix?: string;

  /**
   * 立即返回过期条目并在后台刷新。默认 false。
   *
   * Serve a stale entry immediately and refresh in the background. Default false.
   */
  staleWhileRevalidate?: boolean;

  /**
   * 把并发的相同请求合并为一次。默认 true。
   *
   * Collapse concurrent identical requests into one. Default true.
   */
  dedupe?: boolean;
}

/**
 * `@Cacheable(...)` 接受的选项。
 *
 * 传入该装饰器即表示显式启用：被标记的方法（或类的每一个方法）即使使用
 * `cacheFor` 未列出的请求方法也会被缓存；不传它时则由 `cacheFor` 决定。
 *
 * Options accepted by `@Cacheable(...)`.
 *
 * Passing this decorator is an explicit opt-in: a method (or every method of a
 * class) marked with it is cached even for a verb that `cacheFor` does not list.
 * Without it, `cacheFor` decides.
 */
export interface CacheableOptions {
  /**
   * 该目标条目的存活秒数，覆盖 `CacheOptions.ttl`。
   *
   * 它按目标而非按调用生效，因为装饰器是静态元数据：一个方法若需要针对不同参数
   * 使用不同存活时间，就应该拆成两个方法。
   *
   * Entry lifetime in seconds for this target, overriding `CacheOptions.ttl`.
   *
   * Per-target rather than per-call because the decorator is static metadata: a
   * method that needs a different lifetime for different arguments wants two
   * methods.
   */
  ttl?: number;

  /**
   * 附加到所存条目上的标签，使 `@Invalidates("tag")` 无需知道键就能清除它。
   *
   * Tags attached to the stored entry, so `@Invalidates("tag")` can purge it
   * without knowing its key.
   */
  tags?: readonly string[];

  /**
   * 显式缓存键，跳过对方法/url/params/body 的哈希。
   *
   * 此后该方法的每次调用都共享同一个条目。当请求含有不应参与身份计算的易变部分
   * （如 nonce、时间戳）时可以这样用，代价是这些部分会被忽略。
   *
   * Explicit cache key, bypassing the method/url/params/body hash.
   *
   * Every call of that method then shares one entry. Reach for it when the
   * request has volatile parts that must not take part in the identity — a
   * nonce, a timestamp — and accept that those parts are ignored.
   */
  key?: string;
}

/**
 * 一个缓存值及其新鲜度，由 `CacheManager.lookup` 返回。
 *
 * One cached value plus its freshness, as returned by `CacheManager.lookup`.
 */
export interface CacheLookup<T = unknown> {
  /**
   * 存储的响应体。
   *
   * The stored body.
   */
  value: T;

  /**
   * 当条目已超过 TTL、但为 `staleWhileRevalidate` 被保留时为 `true`。
   *
   * `true` when the entry is past its TTL but was kept for `staleWhileRevalidate`.
   */
  stale: boolean;
}
