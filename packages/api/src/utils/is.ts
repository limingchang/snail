/**
 * 库内共用的运行时类型判断。
 *
 * Runtime type predicates shared across the library.
 */

/**
 * 非 null 的对象返回 `true`（含数组、日期、类实例）。
 *
 * `true` for a non-null object (including arrays, dates, class instances).
 *
 * @param value 待判断的值 / The value to test.
 * @returns 是否为非 null 对象 / Whether the value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 只对普通对象字面量返回 `true`。
 *
 * 它比 `typeof value === "object"` 严格得多：数组、`Date`、`Map`、
 * `FormData`、`Blob` 以及类实例在这里都返回 `false`。
 *
 * `true` for a plain object literal — not an array, `Date`, `Map`, `FormData`,
 * `Blob`, class instance, and so on.
 *
 * Used to decide whether a `@Query()` / `@Data()` argument should be spread
 * into the outgoing payload.
 *
 * @param value 待判断的值 / The value to test.
 * @returns 是否为普通对象字面量 / Whether the value is a plain object literal.
 */
export function isPlainObject(value: unknown): value is Record<string, any> {
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/**
 * 可调用的值返回 `true`。
 *
 * `true` for a callable value.
 *
 * @param value 待判断的值 / The value to test.
 * @returns 是否可调用 / Whether the value is callable.
 */
export function isFunction(value: unknown): value is (...args: any[]) => any {
  return typeof value === "function";
}

/**
 * thenable 返回 `true`。
 *
 * 只检查 `then` 是否为函数，所以并非原生 Promise 的 thenable 也会通过。
 *
 * `true` for a thenable.
 *
 * @param value 待判断的值 / The value to test.
 * @returns 是否为 thenable / Whether the value is a thenable.
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    isObject(value) && isFunction((value as { then?: unknown }).then)
  );
}

/**
 * `value` 既不是 `null` 也不是 `undefined` 时返回 `true`。
 *
 * `true` when `value` is neither `null` nor `undefined`.
 *
 * @param value 待判断的值 / The value to test.
 * @returns 是否已定义 / Whether the value is defined.
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * `Response` 风格的请求体应当原样透传时返回 `true`。
 *
 * 每个分支都先做 `typeof X !== "undefined"` 判断：这些构造函数在 Node 等
 * 运行时可能根本不存在，直接写 `instanceof` 会抛 `ReferenceError`。命中
 * `Blob`、`ArrayBuffer`、`FormData`、`URLSearchParams` 或 `ReadableStream`
 * 返回 `true`，其余（含普通对象与字符串）返回 `false`。
 *
 * `true` when a `Response`-like body should be passed through untouched.
 *
 * @param value 待判断的值 / The value to test.
 * @returns 是否应原样透传 / Whether the body is passed through untouched.
 */
export function isBinaryBody(value: unknown): boolean {
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) return true;
  return false;
}

/**
 * 代码运行在具备 DOM 的浏览器中时返回 `true`。
 *
 * `window` 与 `document` 必须同时存在；缺少任何一个（例如 Web Worker）
 * 都会返回 `false`。
 *
 * `true` when the code is executing in a DOM-capable browser.
 *
 * @returns 是否在浏览器中执行 / Whether the code runs in a DOM-capable browser.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
