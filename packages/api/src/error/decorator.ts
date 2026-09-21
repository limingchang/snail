import { SnailError } from "./base";

/**
 * 装饰器使用不当时抛出——同一个方法上出现两个请求方法装饰器、参数装饰器用在
 * 构造函数上，等等。
 *
 * 这类错误属于程序员错误，总是尽早暴露：早到被装饰的类被求值时。
 *
 * Thrown when a decorator is applied incorrectly — two request-method decorators
 * on one method, a parameter decorator on a constructor, and so on.
 *
 * These are programmer errors and always surface eagerly, as early as the
 * decorated class is evaluated.
 */
export class SnailDecoratorError extends SnailError {
  /**
   * 构造一个装饰器错误。
   *
   * 错误码固定为 `SNAIL_DECORATOR_ERROR`。
   *
   * Build a decorator error.
   *
   * The code is always `SNAIL_DECORATOR_ERROR`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 可选的底层原因 / Optional underlying cause
   */
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_DECORATOR_ERROR", cause: options.cause });
  }
}
