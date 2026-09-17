import {
  createClassDecorator,
  createMethodDecorator,
  getClassMetadata,
  getMethodMetadata
} from "../../decorators/custom";
import { SnailDecoratorError } from "../../error";
import type { CacheableOptions } from "./type";

/**
 * `@Cacheable()` / `@NoCache()` / `@Invalidates()` / `@HitSource()` — the
 * declarative half of the cache plugin.
 *
 * All four work on a class and on a method. TypeScript distinguishes the two by
 * arity (a class decorator is called with the constructor alone), which is the
 * only signal available now that `emitDecoratorMetadata` emits nothing in TS 7.
 *
 * ## Why `@Invalidates` appends instead of replacing
 *
 * `@Invalidates("users", "orders")` is two decorator applications on one target.
 * Using the merging factory means the reader gets `["users", "orders"]` without
 * the plugin having to flatten a nested array — and two separate
 * `@Invalidates()` lines compose the same way, which is how a method that
 * touches several caches is naturally written.
 */

const CACHEABLE_KEY = "snail-cache/cacheable";
const NO_CACHE_KEY = "snail-cache/disabled";
const INVALIDATES_KEY = "snail-cache/invalidates";

type DualDecorator = ClassDecorator & MethodDecorator;

// `merge = false` for the single-value keys: applying `@Cacheable()` twice to one
// target should not produce a list the reader has to reconcile.
const addCacheableOnClass = createClassDecorator<CacheableOptions>(CACHEABLE_KEY, false);
const addCacheableOnMethod = createMethodDecorator<CacheableOptions>(CACHEABLE_KEY, false);
const addNoCacheOnClass = createClassDecorator<boolean>(NO_CACHE_KEY, false);
const addNoCacheOnMethod = createMethodDecorator<boolean>(NO_CACHE_KEY, false);

// `merge = true` for tags: one application per tag, accumulated in order.
const addInvalidatesOnClass = createClassDecorator<string>(INVALIDATES_KEY);
const addInvalidatesOnMethod = createMethodDecorator<string>(INVALIDATES_KEY);

/** Fold a class application and a method application into one decorator. */
function dualDecorator(applyToClass: ClassDecorator, applyToMethod: MethodDecorator): DualDecorator {
  return ((target: any, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      applyToClass(target);
      return;
    }
    applyToMethod(target, propertyKey, undefined as never);
  }) as DualDecorator;
}

/** Reject the misuse that would otherwise only surface at request time. */
function assertCacheableOptions(options: CacheableOptions): void {
  if (options.ttl !== undefined && !(typeof options.ttl === "number" && options.ttl > 0)) {
    throw new SnailDecoratorError(
      "[snail] @Cacheable({ ttl }) must be a positive number of seconds"
    );
  }

  if (options.key !== undefined && (typeof options.key !== "string" || options.key.length === 0)) {
    throw new SnailDecoratorError("[snail] @Cacheable({ key }) must be a non-empty string");
  }

  if (options.tags !== undefined) {
    if (!Array.isArray(options.tags)) {
      throw new SnailDecoratorError("[snail] @Cacheable({ tags }) must be an array of strings");
    }
    for (const tag of options.tags) {
      if (typeof tag !== "string" || tag.length === 0) {
        throw new SnailDecoratorError("[snail] @Cacheable({ tags }) must contain non-empty strings");
      }
    }
  }
}

/**
 * Mark this method — or every method of this class — as cacheable.
 *
 * Passing the decorator is an explicit opt-in: it caches even a verb that
 * `CacheOptions.cacheFor` does not list. Without it, `cacheFor` decides, and the
 * reason is that "cache every POST of this class" is far too easy to write by
 * accident when the intent was only to attach tags.
 *
 * ```ts
 * @Api("/user")
 * @Cacheable({ tags: ["users"] })
 * class UserApi {
 *   @Get("/") list(): Promise<User[]> { return null!; }
 *
 *   @Get("/stats")
 *   @Cacheable({ ttl: 5 })
 *   stats(): Promise<Stats> { return null!; }
 * }
 * ```
 */
export function Cacheable(options: CacheableOptions = {}): DualDecorator {
  assertCacheableOptions(options);

  const value: CacheableOptions = {
    ttl: options.ttl,
    key: options.key,
    tags: options.tags === undefined ? undefined : [...options.tags]
  };

  return dualDecorator(addCacheableOnClass(value), addCacheableOnMethod(value));
}

/**
 * Opt this method — or this entire class — out of caching.
 *
 * A method-level `@NoCache()` beats a class-level `@Cacheable()`, and a
 * class-level `@NoCache()` beats the `cacheFor` default. Opting out is the one
 * decision that may never be overridden by a broader rule, because the cost of
 * being wrong is serving stale data.
 */
export function NoCache(): DualDecorator {
  return dualDecorator(addNoCacheOnClass(true), addNoCacheOnMethod(true));
}

/**
 * Purge every cached entry carrying any of `tags` once this request succeeds.
 *
 * "Succeeds" means the HTTP round-trip did: the hook lives on the response path,
 * so a failed or cancelled request invalidates nothing. A method may invalidate a
 * tag it also stores under — the plugin purges before it stores, so the fresh
 * entry survives its own invalidation.
 */
export function Invalidates(...tags: string[]): DualDecorator {
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.length === 0) {
      throw new SnailDecoratorError("[snail] @Invalidates(...tags) needs non-empty strings");
    }
  }

  // One decorator application per tag, so the stored metadata stays a flat
  // `string[]` instead of an array of arrays the reader would have to flatten.
  return ((target: any, propertyKey?: string | symbol) => {
    for (const tag of tags) {
      if (propertyKey === undefined) {
        addInvalidatesOnClass(tag)(target);
      } else {
        addInvalidatesOnMethod(tag)(target, propertyKey, undefined as never);
      }
    }
  }) as DualDecorator;
}

/**
 * Legacy-compatible alias of {@link Invalidates} for a single source name.
 *
 * The pre-rewrite decorator was named after the *source* of a change rather than
 * the entries it purges; application code written against it keeps working, and
 * new code should prefer `@Invalidates`.
 */
export function HitSource(name: string): DualDecorator {
  return Invalidates(name);
}

// ── readers ─────────────────────────────────────────────────────────────────

/**
 * Read `@Cacheable(...)` from a method (when `methodName` is given) or a class.
 *
 * `undefined` means "not marked", which is different from `{}` ("marked, with no
 * overrides") — the plugin treats the two differently.
 */
export function readCacheable(target: unknown, methodName?: string): CacheableOptions | undefined {
  return methodName === undefined
    ? getClassMetadata<CacheableOptions>(CACHEABLE_KEY, target)
    : getMethodMetadata<CacheableOptions>(CACHEABLE_KEY, target, methodName);
}

/** `true` when `@NoCache()` was applied to this method or class. */
export function readNoCache(target: unknown, methodName?: string): boolean {
  const value =
    methodName === undefined
      ? getClassMetadata<boolean>(NO_CACHE_KEY, target)
      : getMethodMetadata<boolean>(NO_CACHE_KEY, target, methodName);

  return value === true;
}

/** Tags listed by `@Invalidates(...)` / `@HitSource(...)`, in application order. */
export function readInvalidates(target: unknown, methodName?: string): string[] {
  return (
    (methodName === undefined
      ? getClassMetadata<string[]>(INVALIDATES_KEY, target)
      : getMethodMetadata<string[]>(INVALIDATES_KEY, target, methodName)) ?? []
  );
}
