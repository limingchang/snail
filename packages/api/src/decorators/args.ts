import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type { SnailParamDescriptor, SnailParamResolver } from "../typings/args";
import { appendMetadata } from "../core/metadata";
import { SNAIL_PARAMS } from "../core/metadata.keys";
import { paramResolvers, sourceLabel } from "../core/args";

/**
 * 参数装饰器。
 *
 * 有意提供两种形态：
 *
 * - `@Query("page") page: number` —— **带键**参数只放入一个值。
 * - `@Query() query: SomeShape` —— **无键**参数展开一个普通对象。
 *
 * 无键参数若不是普通对象就会抛错，并在消息里指明方法名与参数。重写前的代码先
 * 向 `console.error` 打印，然后抛出的一条消息却没有说明是哪个方法出的问题。
 *
 * Parameter decorators.
 *
 * Two shapes, on purpose:
 *
 * - `@Query("page") page: number` — a **keyed** argument places one value.
 * - `@Query() query: SomeShape` — a **key-less** argument spreads a plain object.
 *
 * A key-less argument that is not a plain object throws, naming the method and
 * the parameter. The pre-rewrite code logged to `console.error` and then threw a
 * message that did not say which method was at fault.
 */

/**
 * 参数装饰器接受的参数。
 *
 * A parameter decorator's accepted argument.
 */
export type ParamDecoratorInput<O = void> = string | (O & { key?: string });

/**
 * 把 `"key"`、`{ key, ...options }` 与 `undefined` 统一规范化为
 * `{ key, options }`。
 *
 * Normalise `"key"` / `{ key, ...options }` / `undefined`.
 *
 * @param input 装饰器收到的原始参数 / Raw argument the decorator received
 * @returns 解析出的键与选项 / The parsed out key and options
 */
export function normalizeParamInput<O>(
  input: ParamDecoratorInput<O> | undefined
): { key: string | undefined; options: O | undefined } {
  if (input === undefined) return { key: undefined, options: undefined };

  if (typeof input === "string") {
    return { key: input, options: undefined };
  }

  if (input === null || typeof input !== "object") {
    throw new SnailDecoratorError(t("error.decorator.param.untyped", "Source"));
  }

  const { key, ...options } = input as { key?: string } & Record<string, unknown>;
  return {
    key,
    options: Object.keys(options).length > 0 ? (options as O) : undefined
  };
}

/**
 * 把一个参数描述符写入被装饰的方法。
 *
 * 参数装饰器*先于*方法装饰器执行，并且按索引倒序执行，所以这里只做追加——
 * 描述符列表会在应用实参时按索引排序。
 *
 * Write one parameter descriptor onto the decorated method.
 *
 * Parameter decorators run *before* the method decorator and in reverse index
 * order, so this only ever appends — the descriptor list is sorted by index when
 * the arguments are applied.
 *
 * @param source 已注册的参数源名称 / Registered parameter source name
 * @param resolver 把值写入请求的函数 / Function that writes the value into the request
 * @param input 装饰器收到的原始参数 / Raw argument the decorator received
 * @param target 拥有该方法的原型 / Prototype owning the method
 * @param propertyKey 方法名 / Method name
 * @param index 参数在签名中的下标 / Zero-based parameter index
 */
export function defineParamDescriptor(
  source: string,
  resolver: SnailParamResolver,
  input: ParamDecoratorInput<any> | undefined,
  target: unknown,
  propertyKey: string | symbol | undefined,
  index: number
): void {
  if (propertyKey === undefined) {
    throw new SnailDecoratorError(t("error.decorator.param.context", sourceLabel(source)));
  }

  const { key, options } = normalizeParamInput(input);

  const descriptor: SnailParamDescriptor = {
    source,
    index,
    key,
    options,
    resolve: resolver
  };

  appendMetadata(SNAIL_PARAMS, descriptor, target, propertyKey);
}

/**
 * 为已注册的参数源构建一个参数装饰器。
 *
 * 内置参数源有 `params`、`query`、`data` 和 `header`。插件可以用 `createPlugin`
 * 的 `defineParamSource` 添加自己的参数源。
 *
 * Build a parameter decorator for a registered source.
 *
 * Built-in sources are `params`, `query`, `data` and `header`. A plugin can add
 * its own with `createPlugin`'s `defineParamSource`.
 *
 * @param source 参数源名称 / Parameter source name
 * @returns 接收可选输入并返回 `ParameterDecorator` 的工厂 /
 *   Factory taking optional input and returning a `ParameterDecorator`
 */
export function createParamDecoratorFor<O = void>(
  source: string
): (input?: ParamDecoratorInput<O>) => ParameterDecorator {
  return (input) => {
    if (typeof input === "string" && input.length === 0) {
      throw new SnailDecoratorError(t("error.decorator.param.untyped", sourceLabel(source)));
    }

    return (target, propertyKey, index) => {
      const resolver = paramResolvers[source];
      if (!resolver) {
        throw new SnailDecoratorError(
          `[snail] no resolver registered for parameter source "${source}"`
        );
      }
      defineParamDescriptor(source, resolver, input, target, propertyKey, index);
    };
  };
}

/**
 * 路径占位符。
 *
 * Path placeholders.
 *
 * ```ts
 * @Api("/user")
 * class UserApi {
 *   @Get("/:id/:tab")
 *   get(@Params("id") id: string, @Params("tab") tab: string) {}
 *   // or, equivalently
 *   @Get("/:id/:tab")
 *   get(@Params() params: { id: string; tab: string }) {}
 * }
 * ```
 */
export const Params = createParamDecoratorFor("params");

/**
 * 查询字符串参数。
 *
 * Query string parameters.
 *
 * ```ts
 * @Get("/list")
 * list(@Query("page") page: number, @Query() filters: { q?: string }) {}
 * ```
 */
export const Query = createParamDecoratorFor("query");

/**
 * 请求体。
 *
 * 带键参数会合并进对象形式的请求体。无键的普通对象同样合并，而其他任何值
 * （`FormData`、`Blob`、原始字符串、数组）会直接替换请求体，从而让非 JSON
 * 上传仍然可行。
 *
 * Request body.
 *
 * Keyed arguments merge into an object body. A key-less plain object merges too,
 * while any other value (`FormData`, `Blob`, a raw string, an array) replaces the
 * body outright so non-JSON uploads stay possible.
 */
export const Data = createParamDecoratorFor("data");

/**
 * 单个请求头。
 *
 * 对于*静态*请求头，请改用类/方法级别的 `@Header({ ... })`。
 *
 * A single request header.
 *
 * ```ts
 * @Get("/me")
 * me(@HeaderValue("authorization") token: string) {}
 * ```
 *
 * For *static* headers use the class/method level `@Header({ ... })` instead.
 */
export const HeaderValue = createParamDecoratorFor("header");

/**
 * 遗留别名——重写前的库把 header 参数源暴露为 `Header`。
 *
 * Legacy alias — the pre-rewrite library exposed the header source as `Header`.
 */
export const HeaderParam = HeaderValue;
