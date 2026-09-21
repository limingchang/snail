import { SnailError } from "./base";

/**
 * 插件生命周期链被非法驱动时抛出——在一个 hook 里调用两次 `next()`，或在链已经
 * 定局之后再调用 `next()`。
 *
 * 这正是 Koa `compose` 的不变式，它抓住的是一个非常常见的插件 bug：一个 hook
 * 既 `await next()`，又继续落到第二个 `next()`。
 *
 * Thrown when a plugin lifecycle chain is driven illegally — calling `next()`
 * twice from one hook, or calling `next()` after the chain already settled.
 *
 * This is the Koa `compose` invariant, and it catches a very common plugin bug:
 * a hook that both `await next()` *and* falls through into a second `next()`.
 */
export class SnailHookError extends SnailError {
  /**
   * 行为异常的生命周期 hook 名，例如 `"beforeRequest"`。
   *
   * Lifecycle hook that misbehaved, e.g. `"beforeRequest"`.
   */
  readonly hook: string;

  /**
   * 构造一个 hook 错误。
   *
   * 错误码固定为 `SNAIL_HOOK_ERROR`。
   *
   * Build a hook error.
   *
   * The code is always `SNAIL_HOOK_ERROR`.
   *
   * @param hook 行为异常的 hook 名 / Name of the hook that misbehaved
   * @param message 供人阅读的错误信息 / Human-readable error message
   */
  constructor(hook: string, message: string) {
    super(message, { code: "SNAIL_HOOK_ERROR" });
    this.hook = hook;
  }
}
