import { Validate as ValidateRequest } from "./decorators";
import { validatePlugin } from "./plugin";
import type { ZodType } from "zod";
import type { SnailPluginObject } from "../../typings/plugin";
import type { ValidateOptions } from "./type";

/**
 * Zod 校验插件。
 *
 * 在 api 类或方法上声明 `@Validate()` 与 `@ValidateResponse()` 即可把 zod schema 挂到
 * 请求或响应上；插件本身由 `Service.use(Validate())` 安装。
 *
 * Zod validation plugin.
 *
 * ```ts
 * import { Validate, ValidateResponse } from "@snail-js/api/plugins";
 *
 * Service.use(Validate());
 *
 * @Api("/user")
 * class UserApi {
 *   @Post("/")
 *   @Validate(z.object({ name: z.string().min(1) }))
 *   @ValidateResponse(z.object({ id: z.number() }))
 *   create(@Data() body: CreateUser): Promise<User> { return null!; }
 * }
 * ```
 *
 * @packageDocumentation
 */

/**
 * 校验插件工厂；传入 zod schema 时，它就是请求 schema 装饰器。
 *
 * 同一个名字承担两件事，因为规定本插件的简报给两者都取名为 `Validate`：工厂
 * （`Service.use(Validate())`）和装饰器（`@Validate(schema)`）。与其给其中一个改名而
 * 破坏两种调用方式中的一种，不如靠参数区分：zod schema 是带 `safeParse` 的对象，选项
 * 永远没有。`Validate()` 与 `Validate({ request: schema })` 返回插件，
 * `@Validate(schema)` 返回装饰器。
 *
 * The validate plugin factory, and — called with a zod schema — the request
 * schema decorator.
 *
 * Two things share one name because the brief that specifies this plugin gives
 * both of them the name `Validate`: the factory (`Service.use(Validate())`) and
 * the decorator (`@Validate(schema)`). Rather than rename one of them and break
 * one of the two call styles, the two are told apart by their argument: a zod
 * schema is an object with `safeParse`, options never have one. `Validate()` and
 * `Validate({ request: schema })` return the plugin, `@Validate(schema)` returns
 * the decorator.
 */
export function Validate(schema: ZodType): ClassDecorator & MethodDecorator;
export function Validate(options?: ValidateOptions): SnailPluginObject<ValidateOptions>;
export function Validate(
  input?: ZodType | ValidateOptions
): ClassDecorator & MethodDecorator | SnailPluginObject<ValidateOptions> {
  return isZodSchema(input) ? ValidateRequest(input) : validatePlugin(input);
}

/** `true` for a zod schema — the only shape the decorator overload accepts. */
function isZodSchema(value: unknown): value is ZodType {
  return (
    typeof (value as { safeParse?: unknown } | undefined)?.safeParse === "function"
  );
}

export { ValidateResponse } from "./decorators";
export { VALIDATE_PRIORITY } from "./plugin";
export { SnailValidationError } from "./type";
export type { SnailValidationIssue, ValidateOptions } from "./type";
