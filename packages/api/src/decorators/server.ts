import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type { SnailServerOptions } from "../typings/server";
import { defineMetadata, getOwnMetadata } from "../core/metadata";
import { SNAIL_SERVER_OPTIONS } from "../core/metadata.keys";

/**
 * 声明一个 server 类的选项。
 *
 * 简写形式等价于 `{ baseURL }`（示例见下）。
 *
 * 重复应用 `@Server` 会合并选项，且**最外层装饰器胜出**——装饰器自下而上求值，
 * 因此写在离类最远处的那个最后应用（示例见下）。
 *
 * Declare the options of a server class.
 *
 * ```ts
 * @Server({ baseURL: "/api", timeout: 5000 })
 * class BackEnd extends SnailServer {}
 * ```
 *
 * The shorthand form is equivalent to `{ baseURL }`:
 *
 * ```ts
 * @Server("/api")
 * class BackEnd extends SnailServer {}
 * ```
 *
 * Applying `@Server` twice merges the options, and the **outermost decorator
 * wins** — decorators are evaluated bottom-up, so the one written furthest from
 * the class is applied last:
 *
 * ```ts
 * @Server({ timeout: 30000 })   // applied last → this timeout wins
 * @Server({ baseURL: "/api" })
 * class BackEnd extends SnailServer {}
 * // → { baseURL: "/api", timeout: 30000 }
 * ```
 */
export function Server(baseURL: string): ClassDecorator;
export function Server(options: SnailServerOptions): ClassDecorator;
export function Server(baseURLOrOptions: string | SnailServerOptions): ClassDecorator {
  const options: SnailServerOptions =
    typeof baseURLOrOptions === "string"
      ? { baseURL: baseURLOrOptions }
      : baseURLOrOptions;

  return (target) => {
    if (typeof target !== "function") {
      throw new SnailDecoratorError(t("error.decorator.class.target", "Server"));
    }

    const previous = getOwnMetadata<SnailServerOptions>(
      SNAIL_SERVER_OPTIONS,
      target
    );

    defineMetadata(
      SNAIL_SERVER_OPTIONS,
      previous ? { ...previous, ...options } : { ...options },
      target
    );
  };
}
