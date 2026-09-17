import { defineMetadata, getMetadata } from "../../core/metadata";
import { createPropertyDecorator, customMetadataKey } from "../../decorators/custom";
import { SnailDecoratorError } from "../../error/decorator";
import type { DtoType, PropertyTypeOptions, PropertyTypeSpec } from "./type";

/**
 * Transform decorators.
 *
 * `@Transform(DtoClass)` chooses the class a response is hydrated into;
 * `@PropertyType()` and `@ExposeName()` describe the shape of that class. All
 * three are metadata-only — they never touch a request or a server, so a DTO
 * shared between two api classes cannot leak state from one to the other.
 */

/** Metadata slot written by `@Transform`. */
const TRANSFORM_KEY = customMetadataKey("transform/dto");

/** Metadata slot written by `@PropertyType`. */
export const PROPERTY_TYPE_KEY = customMetadataKey("transform/property-type");

/** Metadata slot written by `@ExposeName`. */
export const EXPOSE_NAME_KEY = customMetadataKey("transform/expose-name");

/**
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
 */
export function ExposeName(jsonKey: string): PropertyDecorator {
  if (typeof jsonKey !== "string" || jsonKey.length === 0) {
    throw new SnailDecoratorError(
      "[snail] @ExposeName() requires a non-empty JSON key"
    );
  }

  return defineExposeName(jsonKey);
}

/** Read the DTO of one method: method first, then the api class. */
export function resolveDto(
  apiClass: unknown,
  methodName: string
): DtoType | undefined {
  return (
    getMetadata<DtoType>(TRANSFORM_KEY, apiClass, methodName) ??
    getMetadata<DtoType>(TRANSFORM_KEY, apiClass)
  );
}
