import { SnailPluginError } from "../../error";
import type { InterceptorEntry } from "./type";

/**
 * 编程式拦截器的运行时注册表。
 *
 * 装饰器覆盖的是在类定义时就能确定的拦截器。本类覆盖另一半——应用在运行时才决定
 * “从现在起给每个请求签名”——插件内部也用它保存传给 `Interceptor({ request })` 的
 * 服务级条目。
 *
 * 条目保持插入顺序：该顺序*就是*执行顺序，因为拦截器契约刻意采用串行而非基于优先级的方式。
 *
 * Runtime registry of programmatic interceptors.
 *
 * Decorators cover interceptors that are known at class-definition time. This
 * class covers the other half — an application that decides at runtime "from now
 * on, sign every request" — and it is also what the plugin uses internally to
 * hold the server-wide entries passed to `Interceptor({ request })`.
 *
 * Entries keep insertion order: that order *is* the execution order, since the
 * interceptor contract is deliberately sequential rather than priority based.
 */
export class InterceptorManager<T = unknown> {
  private readonly registry = new Map<number, InterceptorEntry<T>>();
  private sequence = 0;

  /**
   * 注册一个条目。返回 {@link eject} 把它移除时需要的 id。
   *
   * Register an entry. Returns the id {@link eject} needs to remove it again.
   *
   * @param entry 至少提供 `onFulfilled` 与 `onRejected` 之一 / An entry providing at
   *   least one of `onFulfilled` and `onRejected`
   * @returns 该条目的 id，永不复用 / The entry id, never reused
   * @throws {SnailPluginError} 条目既没有 `onFulfilled` 也没有 `onRejected` 时 / When
   *   the entry has neither `onFulfilled` nor `onRejected`
   */
  use(entry: InterceptorEntry<T>): number {
    if (!entry || (typeof entry.onFulfilled !== "function" && typeof entry.onRejected !== "function")) {
      throw new SnailPluginError(
        "[snail] InterceptorManager.use() expects an entry with onFulfilled and/or onRejected",
        { pluginName: "interceptor" }
      );
    }

    // Ids are never reused: an `eject` racing a late `use` must not remove the
    // wrong entry, which array-index ids in the pre-rewrite implementation did.
    this.sequence += 1;
    this.registry.set(this.sequence, entry);
    return this.sequence;
  }

  /**
   * 按 {@link use} 返回的 id 移除一个条目。返回它原本是否存在。
   *
   * Remove an entry by the id returned from {@link use}. Returns whether it existed.
   */
  eject(id: number): boolean {
    return this.registry.delete(id);
  }

  /**
   * 丢弃全部条目。
   *
   * Drop every entry.
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * 已注册的条目，按执行顺序排列。
   *
   * Registered entries, in execution order.
   */
  get entries(): InterceptorEntry<T>[] {
    return [...this.registry.values()];
  }

  /**
   * 已注册条目的数量。
   *
   * Number of registered entries.
   */
  get size(): number {
    return this.registry.size;
  }
}
