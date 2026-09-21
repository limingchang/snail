import type { AxiosRequestConfig, Method } from "axios";
import type { SnailEnvelopeSchema, SnailResult } from "./response";

/**
 * 本库可以装饰的所有请求方法（HTTP 动词）。
 *
 * Every request verb this library can decorate.
 */
export type SnailMethodType =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

/**
 * `SnailMethodType` 的小写形式，即 axios 所期望的形式。
 *
 * `SnailMethodType` in the lowercase form axios expects.
 */
export type SnailMethodTypeLower = Lowercase<SnailMethodType>;

/**
 * `@Api(...)` 接受的选项。
 *
 * Options accepted by `@Api(...)`.
 */
export interface SnailApiOptions {
  /**
   * 该类中所有方法共用的路径前缀。
   *
   * 依次与服务 `baseURL`、方法路径拼接。
   *
   * Path prefix shared by every method of the class.
   *
   * Joined with the server `baseURL` and the method path, in that order.
   */
  url?: string;

  /**
   * 该 api 类的唯一标识。
   *
   * 默认为类名。用于日志、缓存命名空间与 `@HitSource` 解析。
   *
   * Unique identifier of this api class.
   *
   * Defaults to the class name. Used for logging, cache namespacing and
   * `@HitSource` resolution.
   */
  name?: string;

  /**
   * 单 api 超时时间，覆盖服务级超时。
   *
   * Per-api timeout, overriding the server timeout.
   */
  timeout?: number;

  /**
   * 单 api 适配器，覆盖服务级适配器。
   *
   * Per-api adapter, overriding the server adapter.
   */
  adapter?: AxiosRequestConfig["adapter"];

  /**
   * 单 api 的 `responseType`，覆盖服务级取值。
   *
   * Per-api `responseType`, overriding the server value.
   */
  responseType?: AxiosRequestConfig["responseType"];

  /**
   * 单 api 的 `withCredentials`，覆盖服务级取值。
   *
   * Per-api `withCredentials`, overriding the server value.
   */
  withCredentials?: boolean;
}

/**
 * 请求方法装饰器接受的选项。
 *
 * 它继承 `AxiosRequestConfig`，因此任何 axios 配置项都可以按方法设置，只是去掉
 * 了本库自己掌管的字段（`url` 与 `method`）。
 *
 * Options accepted by the request-method decorators.
 *
 * Extends `AxiosRequestConfig` so any axios knob can be set per method, minus
 * the fields the library owns (`url` and `method`).
 */
export interface SnailMethodOptions
  extends Omit<AxiosRequestConfig, "url" | "method" | "params" | "data"> {
  /**
   * 固化进该请求的额外查询参数。
   *
   * Extra query params baked into the request.
   */
  params?: Record<string, any>;

  /**
   * 固化进该请求的静态请求体（与 `@Data()` 互斥）。
   *
   * Static body baked into the request (mutually exclusive with `@Data()`).
   */
  data?: unknown;
}

/**
 * `@Get("/x", { ... })` 第二个参数所接收的类型。
 *
 * What `@Get("/x", { ... })` receives as its second argument.
 */
export type SnailMethodDecoratorOptions = SnailMethodOptions;

/**
 * axios 能识别的 `Method` 取值。
 *
 * A `Method` value axios understands.
 */
export type SnailAxiosMethod = Method;

/**
 * 被装饰方法的载荷类型，由其声明的返回类型推导而来。
 *
 * 未声明返回类型（即隐式 `void`）的方法得到 `unknown`，调用方仍可用显式泛型覆盖：
 * `userApi.getUser<MyShape>("1")`。
 *
 * The payload type of a decorated method, inferred from its declared return type.
 *
 * ```ts
 * @Get("/:id")
 * getUser(@Params("id") id: string): Promise<User> { return null!; }
 * //                                          ^^^^^^^^^^^^^^ → User
 * ```
 *
 * A method that declares nothing (implicitly `void`) yields `unknown`, which the
 * caller can still override with an explicit generic:
 * `userApi.getUser<MyShape>("1")`.
 */
export type SnailPayloadOf<R> = Awaited<R> extends void
  ? unknown
  : Awaited<R> extends undefined
    ? unknown
    : Awaited<R>;

/**
 * `Service.createApi(UserApi)` 返回的代理。
 *
 * 所有带请求方法装饰器的方法都会变成构建 `SnailMethod` 的函数，而不再执行原方法
 * 体 —— 被装饰的方法只用于声明请求的参数类型与返回类型。未带请求方法装饰器的
 * 方法原样透传，因此 api 类可以在端点旁边保留辅助方法。
 *
 * The proxy returned by `Service.createApi(UserApi)`.
 *
 * Every method carrying a request-method decorator becomes a function that
 * builds a `SnailMethod` instead of running the original body — the decorated
 * method exists only to declare the request's argument and return types:
 *
 * ```ts
 * @Api("/user")
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<User> { return null!; }
 * }
 *
 * const userApi = Service.createApi(UserApi);
 * const method = userApi.getUser("1");   // no request yet
 * const { data } = await method.send();  // `data` is `User`
 * ```
 *
 * Methods without a request-method decorator are passed through untouched, so an
 * api class may keep helpers next to its endpoints.
 */
export type SnailApiProxy<
  TClass,
  S = SnailEnvelopeSchema,
  D extends string = "data",
  C extends string = "code",
  M extends string = "message"
> = {
  [K in keyof TClass]: TClass[K] extends (...args: infer A) => infer R
    ? <TData = SnailPayloadOf<R>>(
        ...args: A
      ) => import("../core/method").SnailMethod<S, TData, D, C, M>
    : TClass[K];
};

/**
 * 从装饰器中提取出来的、单个被装饰方法的静态描述。
 *
 * Static description of one decorated method, extracted from its decorators.
 */
export interface SnailMethodMeta {
  /**
   * 服务名。
   *
   * Server name.
   */
  serverName: string;
  /**
   * api 类名。
   *
   * Api class name.
   */
  apiName: string;
  /**
   * api 类上的方法名。
   *
   * Method name on the api class.
   */
  methodName: string;
  /**
   * 完全限定名：`server.api.method`。
   *
   * Fully qualified name: `server.api.method`.
   */
  fullName: string;
  /**
   * 请求动词。
   *
   * Request verb.
   */
  method: SnailMethodType;
  /**
   * api 前缀与方法路径拼接后的地址。
   *
   * Api prefix joined with the method path.
   */
  url: string;
}

/**
 * 单次调用的覆盖项。
 *
 * 多数情况下它只是便利：更推荐把参数传给被代理的方法。保留它是为了策略需要注入
 * 签名中未携带的值的场景。
 *
 * Per-call overrides.
 *
 * Mostly a convenience: prefer passing arguments to the proxied method. Kept for
 * the cases where a strategy needs to inject a value the signature does not
 * carry.
 */
export interface SnailSendOptions<TData = unknown> {
  /**
   * 本次调用覆盖请求体。
   *
   * Override the body for this single call.
   */
  data?: TData;
  /**
   * 本次调用覆盖查询参数。
   *
   * Override query params for this single call.
   */
  query?: Record<string, any>;
  /**
   * 本次调用覆盖路径参数。
   *
   * Override path params for this single call.
   */
  pathParams?: Record<string, any>;
  /**
   * 本次调用覆盖请求头。
   *
   * Override headers for this single call.
   */
  headers?: Record<string, any>;
  /**
   * 本次调用的中止信号。
   *
   * Abort signal for this single call.
   */
  signal?: AbortSignal;
}

/**
 * 为方便使用而重新导出。
 *
 * Re-exported for convenience.
 */
export type { SnailResult };
