import { SnailError } from "./base";

/**
 * Thrown when a plugin lifecycle chain is driven illegally — calling `next()`
 * twice from one hook, or calling `next()` after the chain already settled.
 *
 * This is the Koa `compose` invariant, and it catches a very common plugin bug:
 * a hook that both `await next()` *and* falls through into a second `next()`.
 */
export class SnailHookError extends SnailError {
  /** Lifecycle hook that misbehaved, e.g. `"beforeRequest"`. */
  readonly hook: string;

  constructor(hook: string, message: string) {
    super(message, { code: "SNAIL_HOOK_ERROR" });
    this.hook = hook;
  }
}
