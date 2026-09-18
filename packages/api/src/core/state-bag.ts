/**
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

  /** Read a value, optionally falling back when the key is absent. */
  get<T = unknown>(key: string): T | undefined;
  get<T = unknown>(key: string, fallback: T): T;
  get<T = unknown>(key: string, fallback?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : fallback) as T | undefined;
  }

  /** Read a value, throwing when the key is absent. */
  require<T = unknown>(key: string): T {
    if (!this.values.has(key)) {
      throw new ReferenceError(`[snail] context state "${key}" has not been set`);
    }
    return this.values.get(key) as T;
  }

  /** Write a value. */
  set<T = unknown>(key: string, value: T): this {
    this.values.set(key, value);
    return this;
  }

  /** Write a value only when the key is currently absent. */
  setDefault<T = unknown>(key: string, value: T): T {
    if (!this.values.has(key)) this.values.set(key, value);
    return this.values.get(key) as T;
  }

  /** `true` when the key was ever set (even to `undefined`). */
  has(key: string): boolean {
    return this.values.has(key);
  }

  /** Remove a key. Returns whether it existed. */
  delete(key: string): boolean {
    return this.values.delete(key);
  }

  /** Drop everything. */
  clear(): void {
    this.values.clear();
  }

  /** Current keys. */
  keys(): string[] {
    return [...this.values.keys()];
  }

  /** Shallow snapshot, handy for logging and assertions. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values);
  }
}
