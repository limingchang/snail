/** Runtime type predicates shared across the library. */

/** `true` for a non-null object (including arrays, dates, class instances). */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * `true` for a plain object literal — not an array, `Date`, `Map`, `FormData`,
 * `Blob`, class instance, and so on.
 *
 * Used to decide whether a `@Query()` / `@Data()` argument should be spread
 * into the outgoing payload.
 */
export function isPlainObject(value: unknown): value is Record<string, any> {
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/** `true` for a callable value. */
export function isFunction(value: unknown): value is (...args: any[]) => any {
  return typeof value === "function";
}

/** `true` for a thenable. */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    isObject(value) && isFunction((value as { then?: unknown }).then)
  );
}

/** `true` when `value` is neither `null` nor `undefined`. */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** `true` when a `Response`-like body should be passed through untouched. */
export function isBinaryBody(value: unknown): boolean {
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) return true;
  return false;
}

/** `true` when the code is executing in a DOM-capable browser. */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
