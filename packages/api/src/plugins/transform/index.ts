import { Transform as TransformDto, PropertyType, ExposeName } from "./decorators";
import { transformPlugin } from "./plugin";
import type { SnailPluginObject } from "../../typings/plugin";
import type { DtoType, TransformOptions } from "./type";

/**
 * JSON → class transform plugin.
 *
 * ```ts
 * import { Transform, PropertyType, ExposeName } from "@snail-js/api/plugins";
 *
 * Service.use(Transform());
 *
 * class UserDto {
 *   @ExposeName("user_name") userName!: string;
 *   @PropertyType(() => Date) createdAt!: Date;
 * }
 *
 * @Api("/user")
 * @Transform(UserDto)
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<UserDto> { return null!; }
 * }
 * ```
 *
 * @packageDocumentation
 */

/**
 * The transform plugin factory, and — called with a DTO class — the DTO decorator.
 *
 * Two things share one name because the specification gives both of them the name
 * `Transform`: the factory (`Service.use(Transform())`) and the decorator
 * (`@Transform(UserDto)`). They are told apart by their argument — a DTO is a
 * constructor function with no options of its own, options are never callable —
 * so neither call style has to be renamed.
 */
export function Transform(dto: DtoType): ClassDecorator & MethodDecorator;
export function Transform(options?: TransformOptions): SnailPluginObject<TransformOptions>;
export function Transform(
  input?: DtoType | TransformOptions
): ClassDecorator & MethodDecorator | SnailPluginObject<TransformOptions> {
  return typeof input === "function" ? TransformDto(input) : transformPlugin(input);
}

export { ExposeName, PropertyType } from "./decorators";
export { hydrate } from "./hydrate";
export type { HydrateOptions } from "./hydrate";
export type {
  DtoType,
  PropertyTypeOptions,
  PropertyTypeSpec,
  TransformOptions
} from "./type";
