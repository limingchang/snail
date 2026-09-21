import { Transform as TransformDto, PropertyType, ExposeName } from "./decorators";
import { transformPlugin } from "./plugin";
import type { SnailPluginObject } from "../../typings/plugin";
import type { DtoType, TransformOptions } from "./type";

/**
 * JSON → 类转换插件。
 *
 * 在方法或 api 类上声明 `@Transform(DtoClass)`，响应载荷就会被水合成该类的实例；而
 * `@ExposeName()` 与 `@PropertyType()` 负责描述这个类的形状。
 *
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
 * 转换插件工厂；传入 DTO 类时，它就是 DTO 装饰器。
 *
 * 同一个名字承担两件事，因为规范给两者都取名为 `Transform`：工厂
 * （`Service.use(Transform())`）和装饰器（`@Transform(UserDto)`）。它们靠参数区分——
 * DTO 是不带选项的构造函数，而选项永远不可调用——所以两种调用方式都不需要改名。
 *
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
export { TRANSFORM_PRIORITY } from "./plugin";
export { hydrate } from "./hydrate";
export type { HydrateOptions } from "./hydrate";
export type {
  DtoType,
  PropertyTypeOptions,
  PropertyTypeSpec,
  TransformOptions
} from "./type";
