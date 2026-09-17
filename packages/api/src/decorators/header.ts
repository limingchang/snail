import { mergeMetadata } from "../core/metadata";
import { SNAIL_HEADERS } from "../core/metadata.keys";

/**
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
 */
export function Header(record: Record<string, unknown>): ClassDecorator & MethodDecorator {
  return ((target: any, propertyKey?: string | symbol) => {
    mergeMetadata(SNAIL_HEADERS, record, target, propertyKey);
  }) as ClassDecorator & MethodDecorator;
}
