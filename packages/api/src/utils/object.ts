import { isFunction, isPlainObject } from "./is";

/** Return a copy of `source` without the listed keys. */
export function omit<T extends Record<string, any>, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Omit<T, K> {
  const result = { ...source } as Record<string, any>;
  for (const key of keys) delete result[key as string];
  return result as Omit<T, K>;
}

/** Return a copy of `source` containing only the listed keys. */
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

/** Drop keys whose value is `undefined`. `null` is preserved deliberately. */
export function omitUndefined<T extends Record<string, any>>(source: T): T {
  const result = {} as Record<string, any>;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

/** A deeply optional version of `T`, for merge inputs. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * Recursively merge plain objects.
 *
 * Accepts **deeply partial** sources, so
 * `deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })` type-checks without a cast —
 * which is the whole point of overriding one nested default.
 *
 * Arrays are replaced, not concatenated: concatenating them would make it
 * impossible for a method-level option to override a server-level list.
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
 * Resolve a possibly-functional option value.
 *
 * Options such as `@Header(...)` often need values computed per request, so most
 * option fields accept `T | ((ctx) => T)`.
 */
export function resolveValue<T, A>(value: T | ((arg: A) => T), arg: A): T {
  return isFunction(value) ? (value as (arg: A) => T)(arg) : value;
}

/** Run `fn`, returning `fallback` if it throws. */
export function tryCatch<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Create a promise together with its resolve/reject handles.
 *
 * Used by strategies to hand a "ready" promise out before the underlying
 * request is actually started.
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

/** A function that does nothing — used as a default callback. */
export function noop(): void {
  /* intentionally empty */
}
