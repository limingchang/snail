import type { AxiosRequestConfig, Method } from "axios";
import type { SnailEnvelopeSchema, SnailResult } from "./response";

/** Every request verb this library can decorate. */
export type SnailMethodType =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

/** `SnailMethodType` in the lowercase form axios expects. */
export type SnailMethodTypeLower = Lowercase<SnailMethodType>;

/** Options accepted by `@Api(...)`. */
export interface SnailApiOptions {
  /**
   * Path prefix shared by every method of the class.
   *
   * Joined with the server `baseURL` and the method path, in that order.
   */
  url?: string;

  /**
   * Unique identifier of this api class.
   *
   * Defaults to the class name. Used for logging, cache namespacing and
   * `@HitSource` resolution.
   */
  name?: string;

  /** Per-api timeout, overriding the server timeout. */
  timeout?: number;

  /** Per-api adapter, overriding the server adapter. */
  adapter?: AxiosRequestConfig["adapter"];

  /** Per-api `responseType`, overriding the server value. */
  responseType?: AxiosRequestConfig["responseType"];

  /** Per-api `withCredentials`, overriding the server value. */
  withCredentials?: boolean;
}

/**
 * Options accepted by the request-method decorators.
 *
 * Extends `AxiosRequestConfig` so any axios knob can be set per method, minus
 * the fields the library owns (`url` and `method`).
 */
export interface SnailMethodOptions
  extends Omit<AxiosRequestConfig, "url" | "method" | "params" | "data"> {
  /** Extra query params baked into the request. */
  params?: Record<string, any>;

  /** Static body baked into the request (mutually exclusive with `@Data()`). */
  data?: unknown;
}

/** What `@Get("/x", { ... })` receives as its second argument. */
export type SnailMethodDecoratorOptions = SnailMethodOptions;

/** A `Method` value axios understands. */
export type SnailAxiosMethod = Method;

/**
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

/** Static description of one decorated method, extracted from its decorators. */
export interface SnailMethodMeta {
  /** Server name. */
  serverName: string;
  /** Api class name. */
  apiName: string;
  /** Method name on the api class. */
  methodName: string;
  /** Fully qualified name: `server.api.method`. */
  fullName: string;
  /** Request verb. */
  method: SnailMethodType;
  /** Api prefix joined with the method path. */
  url: string;
}

/**
 * Per-call overrides.
 *
 * Mostly a convenience: prefer passing arguments to the proxied method. Kept for
 * the cases where a strategy needs to inject a value the signature does not
 * carry.
 */
export interface SnailSendOptions<TData = unknown> {
  /** Override the body for this single call. */
  data?: TData;
  /** Override query params for this single call. */
  query?: Record<string, any>;
  /** Override path params for this single call. */
  pathParams?: Record<string, any>;
  /** Override headers for this single call. */
  headers?: Record<string, any>;
  /** Abort signal for this single call. */
  signal?: AbortSignal;
}

/** Re-exported for convenience. */
export type { SnailResult };
