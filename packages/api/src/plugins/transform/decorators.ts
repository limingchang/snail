import { defineMetadata, getMetadata } from "../../core/metadata";
import { createPropertyDecorator, customMetadataKey } from "../../decorators/custom";
import { SnailDecoratorError } from "../../error/decorator";
import type { DtoType, PropertyTypeOptions, PropertyTypeSpec } from "./type";

/**
 * 转换装饰器。
 *
 * `@Transform(DtoClass)` 选择响应被水合进哪个类；`@PropertyType()` 与 `@ExposeName()`
 * 描述该类的形状。三者都只写元数据——从不触碰请求或服务端，所以被两个 api 类共享的 DTO
 * 不会把状态从一个类泄漏到另一个类。
 *
 * Transform decorators.
 *
 * `@Transform(DtoClass)` chooses the class a response is hydrated into;
 * `@PropertyType()` and `@ExposeName()` describe the shape of that class. All
 * three are metadata-only — they never touch a request or a server, so a DTO
 * shared between two api classes cannot leak state from one to the other.
 */

/** Metadata slot written by `@Transform`. */
const TRANSFORM_KEY = customMetadataKey("transform/dto");

/**
 * 由 `@PropertyType` 写入的元数据槽位。
 *
 * Metadata slot written by `@PropertyType`.
 */
export const PROPERTY_TYPE_KEY = customMetadataKey("transform/property-type");

/**
 * 由 `@ExposeName` 写入的元数据槽位。
 *
 * Metadata slot written by `@ExposeName`.
 */
export const EXPOSE_NAME_KEY = customMetadataKey("transform/expose-name");

/**
 * 选择响应载荷被水合进哪个 DTO。
 *
 * 可用于 api 类，也可用于单个方法；方法上的声明优先，因此一个接口可以返回与同级接口
 * 不同的形状。
 *
 * Choose the DTO a response payload is hydrated into.
 *
 * Applies to an api class and to a single method; the method wins, so one
 * endpoint can answer with a different shape than its siblings.
 *
 * ```ts
 * @Api("/user")
 * @Transform(UserDto)
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<UserDto> { return null!; }
 * }
 * ```
 *
 * @param dto 响应要水合成的 DTO 类 / The DTO class to hydrate responses into.
 * @returns 同时可用作类装饰器与方法装饰器 / A class and method decorator.
 * @throws {SnailDecoratorError} 传入的不是类时抛出 / Thrown when `dto` is not a class.
 */
export function Transform(dto: DtoType): ClassDecorator & MethodDecorator {
  if (typeof dto !== "function") {
    throw new SnailDecoratorError(
      "[snail] @Transform() expects a DTO class, not an instance or a plain object"
    );
  }

  return ((target: unknown, propertyKey?: string | symbol) => {
    defineMetadata(TRANSFORM_KEY, dto, target, propertyKey);
  }) as ClassDecorator & MethodDecorator;
}

const definePropertyType = createPropertyDecorator<PropertyTypeSpec>(
  "transform/property-type"
);

/**
 * 声明某个 DTO 属性的运行时类型。
 *
 * Declare the runtime type of one DTO property.
 *
 * ```ts
 * class OrderDto {
 *   @PropertyType(() => UserDto) user!: UserDto;
 *   @PropertyType(() => ItemDto, { array: true }) items!: ItemDto[];
 *   @PropertyType(() => Date) createdAt!: Date;
 * }
 * ```
 *
 * A property without `@PropertyType` is assigned as-is, so primitives, plain
 * objects and arrays of primitives need no declaration — but they *do* need
 * something that makes the property known, otherwise the unknown-key rule drops
 * them.
 *
 * @param type 惰性类型解析器，例如 `() => ChildDto` / A lazy resolver, e.g. `() => ChildDto`.
 * @param options 该属性的额外选项 / Extra options for this property.
 * @returns 属性装饰器 / A property decorator.
 * @throws {SnailDecoratorError} `type` 不是函数时抛出 / Thrown when `type` is not a function.
 */
export function PropertyType(
  type: () => unknown,
  options?: PropertyTypeOptions
): PropertyDecorator {
  if (typeof type !== "function") {
    throw new SnailDecoratorError(
      "[snail] @PropertyType() expects a lazy type resolver, e.g. @PropertyType(() => ChildDto)"
    );
  }

  return definePropertyType(options ? { type, options } : { type });
}

const defineExposeName = createPropertyDecorator<string>("transform/expose-name");

/**
 * 从一个名字不同的 JSON 键上读取属性。
 *
 * Read a property from a differently-named JSON key.
 *
 * ```ts
 * class UserDto {
 *   @ExposeName("user_name") userName!: string;
 * }
 * // { "user_name": "ada" } → new UserDto().userName === "ada"
 * ```
 *
 * Excluding a key needs no decorator: undeclared JSON keys are already dropped.
 *
 * @param jsonKey 原始 JSON 中的键名 / The key in the raw JSON.
 * @returns 属性装饰器 / A property decorator.
 * @throws {SnailDecoratorError} 键为空或不是字符串时抛出 / Thrown when the key is not a
 *   non-empty string.
 */
export function ExposeName(jsonKey: string): PropertyDecorator {
  if (typeof jsonKey !== "string" || jsonKey.length === 0) {
    throw new SnailDecoratorError(
      "[snail] @ExposeName() requires a non-empty JSON key"
    );
  }

  return defineExposeName(jsonKey);
}

/**
 * 读取某个方法的 DTO：先看方法，再看 api 类。
 *
 * Read the DTO of one method: method first, then the api class.
 *
 * @param apiClass api 类 / The api class.
 * @param methodName 方法名 / The method name.
 * @returns 解析出的 DTO；都没有声明时为 `undefined` / The resolved DTO, or `undefined`.
 */
export function resolveDto(
  apiClass: unknown,
  methodName: string
): DtoType | undefined {
  return (
    getMetadata<DtoType>(TRANSFORM_KEY, apiClass, methodName) ??
    getMetadata<DtoType>(TRANSFORM_KEY, apiClass)
  );
}
