import { defineMetadata, getMetadata } from "../../core/metadata";
import { customMetadataKey } from "../../decorators/custom";
import { SnailDecoratorError } from "../../error/decorator";
import type { ZodType } from "zod";

/**
 * `@Validate(schema)` / `@ValidateResponse(schema)`——给请求或响应体挂上一个 zod schema。
 *
 * 两者都可用于 api 类与单个方法。类级 schema 作用于该类的每个方法，方法级 schema 覆盖
 * 它——这是唯一一种既能让单个接口偏离、又不必在每个同级方法上重述类级默认值的顺序。
 *
 * `@Validate(schema)` / `@ValidateResponse(schema)` — attach a zod schema to a
 * request or to a response body.
 *
 * Both work on an api class and on a single method. A class-level schema applies
 * to every method of the class; a method-level one overrides it, which is the only
 * ordering that lets one endpoint deviate without redeclaring the class default on
 * every sibling.
 */

/** Metadata slot written by `@Validate`. */
const REQUEST_SCHEMA_KEY = customMetadataKey("validate/request");

/** Metadata slot written by `@ValidateResponse`. */
const RESPONSE_SCHEMA_KEY = customMetadataKey("validate/response");

/**
 * Build a class/method decorator that stores one schema.
 *
 * The value is checked at decoration time, not at request time: a typo like
 * `@Validate({})` would otherwise stay silent until a request ran, and then read
 * as "the payload is malformed" instead of "the decorator is wrong".
 */
function schemaDecorator(
  key: symbol,
  label: string
): (schema: ZodType) => ClassDecorator & MethodDecorator {
  return (schema: ZodType) => {
    if (!schema || typeof schema.safeParse !== "function") {
      throw new SnailDecoratorError(
        `[snail] @${label}() expects a zod schema with a safeParse() method`
      );
    }

    return ((target: unknown, propertyKey?: string | symbol) => {
      defineMetadata(key, schema, target, propertyKey);
    }) as ClassDecorator & MethodDecorator;
  };
}

const defineRequestSchema = schemaDecorator(REQUEST_SCHEMA_KEY, "Validate");
const defineResponseSchema = schemaDecorator(RESPONSE_SCHEMA_KEY, "ValidateResponse");

/**
 * 用 zod schema 校验即将发出的请求体（或 query）。
 *
 * Validate the outgoing request body (or query) against a zod schema.
 *
 * ```ts
 * @Post("/")
 * @Validate(z.object({ name: z.string().min(1) }))
 * create(@Data() body: CreateUser): Promise<User> { return null!; }
 * ```
 *
 * @param schema 用于校验请求载荷的 zod schema / The zod schema the request payload is
 *   checked against.
 * @returns 同时可用作类装饰器与方法装饰器 / A class and method decorator.
 * @throws {SnailDecoratorError} 传入的对象没有 `safeParse()` 时抛出 / Thrown when the value
 *   has no `safeParse()`.
 */
export function Validate(schema: ZodType): ClassDecorator & MethodDecorator {
  return defineRequestSchema(schema);
}

/**
 * 用 zod schema 校验响应载荷。
 *
 * 响应校验只会发出警告：发什么由后端而不是调用方决定，因为一个字段不符合预期就丢掉可用
 * 的载荷，会把一次无害的后端漂移变成坏掉的页面。
 *
 * Validate the response payload against a zod schema.
 *
 * Response validation only ever warns: the backend, not the caller, decides what
 * it sends, and throwing away a usable payload because one field is unexpected
 * turns a cosmetic backend drift into a broken page.
 *
 * @param schema 用于校验响应载荷的 zod schema / The zod schema the response payload is
 *   checked against.
 * @returns 同时可用作类装饰器与方法装饰器 / A class and method decorator.
 * @throws {SnailDecoratorError} 传入的对象没有 `safeParse()` 时抛出 / Thrown when the value
 *   has no `safeParse()`.
 */
export function ValidateResponse(schema: ZodType): ClassDecorator & MethodDecorator {
  return defineResponseSchema(schema);
}

/**
 * 读取某个方法的请求 schema：先看方法，再看 api 类。
 *
 * Read the request schema of one method: method first, then the api class.
 *
 * @param apiClass api 类 / The api class.
 * @param methodName 方法名 / The method name.
 * @returns 解析出的 schema，未声明时为 `undefined` / The resolved schema, or `undefined`.
 */
export function resolveRequestSchema(
  apiClass: unknown,
  methodName: string
): ZodType | undefined {
  return (
    getMetadata<ZodType>(REQUEST_SCHEMA_KEY, apiClass, methodName) ??
    getMetadata<ZodType>(REQUEST_SCHEMA_KEY, apiClass)
  );
}

/**
 * 读取某个方法的响应 schema：先看方法，再看 api 类。
 *
 * Read the response schema of one method: method first, then the api class.
 *
 * @param apiClass api 类 / The api class.
 * @param methodName 方法名 / The method name.
 * @returns 解析出的 schema，未声明时为 `undefined` / The resolved schema, or `undefined`.
 */
export function resolveResponseSchema(
  apiClass: unknown,
  methodName: string
): ZodType | undefined {
  return (
    getMetadata<ZodType>(RESPONSE_SCHEMA_KEY, apiClass, methodName) ??
    getMetadata<ZodType>(RESPONSE_SCHEMA_KEY, apiClass)
  );
}
