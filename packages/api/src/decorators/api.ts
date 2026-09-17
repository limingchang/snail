import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type { SnailApiOptions } from "../typings/api";
import { defineMetadata, getOwnMetadata } from "../core/metadata";
import { SNAIL_API_OPTIONS } from "../core/metadata.keys";

/**
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
