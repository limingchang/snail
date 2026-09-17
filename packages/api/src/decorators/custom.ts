import { SNAIL_CUSTOM_KEY_PREFIX } from "../core/metadata.keys";
import {
  appendMetadata,
  defineMetadata,
  getMetadata,
  getOwnMetadata
} from "../core/metadata";
import { paramResolvers } from "../core/args";
import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type { SnailParamResolver } from "../typings/args";
import { defineParamDescriptor, type ParamDecoratorInput } from "./args";

/**
 * Extension factories for third-party decorators.
 *
 * The library's own decorators are built from these, so anything the core can do
 * a plugin can do too.
 *
 * ## Key namespacing
 *
 * Custom keys are derived from a name you supply:
 *
 * ```ts
 * const TENANT = customMetadataKey("acme/tenant");
 * ```
 *
 * Prefix your name with your package to make collisions impossible. The reserved
 * prefix `@snail-js/api:` belongs to the core.
 */

/** Build a namespaced metadata key for a custom decorator. */
export function customMetadataKey(name: string): symbol {
  if (typeof name !== "string" || name.length === 0) {
    throw new SnailDecoratorError("[snail] customMetadataKey() requires a non-empty name");
  }
  return Symbol.for(`${SNAIL_CUSTOM_KEY_PREFIX}${name}`);
}

/**
 * Create a **parameter** decorator.
 *
 * ```ts
 * // 1. register a source (usually inside a plugin's setup)
 * api.defineParamSource("tenant", ({ ctx, value }) => {
 *   ctx.request.headers.set("x-tenant", String(value));
 * });
 *
 * // 2. expose a decorator built on it
 * export const Tenant = createParamDecorator("tenant");
 *
 * // 3. use it
 * @Get("/orders")
 * orders(@Tenant() tenantId: string) {}
 * ```
 *
 * Pass an explicit `resolver` to skip step 1 and keep everything in one place.
 */
export function createParamDecorator<O = void>(
  source: string,
  resolver?: SnailParamResolver
): (input?: ParamDecoratorInput<O>) => ParameterDecorator {
  return (input) => {
    const effective = resolver ?? paramResolvers[source];
    if (!effective) {
      throw new SnailDecoratorError(
        `[snail] no resolver registered for parameter source "${source}"; ` +
          `register one with createPlugin({ setup: (o, api) => api.defineParamSource("${source}", fn) }) ` +
          `or pass a resolver to createParamDecorator()`
      );
    }

    return (target, propertyKey, index) => {
      defineParamDescriptor(source, effective, input, target, propertyKey, index);
    };
  };
}

/**
 * Create a **class** decorator.
 *
 * ```ts
 * export const Entity = createClassDecorator<string>("acme/entity");
 * @Entity("orders") class OrderApi {}
 * ```
 *
 * @param name metadata key name
 * @param merge when `true` (the default) repeated applications keep every value
 *   in an array instead of overwriting
 */
export function createClassDecorator<T = unknown>(
  name: string,
  merge = true
): (value: T) => ClassDecorator {
  const key = customMetadataKey(name);
  return (value: T) => (target) => {
    if (merge) appendMetadata(key, value, target);
    else defineMetadata(key, value, target);
  };
}

/**
 * Create a **method** decorator.
 *
 * ```ts
 * export const Retry = createMethodDecorator<number>("acme/retry");
 * @Get("/flaky") @Retry(3) flaky() {}
 * ```
 */
export function createMethodDecorator<T = unknown>(
  name: string,
  merge = true
): (value: T) => MethodDecorator {
  const key = customMetadataKey(name);
  return (value: T) => (target, propertyKey) => {
    if (propertyKey === undefined) {
      throw new SnailDecoratorError(
        `[snail] createMethodDecorator("${name}") must decorate a method`
      );
    }
    if (merge) appendMetadata(key, value, target, propertyKey);
    else defineMetadata(key, value, target, propertyKey);
  };
}

/** Read metadata written by a custom method decorator. */
export function getMethodMetadata<T>(name: string, target: unknown, methodName: string): T | undefined {
  return getMetadata<T>(customMetadataKey(name), target, methodName);
}

/** Read metadata written by a custom class decorator. */
export function getClassMetadata<T>(name: string, target: unknown): T | undefined {
  return getMetadata<T>(customMetadataKey(name), target);
}

/** Read metadata written by a custom method decorator on exactly this class. */
export function getOwnMethodMetadata<T>(
  name: string,
  target: unknown,
  methodName: string
): T | undefined {
  return getOwnMetadata<T>(customMetadataKey(name), target, methodName);
}

/**
 * Create a **property** decorator.
 *
 * Property decorators are handy for DTO classes consumed by the transform plugin:
 *
 * ```ts
 * const Alias = createPropertyDecorator<string>("acme/alias");
 * class UserDto { @Alias("user_name") userName!: string }
 * ```
 */
export function createPropertyDecorator<T = unknown>(
  name: string
): (value: T) => PropertyDecorator {
  const key = customMetadataKey(name);
  return (value: T) => (target, propertyKey) => {
    defineMetadata(key, value, target, propertyKey);
  };
}
