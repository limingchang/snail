import { isFunction, isPlainObject } from "./is";

/**
 * 返回 `source` 的副本，并去掉列出的键。
 *
 * 走的是浅拷贝：没被删除的嵌套对象仍与原对象共享引用。原对象不会被修改。
 *
 * Return a copy of `source` without the listed keys.
 *
 * @param source 源对象 / The source object.
 * @param keys 要移除的键 / The keys to remove.
 * @returns 不含这些键的新对象 / A new object without those keys.
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Omit<T, K> {
  const result = { ...source } as Record<string, any>;
  for (const key of keys) delete result[key as string];
  return result as Omit<T, K>;
}

/**
 * 返回 `source` 的副本，只保留列出的键。
 *
 * 源对象里不存在的键会被跳过，而不是写成 `undefined`；原对象不会被修改。
 *
 * Return a copy of `source` containing only the listed keys.
 *
 * @param source 源对象 / The source object.
 * @param keys 要保留的键 / The keys to keep.
 * @returns 仅含这些键的新对象 / A new object with only those keys.
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Record<string, any>;
  for (const key of keys) {
    if (key in source) result[key as string] = source[key];
  }
  return result as Pick<T, K>;
}

/**
 * 去掉值为 `undefined` 的键。
 *
 * `null` 会被刻意保留：`null` 常常是一个有意义的取值，只有 `undefined`
 * 才表示没有值。
 *
 * Drop keys whose value is `undefined`. `null` is preserved deliberately.
 *
 * @param source 源对象 / The source object.
 * @returns 去掉 `undefined` 值后的新对象 / A new object without `undefined` values.
 */
export function omitUndefined<T extends Record<string, any>>(source: T): T {
  const result = {} as Record<string, any>;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

/**
 * `T` 的深度可选版本，用于合并函数的入参。
 *
 * A deeply optional version of `T`, for merge inputs.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * 递归合并普通对象。
 *
 * 参数接受**深度可选**的源对象，所以
 * `deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })` 无需类型断言即可通过
 * 类型检查——这正是"只覆盖某一个嵌套默认值"所必需的。数组会被整体替换而
 * 不是拼接：若拼接，方法级的选项就永远无法覆盖服务端级的列表。
 *
 * 只有普通对象才会继续递归；值为 `undefined` 的键会被跳过，源对象不会被修改。
 *
 * Recursively merge plain objects.
 *
 * Accepts **deeply partial** sources, so
 * `deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })` type-checks without a cast —
 * which is the whole point of overriding one nested default.
 *
 * Arrays are replaced, not concatenated: concatenating them would make it
 * impossible for a method-level option to override a server-level list.
 *
 * @param sources 要合并的源对象，后者覆盖前者 / Sources to merge; later ones win.
 * @returns 合并后的新对象 / A new merged object.
 */
export function deepMerge<T extends Record<string, any>>(
  ...sources: Array<DeepPartial<T> | undefined | null>
): T {
  const result: Record<string, any> = {};

  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      const current = result[key];
      if (isPlainObject(current) && isPlainObject(value)) {
        result[key] = deepMerge(current, value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as T;
}

/**
 * 解析一个可能是函数的选项值。
 *
 * `@Header(...)` 之类的选项经常需要按请求计算，所以多数选项字段都接受
 * `T | ((ctx) => T)`。
 *
 * Resolve a possibly-functional option value.
 *
 * Options such as `@Header(...)` often need values computed per request, so most
 * option fields accept `T | ((ctx) => T)`.
 *
 * @param value 固定值，或根据参数求值的函数 / A fixed value, or a function of the argument.
 * @param arg 传给函数的参数 / The argument passed to the function.
 * @returns 解析后的值 / The resolved value.
 */
export function resolveValue<T, A>(value: T | ((arg: A) => T), arg: A): T {
  return isFunction(value) ? (value as (arg: A) => T)(arg) : value;
}

/**
 * 执行 `fn`，抛错时返回 `fallback`。
 *
 * 错误会被完全吞掉，因此只适合可以安全降级的场景。
 *
 * Run `fn`, returning `fallback` if it throws.
 *
 * @param fn 要执行的函数 / The function to run.
 * @param fallback 抛错时返回的值 / The value returned when `fn` throws.
 * @returns `fn` 的结果或 `fallback` / The result of `fn`, or `fallback`.
 */
export function tryCatch<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * 创建一个 promise 及其 resolve / reject 句柄。
 *
 * 策略层用它先把一个已就绪的 promise 交出去，之后再真正发起底层请求。
 *
 * Create a promise together with its resolve/reject handles.
 *
 * Used by strategies to hand a "ready" promise out before the underlying
 * request is actually started.
 *
 * @returns promise 与它的两个句柄 / The promise together with its two handles.
 */
export function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * 什么都不做的函数，用作默认回调。
 *
 * A function that does nothing — used as a default callback.
 */
export function noop(): void {
  /* intentionally empty */
}
