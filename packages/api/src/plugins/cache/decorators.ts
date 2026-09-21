import {
  createClassDecorator,
  createMethodDecorator,
  getClassMetadata,
  getMethodMetadata
} from "../../decorators/custom";
import { SnailDecoratorError } from "../../error";
import type { CacheableOptions } from "./type";

/**
 * `@Cacheable()` / `@NoCache()` / `@Invalidates()` / `@HitSource()`——缓存插件的声明式那一半。
 *
 * 这四个装饰器都能作用于类和方法。TypeScript 通过参数个数区分二者（类装饰器只会收到
 * 构造函数）；在 TS 7 中 `emitDecoratorMetadata` 不再产出任何元数据之后，这是唯一可用的信号。
 *
 * ## 为什么 `@Invalidates` 是追加而不是覆盖
 *
 * `@Invalidates("users", "orders")` 是同一个目标上的两次装饰器应用。使用合并式工厂意味着
 * 读取方直接得到 `["users", "orders"]`，插件无需展平嵌套数组——而且分开写两行
 * `@Invalidates()` 的组合方式完全相同，这也正是一个方法触及多个缓存时的自然写法。
 *
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
 * 把该方法——或该类的每一个方法——标记为可缓存。
 *
 * 传入这个装饰器就是一次显式启用：即使请求方法不在 `CacheOptions.cacheFor` 列表中也会缓存。
 * 不传它时由 `cacheFor` 决定；原因是“缓存这个类的所有 POST”在本意只想挂标签时太容易被误写。
 *
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
 *
 * @param options 该目标的缓存策略；默认空对象 / Cache policy for this target; defaults to
 *   an empty object
 * @returns 同时可用于类与方法的装饰器 / A decorator usable on both a class and a method
 * @throws {SnailDecoratorError} `ttl` 不是正数、`key` 为空串或 `tags` 含空串时 /
 *   When `ttl` is not positive, `key` is an empty string, or `tags` holds an empty string
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
 * 让该方法——或整个类——退出缓存。
 *
 * 方法级的 `@NoCache()` 胜过类级的 `@Cacheable()`，类级的 `@NoCache()` 胜过 `cacheFor`
 * 的默认值。退出是唯一不允许被更宽泛的规则覆盖的决定，因为判断错误的代价是提供过期数据。
 *
 * Opt this method — or this entire class — out of caching.
 *
 * A method-level `@NoCache()` beats a class-level `@Cacheable()`, and a
 * class-level `@NoCache()` beats the `cacheFor` default. Opting out is the one
 * decision that may never be overridden by a broader rule, because the cost of
 * being wrong is serving stale data.
 *
 * @returns 同时可用于类与方法的装饰器 / A decorator usable on both a class and a method
 */
export function NoCache(): DualDecorator {
  return dualDecorator(addNoCacheOnClass(true), addNoCacheOnMethod(true));
}

/**
 * 本次请求成功后，清除所有带有 `tags` 中任意一个标签的缓存条目。
 *
 * “成功”指 HTTP 往返成功：该钩子位于响应路径上，所以失败或被取消的请求不会清除任何东西。
 * 一个方法可以清除它自己也会写入的标签——插件先清除再写入，因此新条目能在自己的清除中
 * 存活下来。
 *
 * Purge every cached entry carrying any of `tags` once this request succeeds.
 *
 * "Succeeds" means the HTTP round-trip did: the hook lives on the response path,
 * so a failed or cancelled request invalidates nothing. A method may invalidate a
 * tag it also stores under — the plugin purges before it stores, so the fresh
 * entry survives its own invalidation.
 *
 * @param tags 要清除的标签，至少一个 / The tags to purge; at least one
 * @returns 同时可用于类与方法的装饰器 / A decorator usable on both a class and a method
 * @throws {SnailDecoratorError} 任一标签不是非空字符串时 / When any tag is not a
 *   non-empty string
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
 * {@link Invalidates} 的兼容旧版别名，用于单个来源名称。
 *
 * 重写前的装饰器以变更的*来源*命名，而不是以它清除的条目命名；据此编写的应用代码可以继续
 * 工作，新代码应优先使用 `@Invalidates`。
 *
 * Legacy-compatible alias of {@link Invalidates} for a single source name.
 *
 * The pre-rewrite decorator was named after the *source* of a change rather than
 * the entries it purges; application code written against it keeps working, and
 * new code should prefer `@Invalidates`.
 *
 * @param name 变更来源的名称，即要清除的标签 / The source name of the change, used as
 *   the tag to purge
 * @returns 同时可用于类与方法的装饰器 / A decorator usable on both a class and a method
 */
export function HitSource(name: string): DualDecorator {
  return Invalidates(name);
}

// ── readers ─────────────────────────────────────────────────────────────────

/**
 * 从方法（给出 `methodName` 时）或类上读取 `@Cacheable(...)`。
 *
 * `undefined` 表示“未标记”，这与 `{}`（“已标记但没有任何覆盖项”）不同——插件对二者的
 * 处理方式不一样。
 *
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

/**
 * 当该方法或类被应用了 `@NoCache()` 时为 `true`。
 *
 * `true` when `@NoCache()` was applied to this method or class.
 */
export function readNoCache(target: unknown, methodName?: string): boolean {
  const value =
    methodName === undefined
      ? getClassMetadata<boolean>(NO_CACHE_KEY, target)
      : getMethodMetadata<boolean>(NO_CACHE_KEY, target, methodName);

  return value === true;
}

/**
 * `@Invalidates(...)` / `@HitSource(...)` 列出的标签，按应用顺序排列。
 *
 * Tags listed by `@Invalidates(...)` / `@HitSource(...)`, in application order.
 */
export function readInvalidates(target: unknown, methodName?: string): string[] {
  return (
    (methodName === undefined
      ? getClassMetadata<string[]>(INVALIDATES_KEY, target)
      : getMethodMetadata<string[]>(INVALIDATES_KEY, target, methodName)) ?? []
  );
}
