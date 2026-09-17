import type { SnailContext } from "../../core/context";

/**
 * JSON → class transform types.
 *
 * Everything here is deliberately hand-rolled: no `class-transformer`, no
 * `reflect-metadata`, no design-time type emission. TypeScript 7 cannot emit
 * constructor parameter types at all, so the plugin relies on the explicit
 * `@PropertyType()` declarations the DTO author writes — which is also the only
 * way nested types are visible at runtime without a compiler plugin.
 */

/**
 * A class the transform plugin can hydrate into.
 *
 * `fromJSON` is optional and hand-written: when a DTO declares it, it wins over
 * automatic hydration, because a class that knows how to build itself from JSON
 * is the authority on its own invariants.
 */
export type DtoType<T = unknown> = (new () => T) & {
  /** Hand-written factory. Receives the raw JSON value and the live context. */
  fromJSON?: (raw: unknown, ctx?: SnailContext) => T;
};

/** Options for one `@PropertyType()` application. */
export interface PropertyTypeOptions {
  /**
   * Hydrate an array of `type` instead of a single value.
   *
   * Explicit rather than inferred: an empty JSON array cannot tell the plugin
   * whether it holds DTOs or primitives, so guessing would produce `[]` either
   * way while hiding the mistake.
   */
  array?: boolean;
}

/** What a `@PropertyType()` decorator stores for one property. */
export interface PropertyTypeSpec {
  /**
   * Lazy type resolver, e.g. `() => ChildDto`.
   *
   * Lazy is required, not cosmetic: two DTOs that reference each other would
   * otherwise hit a temporal dead zone at class-definition time.
   */
  type: () => unknown;

  /** Extra options, when the decorator was given any. */
  options?: PropertyTypeOptions;
}

/** Options accepted by the `Transform` plugin factory. */
export interface TransformOptions {
  /** DTO used when neither the method nor the api class declares one. */
  dto?: DtoType;

  /**
   * Keep JSON keys the DTO does not declare.
   *
   * Defaults to `false`: a DTO is a whitelist, and carrying undeclared keys onto
   * the instance is how internal backend fields leak into templates. A DTO that
   * declares *nothing* is the exception — there is no whitelist to apply, so every
   * own key of the JSON is assigned.
   */
  keepUnknown?: boolean;

  /**
   * Maximum object depth to descend.
   *
   * Defaults to `32`. A self-referencing `@PropertyType` plus deeply nested (or
   * cyclic) JSON would otherwise recurse until the stack blew, taking the whole
   * request with it.
   */
  maxDepth?: number;
}
