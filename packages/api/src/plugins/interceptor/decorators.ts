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
 * `@BeforeRequest()` / `@AfterResponse()`——拦截器插件的装饰器那一半。
 *
 * ## 存储方式
 *
 * 每个阶段两个目标共用一个元数据键：应用在类上就落在类槽位，应用在方法上就落在该方法自己的
 * 槽位（`src/core/metadata.ts` §storage model）。因此读回它们只需一次 `getClassMetadata`
 * 加一次 `getMethodMetadata`，调用处不必分支判断“这是类还是原型”。
 *
 * ## 为什么键名带命名空间
 *
 * `createClassDecorator` 会把 `"snail-interceptor/before"` 变成
 * `Symbol.for("@snail-js/api:custom:snail-interceptor/before")`。`Symbol.for` 键能挺过
 * monorepo 造成的“同一个包存在两份拷贝”的情形，因此从提升后的拷贝应用的装饰器，对从嵌套
 * 拷贝加载的插件依然可见。
 *
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
 * 在这个类/这个方法的请求配置上运行 `onFulfilled`，并与其他请求拦截器串行执行。
 *
 * 类级拦截器先于方法级拦截器运行，因此方法可以细化类所确立的内容。`onRejected` 可以通过
 * 返回替代配置来挽回失败；返回 `undefined`（或抛错）则让失败继续传播，请求也就不会被发送。
 *
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
 *
 * @param onFulfilled 收到请求配置与上下文；可返回替代配置 / Receives the request config
 *   and the context; may return a replacement config
 * @param onRejected 可选；`onFulfilled` 抛错时调用，返回替代配置即可恢复 / Optional;
 *   called when `onFulfilled` throws; return a replacement config to recover
 * @returns 同时可用于类与方法的装饰器 / A decorator usable on both a class and a method
 * @throws {SnailDecoratorError} 任一参数不是函数时 / When either argument is not a function
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
 * 针对这个类/这个方法的响应运行 `onFulfilled`。
 *
 * 回调收到的是 axios 响应，**而不是** `next`：与 `beforeRequest` 不同，这个阶段是回卷钩子，
 * 响应已经存在，这里没有任何东西决定请求是否发生。返回替代响应，或返回 `undefined`
 * 以保留传入的那一个。
 *
 * Run `onFulfilled` against the response of this class / this method.
 *
 * The callback receives the axios response, **not** a `next`: unlike
 * `beforeRequest`, this phase is an unwind hook, so the response already exists
 * and nothing here decides whether the request happens. Return a replacement
 * response, or `undefined` to keep the one that was passed in.
 *
 * @param onFulfilled 收到 axios 响应与上下文；可返回替代响应 / Receives the axios response
 *   and the context; may return a replacement response
 * @param onRejected 可选；`onFulfilled` 抛错时调用，返回替代响应即可恢复 / Optional;
 *   called when `onFulfilled` throws; return a replacement response to recover
 * @returns 同时可用于类与方法的装饰器 / A decorator usable on both a class and a method
 * @throws {SnailDecoratorError} 任一参数不是函数时 / When either argument is not a function
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

/**
 * 类级 `@BeforeRequest` 条目，按应用顺序排列。
 *
 * Class-level `@BeforeRequest` entries, in application order.
 */
export function classBeforeEntries(target: unknown): AnyEntry[] {
  return getClassMetadata<AnyEntry[]>(BEFORE_KEY, target) ?? [];
}

/**
 * 方法级 `@BeforeRequest` 条目，按应用顺序排列。
 *
 * Method-level `@BeforeRequest` entries, in application order.
 */
export function methodBeforeEntries(target: unknown, methodName: string): AnyEntry[] {
  return getMethodMetadata<AnyEntry[]>(BEFORE_KEY, target, methodName) ?? [];
}

/**
 * 类级 `@AfterResponse` 条目，按应用顺序排列。
 *
 * Class-level `@AfterResponse` entries, in application order.
 */
export function classAfterEntries(target: unknown): AnyEntry[] {
  return getClassMetadata<AnyEntry[]>(AFTER_KEY, target) ?? [];
}

/**
 * 方法级 `@AfterResponse` 条目，按应用顺序排列。
 *
 * Method-level `@AfterResponse` entries, in application order.
 */
export function methodAfterEntries(target: unknown, methodName: string): AnyEntry[] {
  return getMethodMetadata<AnyEntry[]>(AFTER_KEY, target, methodName) ?? [];
}
