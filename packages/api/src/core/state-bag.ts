/**
 * 带类型的键值容器。
 *
 * 每个请求上都会带两个彼此独立的容器：
 *
 * - `ctx.state` —— **插件暂存区**。定时器、缓存键、进行中的 promise、
 *   链路追踪 id。绝不暴露给调用方。
 * - `ctx.meta` —— **调用方可见的响应式值**（`data`、`code`、`message`、
 *   `loading`、`error`），由核心根据服务器的 `stateAdapter` 创建，外加插件
 *   通过 `initMeta` 贡献的额外句柄。
 *
 * 两者分开很重要：插件若把内部记账写进 `meta`，就会把内部状态泄漏到 UI
 * 渲染的对象上。
 *
 * Typed key/value bag.
 *
 * Two independent bags ride along every request:
 *
 * - `ctx.state` — **plugin scratch space**. Timers, cache keys, in-flight
 *   promises, tracing ids. Never exposed to the caller.
 * - `ctx.meta` — **caller-visible reactive values** (`data`, `code`, `message`,
 *   `loading`, `error`) created by core from the server's `stateAdapter`, plus any
 *   extra handle a plugin contributes through `initMeta`.
 *
 * Keeping them separate matters: a plugin writing bookkeeping into `meta` would
 * leak internal state into the object the UI renders.
 */
export class StateBag {
  private readonly values = new Map<string, unknown>();

  /**
   * 读取一个值，键不存在时可回退到给定默认值。
   *
   * Read a value, optionally falling back when the key is absent.
   *
   * @param key 状态键 / The state key.
   * @param fallback 键不存在时返回的值；省略时为 `undefined` /
   *   Value returned when the key is absent; `undefined` when omitted.
   * @returns 已存的值或 `fallback` / The stored value, or `fallback`.
   */
  get<T = unknown>(key: string): T | undefined;
  get<T = unknown>(key: string, fallback: T): T;
  get<T = unknown>(key: string, fallback?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : fallback) as T | undefined;
  }

  /**
   * 读取一个值，键不存在时抛错。
   *
   * 与 `get` 的区别在于它把「忘记写入」当作编程错误暴露出来，而不是返回
   * `undefined`。
   *
   * Read a value, throwing when the key is absent.
   *
   * @param key 状态键 / The state key.
   * @returns 已存的值 / The stored value.
   * @throws 键从未写入时抛出 `ReferenceError` /
   *   `ReferenceError` when the key was never set.
   */
  require<T = unknown>(key: string): T {
    if (!this.values.has(key)) {
      throw new ReferenceError(`[snail] context state "${key}" has not been set`);
    }
    return this.values.get(key) as T;
  }

  /**
   * 写入一个值，覆盖旧值。
   *
   * Write a value.
   *
   * @param key 状态键 / The state key.
   * @param value 要写入的值 / The value to store.
   * @returns 容器自身，便于链式调用 / This bag, for chaining.
   */
  set<T = unknown>(key: string, value: T): this {
    this.values.set(key, value);
    return this;
  }

  /**
   * 仅在键当前不存在时写入值。
   *
   * Write a value only when the key is currently absent.
   *
   * @param key 状态键 / The state key.
   * @param value 键不存在时要写入的值 / The value to store when absent.
   * @returns 键最终持有的值（可能是先前已有的旧值）/
   *   The value the key ends up holding (possibly the pre-existing one).
   */
  setDefault<T = unknown>(key: string, value: T): T {
    if (!this.values.has(key)) this.values.set(key, value);
    return this.values.get(key) as T;
  }

  /**
   * 键是否曾被写入过（即使写入的是 `undefined` 也算）。
   *
   * `true` when the key was ever set (even to `undefined`).
   *
   * @param key 状态键 / The state key.
   * @returns 键存在时为 `true` / `true` when the key exists.
   */
  has(key: string): boolean {
    return this.values.has(key);
  }

  /**
   * 删除一个键。
   *
   * Remove a key. Returns whether it existed.
   *
   * @param key 状态键 / The state key.
   * @returns 删除前该键是否存在 / Whether the key existed before the call.
   */
  delete(key: string): boolean {
    return this.values.delete(key);
  }

  /**
   * 清空所有键值。
   *
   * Drop everything.
   */
  clear(): void {
    this.values.clear();
  }

  /**
   * 当前全部键。
   *
   * 返回的是快照数组，后续增删不会影响它。
   *
   * Current keys.
   *
   * @returns 键名数组 / The key names.
   */
  keys(): string[] {
    return [...this.values.keys()];
  }

  /**
   * 浅拷贝快照，便于打日志和断言。
   *
   * Shallow snapshot, handy for logging and assertions.
   *
   * @returns 由当前键值组成的普通对象 / A plain object built from the current entries.
   */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values);
  }
}
