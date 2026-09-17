import { SnailError } from "./base";

/**
 * Thrown when a decorator is applied incorrectly — two request-method decorators
 * on one method, a parameter decorator on a constructor, and so on.
 *
 * These are programmer errors and always surface eagerly, as early as the
 * decorated class is evaluated.
 */
export class SnailDecoratorError extends SnailError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_DECORATOR_ERROR", cause: options.cause });
  }
}
