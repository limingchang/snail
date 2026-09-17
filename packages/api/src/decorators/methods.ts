import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type {
  SnailMethodDecoratorOptions,
  SnailMethodType
} from "../typings/api";
import { defineMetadata, getOwnMetadata } from "../core/metadata";
import { SNAIL_REQUEST_METHOD } from "../core/metadata.keys";

/** Options accepted by every request-method decorator. */
export interface RequestMethodOptions extends SnailMethodDecoratorOptions {}

/**
 * Build one request-method decorator.
 *
 * Decorated methods are never executed: `createApi` replaces them with a factory
 * that returns a request object. Their body exists purely to declare the argument
 * and return types, so `return null!` (or nothing at all) is the convention.
 *
 * Applying two request-method decorators to one method is an error and throws
 * while the class is being defined, which is the earliest possible moment.
 */
function createRequestMethod(method: SnailMethodType) {
  return (
    path = "",
    options: RequestMethodOptions = {}
  ): MethodDecorator => {
    if (typeof path !== "string") {
      throw new SnailDecoratorError(
        `@${method} expects its first argument to be a string path`
      );
    }

    return (target, propertyKey) => {
      if (propertyKey === undefined) {
        throw new SnailDecoratorError(
          `@${method} must decorate a method, not a class or a property`
        );
      }

      const existing = getOwnMetadata<{ method: SnailMethodType }>(
        SNAIL_REQUEST_METHOD,
        target,
        propertyKey
      );

      if (existing) {
        throw new SnailDecoratorError(
          t("error.decorator.method.duplicate", String(propertyKey))
        );
      }

      defineMetadata(
        SNAIL_REQUEST_METHOD,
        { ...options, method, url: path },
        target,
        propertyKey
      );
    };
  };
}

/** `GET` request. */
export const Get = createRequestMethod("GET");
/** `POST` request. */
export const Post = createRequestMethod("POST");
/** `PUT` request. */
export const Put = createRequestMethod("PUT");
/** `DELETE` request. */
export const Delete = createRequestMethod("DELETE");
/** `PATCH` request. */
export const Patch = createRequestMethod("PATCH");
/** `HEAD` request. */
export const Head = createRequestMethod("HEAD");
/** `OPTIONS` request. */
export const Options = createRequestMethod("OPTIONS");

/** Alias kept for symmetry with `axios.request` style naming. */
export const Request = createRequestMethod;
