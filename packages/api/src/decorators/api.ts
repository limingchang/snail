import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type { SnailApiOptions } from "../typings/api";
import { defineMetadata, getOwnMetadata } from "../core/metadata";
import { SNAIL_API_OPTIONS } from "../core/metadata.keys";

/**
 * 声明一个 api 类。
 *
 * `url` 是**前缀**：它会依次与 server 的 `baseURL`、方法路径拼接。
 *
 * 即使没有前缀也应始终声明 `@Api()`。它为这个 api 提供名称，供日志、缓存命名
 * 空间和 `@HitSource` 定位使用；缺少它时这些会回退到类名。库在运行时**不**强制
 * 要求它——被继承的 api 类是合法的，基类也可以携带该装饰器——因此漏写
 * `@Api()` 只会静默降级，而不会抛错。
 *
 * Declare an api class.
 *
 * ```ts
 * @Api("/user")
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<User> { return null!; }
 * }
 * ```
 *
 * The url is a *prefix*: it is joined with the server `baseURL` and the method
 * path, in that order.
 *
 * Always declare `@Api()` even when there is no prefix. It is what names the api
 * for logging, cache namespacing and `@HitSource` targets; without it those fall
 * back to the class name. The library does **not** enforce it at runtime —
 * inherited api classes are legitimate and a base class may carry the decorator —
 * so a missing `@Api()` silently degrades rather than throwing.
 */
export function Api(url?: string): ClassDecorator;
export function Api(options: SnailApiOptions): ClassDecorator;
export function Api(urlOrOptions?: string | SnailApiOptions): ClassDecorator {
  const options: SnailApiOptions =
    typeof urlOrOptions === "string" || urlOrOptions === undefined
      ? { url: urlOrOptions ?? "" }
      : urlOrOptions;

  if (options.url !== undefined && typeof options.url !== "string") {
    throw new SnailDecoratorError(t("error.options.api.url"));
  }

  return (target) => {
    if (typeof target !== "function") {
      throw new SnailDecoratorError(t("error.decorator.class.target", "Api"));
    }

    const previous = getOwnMetadata<SnailApiOptions>(SNAIL_API_OPTIONS, target);

    defineMetadata(
      SNAIL_API_OPTIONS,
      previous ? { ...previous, ...options } : { ...options },
      target
    );
  };
}
