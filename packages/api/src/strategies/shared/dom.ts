/**
 * 受保护地访问策略所监听的浏览器全局对象。
 *
 * 这一层的测试运行在 Node 中，那里 `window` 和 `document` 完全不存在。惰性读取它们——
 * 在函数内部，绝不在模块顶层——正是同一个模块能在两种环境中被导入的原因，也是
 * `useAutoRequest` 能在服务端渲染中创建而不抛错的唯一原因。
 *
 * Guarded access to the browser globals a strategy listens to.
 *
 * The tests for this layer run in Node, where `window` and `document` do not
 * exist at all. Reading them lazily — inside a function, never at module scope —
 * is what lets the same module be imported in both environments, and it is the
 * only reason `useAutoRequest` can be created in a server-side render without
 * throwing.
 */

/**
 * 这一层用到的 `EventTarget` 子集。
 *
 * 这里刻意使用 `(...args: any[]) => void` 而不是 `() => void`：`window` 自身的
 * `addEventListener` 期望 `EventListener`，零参数的监听器类型会让真实对象在结构上
 * 不兼容。
 *
 * The subset of `EventTarget` this layer uses.
 *
 * `(...args: any[]) => void` rather than `() => void` on purpose: `window`'s own
 * `addEventListener` expects an `EventListener`, and a zero-argument listener type
 * would make the real object structurally incompatible.
 */
export interface DomEventTargetLike {
  /**
   * 注册监听器。参数与 `EventTarget.addEventListener` 一致，`options` 原样透传。
   *
   * Register a listener. Arguments mirror `EventTarget.addEventListener`;
   * `options` is passed through untouched.
   */
  addEventListener(type: string, listener: (...args: any[]) => void, options?: unknown): void;
  /**
   * 移除此前用同一 `type` 与 `listener` 注册的监听器。
   *
   * Remove a listener registered earlier with the same `type` and `listener`.
   */
  removeEventListener(type: string, listener: (...args: any[]) => void, options?: unknown): void;
}

/**
 * 全局 `window`；在 DOM 环境之外为 `undefined`。
 *
 * The global `window`, or `undefined` outside a DOM environment.
 */
export function getWindowTarget(): DomEventTargetLike | undefined {
  if (typeof window === "undefined") return undefined;
  return window as unknown as DomEventTargetLike;
}

/**
 * 全局 `document`；在 DOM 环境之外为 `undefined`。
 *
 * The global `document`, or `undefined` outside a DOM environment.
 */
export function getDocumentTarget(): DomEventTargetLike | undefined {
  if (typeof document === "undefined") return undefined;
  return document as unknown as DomEventTargetLike;
}

/**
 * 页面处于屏幕上时返回 `true`。
 *
 * Node 中返回 `true`，这样由 `visibilitychange` 驱动的策略在脚本里依然可用——那里
 * 没有会被错过的隐藏页面。
 *
 * `true` when the page is on screen.
 *
 * Node reports `true` so a `visibilitychange`-driven strategy still works in a
 * script; there is no hidden page to miss.
 */
export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * 可以作为一个整体移除的一组已注册监听器。
 *
 * A collection of registered listeners that can be removed as one unit.
 */
export interface ListenerScope {
  /**
   * 注册 `listener`。目标不存在时返回 `false`——即 Node 的情形——调用方据此可以区分
   * 「未附加」与「已附加」。
   *
   * Register `listener`. Returns `false` when the target does not exist — the
   * Node case — so the caller can tell "not attached" from "attached".
   */
  add(
    target: DomEventTargetLike | undefined,
    type: string,
    listener: (...args: any[]) => void
  ): boolean;

  /**
   * 移除通过本 scope 注册的所有监听器。重复调用是安全的。
   *
   * Remove every listener registered through this scope. Safe to call twice.
   */
  removeAll(): void;

  /**
   * 当前已附加的监听器数量。
   *
   * Number of listeners currently attached.
   */
  readonly size: number;
}

/**
 * 创建一个监听器记账 scope。
 *
 * `stop()` 与 `dispose()` 会从事件处理器、`finally` 块中调用，有时还会被调用两次；
 * 如果没有一张集中的登记表，就极易用与添加时*不同*的函数引用去移除监听器，从而静默
 * 泄漏并让组件无法被回收。
 *
 * Create a listener bookkeeping scope.
 *
 * `stop()` and `dispose()` are called from event handlers, from `finally` blocks
 * and sometimes twice; without one central registry it is far too easy to remove a
 * listener with a *different* function reference than the one added, which leaks
 * silently and keeps the component from being collected.
 *
 * @returns 新建的监听器 scope / The new listener scope.
 */
export function createListenerScope(): ListenerScope {
  const registered: Array<{
    target: DomEventTargetLike;
    type: string;
    listener: (...args: any[]) => void;
  }> = [];

  return {
    get size(): number {
      return registered.length;
    },

    add(
      target: DomEventTargetLike | undefined,
      type: string,
      listener: (...args: any[]) => void
    ): boolean {
      if (!target) return false;
      target.addEventListener(type, listener);
      registered.push({ target, type, listener });
      return true;
    },

    removeAll(): void {
      while (registered.length > 0) {
        const entry = registered.pop()!;
        entry.target.removeEventListener(entry.type, entry.listener);
      }
    }
  };
}
