import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type { SnailParamDescriptor, SnailParamResolver } from "../typings/args";
import { appendMetadata } from "../core/metadata";
import { SNAIL_PARAMS } from "../core/metadata.keys";
import { paramResolvers, sourceLabel } from "../core/args";

/**
 * Parameter decorators.
 *
 * Two shapes, on purpose:
 *
 * - `@Query("page") page: number` — a **keyed** argument places one value.
 * - `@Query() query: SomeShape` — a **key-less** argument spreads a plain object.
 *
 * A key-less argument that is not a plain object throws, naming the method and
 * the parameter. The pre-rewrite code logged to `console.error` and then threw a
 * message that did not say which method was at fault.
 */

/** A parameter decorator's accepted argument. */
export type ParamDecoratorInput<O = void> = string | (O & { key?: string });

/** Normalise `"key"` / `{ key, ...options }` / `undefined`. */
export function normalizeParamInput<O>(
  input: ParamDecoratorInput<O> | undefined
): { key: string | undefined; options: O | undefined } {
  if (input === undefined) return { key: undefined, options: undefined };

  if (typeof input === "string") {
    return { key: input, options: undefined };
  }

  if (input === null || typeof input !== "object") {
    throw new SnailDecoratorError(t("error.decorator.param.untyped", "Source"));
  }

  const { key, ...options } = input as { key?: string } & Record<string, unknown>;
  return {
    key,
    options: Object.keys(options).length > 0 ? (options as O) : undefined
  };
}

/**
 * Write one parameter descriptor onto the decorated method.
 *
 * Parameter decorators run *before* the method decorator and in reverse index
 * order, so this only ever appends — the descriptor list is sorted by index when
 * the arguments are applied.
 */
export function defineParamDescriptor(
  source: string,
  resolver: SnailParamResolver,
  input: ParamDecoratorInput<any> | undefined,
  target: unknown,
  propertyKey: string | symbol | undefined,
  index: number
): void {
  if (propertyKey === undefined) {
    throw new SnailDecoratorError(t("error.decorator.param.context", sourceLabel(source)));
  }

  const { key, options } = normalizeParamInput(input);

  const descriptor: SnailParamDescriptor = {
    source,
    index,
    key,
    options,
    resolve: resolver
  };

  appendMetadata(SNAIL_PARAMS, descriptor, target, propertyKey);
}

/**
 * Build a parameter decorator for a registered source.
 *
 * Built-in sources are `params`, `query`, `data` and `header`. A plugin can add
 * its own with `createPlugin`'s `defineParamSource`.
 */
export function createParamDecoratorFor<O = void>(
  source: string
): (input?: ParamDecoratorInput<O>) => ParameterDecorator {
  return (input) => {
    if (typeof input === "string" && input.length === 0) {
      throw new SnailDecoratorError(t("error.decorator.param.untyped", sourceLabel(source)));
    }

    return (target, propertyKey, index) => {
      const resolver = paramResolvers[source];
      if (!resolver) {
        throw new SnailDecoratorError(
          `[snail] no resolver registered for parameter source "${source}"`
        );
      }
      defineParamDescriptor(source, resolver, input, target, propertyKey, index);
    };
  };
}

/**
 * Path placeholders.
 *
 * ```ts
 * @Api("/user")
 * class UserApi {
 *   @Get("/:id/:tab")
 *   get(@Params("id") id: string, @Params("tab") tab: string) {}
 *   // or, equivalently
 *   @Get("/:id/:tab")
 *   get(@Params() params: { id: string; tab: string }) {}
 * }
 * ```
 */
export const Params = createParamDecoratorFor("params");

/**
 * Query string parameters.
 *
 * ```ts
 * @Get("/list")
 * list(@Query("page") page: number, @Query() filters: { q?: string }) {}
 * ```
 */
export const Query = createParamDecoratorFor("query");

/**
 * Request body.
 *
 * Keyed arguments merge into an object body. A key-less plain object merges too,
 * while any other value (`FormData`, `Blob`, a raw string, an array) replaces the
 * body outright so non-JSON uploads stay possible.
 */
export const Data = createParamDecoratorFor("data");

/**
 * A single request header.
 *
 * ```ts
 * @Get("/me")
 * me(@HeaderValue("authorization") token: string) {}
 * ```
 *
 * For *static* headers use the class/method level `@Header({ ... })` instead.
 */
export const HeaderValue = createParamDecoratorFor("header");

/** Legacy alias — the pre-rewrite library exposed the header source as `Header`. */
export const HeaderParam = HeaderValue;
