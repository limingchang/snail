import { defineMetadata, getMetadata } from "../../core/metadata";
import { customMetadataKey } from "../../decorators/custom";
import { SnailDecoratorError } from "../../error/decorator";
import type { ZodType } from "zod";

/**
 * `@Validate(schema)` / `@ValidateResponse(schema)` — attach a zod schema to a
 * request or to a response body.
 *
 * Both work on an api class and on a single method. A class-level schema applies
 * to every method of the class; a method-level one overrides it, which is the only
 * ordering that lets one endpoint deviate without redeclaring the class default on
 * every sibling.
 */

/** Metadata slot written by `@Validate`. */
const REQUEST_SCHEMA_KEY = customMetadataKey("validate/request");

/** Metadata slot written by `@ValidateResponse`. */
const RESPONSE_SCHEMA_KEY = customMetadataKey("validate/response");

/**
 * Build a class/method decorator that stores one schema.
 *
 * The value is checked at decoration time, not at request time: a typo like
 * `@Validate({})` would otherwise stay silent until a request ran, and then read
 * as "the payload is malformed" instead of "the decorator is wrong".
 */
function schemaDecorator(
  key: symbol,
  label: string
): (schema: ZodType) => ClassDecorator & MethodDecorator {
  return (schema: ZodType) => {
    if (!schema || typeof schema.safeParse !== "function") {
      throw new SnailDecoratorError(
        `[snail] @${label}() expects a zod schema with a safeParse() method`
      );
    }

    return ((target: unknown, propertyKey?: string | symbol) => {
      defineMetadata(key, schema, target, propertyKey);
    }) as ClassDecorator & MethodDecorator;
  };
}

const defineRequestSchema = schemaDecorator(REQUEST_SCHEMA_KEY, "Validate");
const defineResponseSchema = schemaDecorator(RESPONSE_SCHEMA_KEY, "ValidateResponse");

/**
 * Validate the outgoing request body (or query) against a zod schema.
 *
 * ```ts
 * @Post("/")
 * @Validate(z.object({ name: z.string().min(1) }))
 * create(@Data() body: CreateUser): Promise<User> { return null!; }
 * ```
 */
export function Validate(schema: ZodType): ClassDecorator & MethodDecorator {
  return defineRequestSchema(schema);
}

/**
 * Validate the response payload against a zod schema.
 *
 * Response validation only ever warns: the backend, not the caller, decides what
 * it sends, and throwing away a usable payload because one field is unexpected
 * turns a cosmetic backend drift into a broken page.
 */
export function ValidateResponse(schema: ZodType): ClassDecorator & MethodDecorator {
  return defineResponseSchema(schema);
}

/** Read the request schema of one method: method first, then the api class. */
export function resolveRequestSchema(
  apiClass: unknown,
  methodName: string
): ZodType | undefined {
  return (
    getMetadata<ZodType>(REQUEST_SCHEMA_KEY, apiClass, methodName) ??
    getMetadata<ZodType>(REQUEST_SCHEMA_KEY, apiClass)
  );
}

/** Read the response schema of one method: method first, then the api class. */
export function resolveResponseSchema(
  apiClass: unknown,
  methodName: string
): ZodType | undefined {
  return (
    getMetadata<ZodType>(RESPONSE_SCHEMA_KEY, apiClass, methodName) ??
    getMetadata<ZodType>(RESPONSE_SCHEMA_KEY, apiClass)
  );
}
