import { Validate as ValidateRequest } from "./decorators";
import { validatePlugin } from "./plugin";
import type { ZodType } from "zod";
import type { SnailPluginObject } from "../../typings/plugin";
import type { ValidateOptions } from "./type";

/**
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
