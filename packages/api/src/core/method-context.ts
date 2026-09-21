import type { SnailMethodType } from "../typings/api";
import type { ResolvedServerOptions } from "../typings/server";

/**
 * `createApi` 代理挂在每个方法工厂上的元数据。
 *
 * ## 为什么需要它
 *
 * `use*` 策略拿到的是**被代理的方法** —— `userApi.getUser` —— 并且必须**立刻**
 * 创建它的状态句柄，因为 Vue 模板在第一轮渲染时就会用到它们。所以它需要同步拿到
 * 所属服务器的 `stateAdapter` 和信封键，此时既没有任何请求，也还没构造出
 * `SnailMethod`（及其上下文）。
 *
 * 被代理的方法是调用方唯一能拿到的抓手，因此这些描述就以 symbol 键挂在它上面。
 * 这正是用来取代进程级全局适配器注册表的做法：框架相关的决定跟着可调用对象走，
 * 而不是待在一个任何导入都可能覆盖的模块变量里。由 `createSse` /
 * `createWebSocket` 构建的流端点也以同样方式携带它 —— 见 {@link attachServerContext}。
 *
 * 键用 `Symbol.for`，因此同一个 bundle 里的两份库副本仍然能达成一致。
 *
 * The metadata the `createApi` proxy attaches to each method factory.
 *
 * ## Why it exists
 *
 * A `use*` strategy receives the *proxied method* — `userApi.getUser` — and must
 * create its state handles **immediately**, because a Vue template renders them on
 * the first pass. It therefore needs the owning server's `stateAdapter` and
 * envelope keys synchronously, before any request exists and before a
 * `SnailMethod` (and its context) has been constructed.
 *
 * The proxied method is the only handle the caller has, so the description rides on
 * it under a symbol key. That is what replaced the process-global adapter registry:
 * the framework decision now travels with the callable instead of living in a module
 * variable that any import could overwrite. Stream endpoints built by `createSse` /
 * `createWebSocket` carry it the same way — see {@link attachServerContext}.
 *
 * The key is `Symbol.for`, so two copies of the library in one bundle still agree.
 */
export const SNAIL_METHOD_CONTEXT = Symbol.for("@snail-js/api:method-context");

/**
 * {@link attachMethodContext} 记录的内容。
 *
 * What {@link attachMethodContext} records.
 */
export interface SnailMethodContext {
  /**
   * 所属服务器已解析的选项。
   *
   * Resolved options of the owning server.
   */
  readonly serverOptions: ResolvedServerOptions;

  /**
   * api 类名，用于诊断。
   *
   * Api class name, for diagnostics.
   */
  readonly apiName?: string;

  /**
   * 方法名，用于诊断。
   *
   * Method name, for diagnostics.
   */
  readonly methodName?: string;

  /**
   * 请求动词。
   *
   * Request verb.
   */
  readonly methodType?: SnailMethodType;
}

/**
 * 把所属服务器的选项记录到**不是方法**的对象上。
 *
 * `Service.createSse()` 返回的是端点工厂而不是被代理的 api 方法，但驱动它的
 * `use*` 钩子需要的和方法钩子完全一样：在任何请求存在之前同步读到服务器的
 * `stateAdapter`。没有这一步，`useSSE` 就无法继承它所在服务器声明的框架，
 * 每个 SSE 应用都得手写 `{ adapter: VueRef }` —— 正是本设计要消除的
 * “需要配置两处”的问题。
 *
 * Record the owning server's options on something that is **not** a method.
 *
 * `Service.createSse()` returns an endpoint factory rather than a proxied api
 * method, but a `use*` hook driving it needs the same thing a method hook needs:
 * the server's `stateAdapter`, read synchronously, before any request exists.
 * Without this, `useSSE` could not inherit the framework its server declared and
 * every SSE app would have to repeat `{ adapter: VueRef }` by hand — exactly the
 * two-places-to-configure problem this design removed.
 *
 * @param target 需要携带服务器描述的对象 / The object that should carry the description.
 * @param serverOptions 所属服务器已解析的选项 / Resolved options of the owning server.
 * @returns 同一个对象，便于链式调用 / The same object, for chaining.
 */
export function attachServerContext<T extends object>(
  target: T,
  serverOptions: ResolvedServerOptions
): T {
  return attachMethodContext(target, { serverOptions });
}

/**
 * 把所属服务器的描述记录到被代理的方法工厂上。
 *
 * 属性被定义为不可写且不可枚举：它会一直待在该方法上，但不会被遍历到。
 *
 * Record the owning server's description on a proxied method factory.
 *
 * @param factory 被代理的方法工厂 / The proxied method factory.
 * @param context 要记录的方法元数据 / The method metadata to record.
 * @returns 同一个工厂，便于链式调用 / The same factory, for chaining.
 */
export function attachMethodContext<T extends object>(
  factory: T,
  context: SnailMethodContext
): T {
  Object.defineProperty(factory, SNAIL_METHOD_CONTEXT, {
    value: context,
    enumerable: false,
    configurable: true,
    writable: false
  });
  return factory;
}

/**
 * 读取 {@link attachMethodContext} 记录过的描述，没有则返回 `undefined`。
 *
 * 它同时接受函数和普通对象：方法会携带它，`createSse` / `createWebSocket`
 * 构建的流端点也会。
 *
 * Read the description {@link attachMethodContext} recorded, if any.
 *
 * Accepts functions and plain objects: methods carry it, and so do the stream
 * endpoints built by `createSse` / `createWebSocket`.
 *
 * @param target 待读取的方法或端点 / The method or endpoint to read from.
 * @returns 记录过的元数据，没有则为 `undefined` /
 *   The recorded metadata, or `undefined` when there is none.
 */
export function getMethodContext(target: unknown): SnailMethodContext | undefined {
  if (target === null || (typeof target !== "object" && typeof target !== "function")) {
    return undefined;
  }
  return (target as Record<symbol, unknown>)[SNAIL_METHOD_CONTEXT] as
    | SnailMethodContext
    | undefined;
}
