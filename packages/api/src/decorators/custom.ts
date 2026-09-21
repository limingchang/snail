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
 * 面向第三方装饰器的扩展工厂。
 *
 * 库自身的装饰器就是由这些工厂构建的，所以核心能做的事，插件同样能做到。
 *
 * ## 键的命名空间
 *
 * 自定义键由你提供的名称派生（见下方示例）。用你的包名作为名称前缀即可彻底避免
 * 冲突；保留前缀 `@snail-js/api:` 归核心所有。
 *
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

/**
 * 为自定义装饰器构建一个带命名空间的元数据键。
 *
 * 键由 `Symbol.for` 创建，因此同一个名称在任何模块实例中都是同一个键。
 *
 * Build a namespaced metadata key for a custom decorator.
 *
 * @param name 自定义键名称，建议加上包名前缀 / Custom key name; prefix it with your package name
 * @returns 全局共享的 `symbol` / A globally shared `symbol`
 * @throws `name` 为空或不是字符串时抛出 `SnailDecoratorError` /
 *   `SnailDecoratorError` when `name` is empty or not a string
 */
export function customMetadataKey(name: string): symbol {
  if (typeof name !== "string" || name.length === 0) {
    throw new SnailDecoratorError("[snail] customMetadataKey() requires a non-empty name");
  }
  return Symbol.for(`${SNAIL_CUSTOM_KEY_PREFIX}${name}`);
}

/**
 * 创建一个**参数**装饰器。
 *
 * 显式传入 `resolver` 即可跳过第 1 步，把一切集中在一处。
 *
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
 *
 * @param source 参数源名称；未传 `resolver` 时必须已注册 /
 *   Parameter source name; must already be registered when `resolver` is omitted
 * @param resolver 可选解析函数，直接替代已注册的参数源 /
 *   Optional resolver used instead of the registered source
 * @returns 接收可选输入并返回 `ParameterDecorator` 的工厂 /
 *   Factory taking optional input and returning a `ParameterDecorator`
 * @throws 参数源既未注册也未提供 `resolver` 时抛出 `SnailDecoratorError` /
 *   `SnailDecoratorError` when the source is neither registered nor given a `resolver`
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
 * 创建一个**类**装饰器。
 *
 * `name` 是元数据键名称；`merge` 为 `true`（默认）时，重复应用会把每个值都保留在
 * 数组中，而不是互相覆盖。
 *
 * Create a **class** decorator.
 *
 * ```ts
 * export const Entity = createClassDecorator<string>("acme/entity");
 * @Entity("orders") class OrderApi {}
 * ```
 *
 * @param name 元数据键名称 / metadata key name
 * @param merge 为 `true`（默认）时重复应用会把每个值保留在数组中而不是覆盖 /
 *   when `true` (the default) repeated applications keep every value
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
 * 创建一个**方法**装饰器。
 *
 * `name` 是元数据键名称；`merge` 为 `true`（默认）时追加值，为 `false` 时覆盖。
 * 它只接受方法：装饰类或属性会抛错。
 *
 * Create a **method** decorator.
 *
 * ```ts
 * export const Retry = createMethodDecorator<number>("acme/retry");
 * @Get("/flaky") @Retry(3) flaky() {}
 * ```
 *
 * @param name 元数据键名称 / Metadata key name
 * @param merge 为 `true`（默认）时追加值，为 `false` 时覆盖 /
 *   Append values when `true` (the default), overwrite when `false`
 * @returns 接收一个值并返回 `MethodDecorator` 的工厂 /
 *   Factory taking one value and returning a `MethodDecorator`
 * @throws 未作用于方法时抛出 `SnailDecoratorError` /
 *   `SnailDecoratorError` when it does not decorate a method
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

/**
 * 读取由自定义方法装饰器写入的元数据。
 *
 * Read metadata written by a custom method decorator.
 *
 * @param name 元数据键名称 / Metadata key name
 * @param target 类或实例 / Class or instance
 * @param methodName 方法名 / Method name
 * @returns 记录的值，未记录时为 `undefined` / The recorded value, or `undefined`
 */
export function getMethodMetadata<T>(name: string, target: unknown, methodName: string): T | undefined {
  return getMetadata<T>(customMetadataKey(name), target, methodName);
}

/**
 * 读取由自定义类装饰器写入的元数据。
 *
 * Read metadata written by a custom class decorator.
 *
 * @param name 元数据键名称 / Metadata key name
 * @param target 类或实例 / Class or instance
 * @returns 记录的值，未记录时为 `undefined` / The recorded value, or `undefined`
 */
export function getClassMetadata<T>(name: string, target: unknown): T | undefined {
  return getMetadata<T>(customMetadataKey(name), target);
}

/**
 * 读取恰好写在本类上的、由自定义方法装饰器写入的元数据（不含继承）。
 *
 * Read metadata written by a custom method decorator on exactly this class.
 *
 * @param name 元数据键名称 / Metadata key name
 * @param target 类或实例 / Class or instance
 * @param methodName 方法名 / Method name
 * @returns 记录的值，未记录时为 `undefined` / The recorded value, or `undefined`
 */
export function getOwnMethodMetadata<T>(
  name: string,
  target: unknown,
  methodName: string
): T | undefined {
  return getOwnMetadata<T>(customMetadataKey(name), target, methodName);
}

/**
 * 创建一个**属性**装饰器。
 *
 * 属性装饰器很适合 transform 插件消费的 DTO 类：
 *
 * Create a **property** decorator.
 *
 * Property decorators are handy for DTO classes consumed by the transform plugin:
 *
 * ```ts
 * const Alias = createPropertyDecorator<string>("acme/alias");
 * class UserDto { @Alias("user_name") userName!: string }
 * ```
 *
 * @param name 元数据键名称 / Metadata key name
 * @returns 接收一个值并返回 `PropertyDecorator` 的工厂 /
 *   Factory taking one value and returning a `PropertyDecorator`
 */
export function createPropertyDecorator<T = unknown>(
  name: string
): (value: T) => PropertyDecorator {
  const key = customMetadataKey(name);
  return (value: T) => (target, propertyKey) => {
    defineMetadata(key, value, target, propertyKey);
  };
}
