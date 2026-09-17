import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../../core/context";
import {
  createClassDecorator,
  createMethodDecorator,
  getClassMetadata,
  getMethodMetadata
} from "../../decorators/custom";
import { SnailDecoratorError } from "../../error";
import type { InterceptorEntry } from "./type";

/**
 * `@BeforeRequest()` / `@AfterResponse()` — the decorator half of the
 * interceptor plugin.
 *
 * ## Storage
 *
 * Both targets share one metadata key per phase: a class application lands in the
 * class slot, a method application in that method's slot
 * (`src/core/metadata.ts` §storage model). Reading them back is therefore one
 * `getClassMetadata` plus one `getMethodMetadata`, with no "is this a class or a
 * proto" branching at the call site.
 *
 * ## Why the key name is namespaced
 *
 * `createClassDecorator` turns `"snail-interceptor/before"` into
 * `Symbol.for("@snail-js/api:custom:snail-interceptor/before")`. A `Symbol.for`
 * key survives the two-copies-of-the-package situation a monorepo creates, so a
 * decorator applied from the hoisted copy is still visible to a plugin loaded
 * from the nested one.
 */

const BEFORE_KEY = "snail-interceptor/before";
const AFTER_KEY = "snail-interceptor/after";

type AnyEntry = InterceptorEntry<any>;
type DualDecorator = ClassDecorator & MethodDecorator;

const addBeforeOnClass = createClassDecorator<AnyEntry>(BEFORE_KEY);
const addBeforeOnMethod = createMethodDecorator<AnyEntry>(BEFORE_KEY);
const addAfterOnClass = createClassDecorator<AnyEntry>(AFTER_KEY);
const addAfterOnMethod = createMethodDecorator<AnyEntry>(AFTER_KEY);

/**
 * Fold a class application and a method application into one decorator.
 *
 * TypeScript tells the two apart by arity: a class decorator is called with the
 * constructor alone, a method decorator with `(prototype, key, descriptor)`.
 * That is the only reliable signal available without `reflect-metadata`.
 */
function dualDecorator(applyToClass: ClassDecorator, applyToMethod: MethodDecorator): DualDecorator {
  return ((target: any, propertyKey?: string | symbol) => {
    if (propertyKey === undefined) {
      applyToClass(target);
      return;
    }
    applyToMethod(target, propertyKey, undefined as never);
  }) as DualDecorator;
}

/** Reject the misuse that would otherwise fail silently at request time. */
function assertCallback(value: unknown, decorator: string): void {
  if (typeof value !== "function") {
    throw new SnailDecoratorError(
      `[snail] @${decorator}() needs a function; got ${typeof value}`
    );
  }
}

/**
 * Run `onFulfilled` on the request config of this class / this method, in series
 * with every other request interceptor.
 *
 * ```ts
 * @Api("/user")
 * @BeforeRequest<UserConfig>((config) => { config.headers.set("x-trace", "1"); })
 * class UserApi {
 *   @Get("/")
 *   @BeforeRequest((config) => { config.timeout = 5000; })
 *   list(): Promise<User[]> { return null!; }
 * }
 * ```
 *
 * Class-level interceptors run before method-level ones, so a method may refine
 * what its class established. `onRejected` may recover a failure by returning a
 * replacement config; returning `undefined` (or throwing) lets the failure
 * through, and the request is then never sent.
 */
export function BeforeRequest<T = InternalAxiosRequestConfig>(
  onFulfilled: (value: T, ctx: SnailContext) => T | void | Promise<T | void>,
  onRejected?: (error: unknown, ctx: SnailContext) => unknown
): DualDecorator {
  assertCallback(onFulfilled, "BeforeRequest");
  if (onRejected !== undefined) assertCallback(onRejected, "BeforeRequest");

  const entry: AnyEntry = { onFulfilled, onRejected };
  return dualDecorator(addBeforeOnClass(entry), addBeforeOnMethod(entry));
}

/**
 * Run `onFulfilled` against the response of this class / this method.
 *
 * The callback receives the axios response, **not** a `next`: unlike
 * `beforeRequest`, this phase is an unwind hook, so the response already exists
 * and nothing here decides whether the request happens. Return a replacement
 * response, or `undefined` to keep the one that was passed in.
 */
export function AfterResponse<T = AxiosResponse>(
  onFulfilled: (value: T, ctx: SnailContext) => T | void | Promise<T | void>,
  onRejected?: (error: unknown, ctx: SnailContext) => unknown
): DualDecorator {
  assertCallback(onFulfilled, "AfterResponse");
  if (onRejected !== undefined) assertCallback(onRejected, "AfterResponse");

  const entry: AnyEntry = { onFulfilled, onRejected };
  return dualDecorator(addAfterOnClass(entry), addAfterOnMethod(entry));
}

/** Class-level `@BeforeRequest` entries, in application order. */
export function classBeforeEntries(target: unknown): AnyEntry[] {
  return getClassMetadata<AnyEntry[]>(BEFORE_KEY, target) ?? [];
}

/** Method-level `@BeforeRequest` entries, in application order. */
export function methodBeforeEntries(target: unknown, methodName: string): AnyEntry[] {
  return getMethodMetadata<AnyEntry[]>(BEFORE_KEY, target, methodName) ?? [];
}

/** Class-level `@AfterResponse` entries, in application order. */
export function classAfterEntries(target: unknown): AnyEntry[] {
  return getClassMetadata<AnyEntry[]>(AFTER_KEY, target) ?? [];
}

/** Method-level `@AfterResponse` entries, in application order. */
export function methodAfterEntries(target: unknown, methodName: string): AnyEntry[] {
  return getMethodMetadata<AnyEntry[]>(AFTER_KEY, target, methodName) ?? [];
}
