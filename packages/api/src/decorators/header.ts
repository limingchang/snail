import { mergeMetadata } from "../core/metadata";
import { SNAIL_HEADERS } from "../core/metadata.keys";

/**
 * 静态请求头。
 *
 * 既可用于 api 类，也可用于单个方法；两个层级会合并，方法级优先（示例见下）。
 *
 * 若请求头的值来自某个参数，请改用 `@HeaderValue()` 参数装饰器。
 *
 * Static request headers.
 *
 * Works on an api class and on a single method; the two levels merge, with the
 * method winning:
 *
 * ```ts
 * @Api("/user")
 * @Header({ "x-client": "web" })
 * class UserApi {
 *   @Get("/secret")
 *   @Header({ "x-scope": "admin" })
 *   secret() {}
 * }
 * // → x-client: web, x-scope: admin
 * ```
 *
 * For a header whose value comes from an argument, use the `@HeaderValue()`
 * parameter decorator.
 *
 * @param record 要合并进去的静态请求头 / Static headers to merge in
 */
export function Header(record: Record<string, unknown>): ClassDecorator & MethodDecorator {
  return ((target: any, propertyKey?: string | symbol) => {
    mergeMetadata(SNAIL_HEADERS, record, target, propertyKey);
  }) as ClassDecorator & MethodDecorator;
}
