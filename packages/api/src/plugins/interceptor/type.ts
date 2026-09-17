import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../../core/context";

/**
 * Shared shapes of the interceptor plugin.
 *
 * ## Why these are not axios' own interceptors
 *
 * axios keeps its interceptor lists on the *instance* (`axios.interceptors`), so
 * `use()` there can only express "every request of this instance". A decorator
 * such as `@BeforeRequest()` needs the opposite granularity — this one method,
 * plus this one api class — and it has to be ordered against the other plugins
 * (see `docs/guide/plugin-lifecycle.md` §2.1). Both are impossible at instance level, which
 * is why interceptors run on the plugin lifecycle instead.
 */

/**
 * One request or response interceptor.
 *
 * `T` is `InternalAxiosRequestConfig` while the request is being prepared and
 * `AxiosResponse` once a response exists. Both callbacks receive the live
 * {@link SnailContext} as a second argument, so an interceptor may read the
 * method identity (`ctx.fullName`) without the plugin having to inject it.
 *
 * Returning `undefined` from `onFulfilled` keeps the value it received: most
 * interceptors mutate in place, and forcing every one of them to return the
 * config would make the common case noisy.
 */
export interface InterceptorEntry<T = unknown> {
  /** Runs before the request is handed to axios, or against the response. */
  onFulfilled?: (value: T, ctx: SnailContext) => T | void | Promise<T | void>;

  /**
   * Runs when `onFulfilled` — or an earlier interceptor in the same phase —
   * throws.
   *
   * The plugin calls it with the thrown value while the request is still
   * recoverable, unlike `onError` which only observes a settled failure. Any
   * value other than `undefined` is adopted as the current config/response;
   * returning `undefined` or throwing re-propagates the failure.
   */
  onRejected?: (error: unknown, ctx: SnailContext) => unknown;
}

/** An entry that runs while the outgoing axios config is still mutable. */
export type RequestInterceptorEntry = InterceptorEntry<InternalAxiosRequestConfig>;

/** An entry that runs against a response that already exists. */
export type ResponseInterceptorEntry = InterceptorEntry<AxiosResponse>;
