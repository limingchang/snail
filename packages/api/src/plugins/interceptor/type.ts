import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../../core/context";

/**
 * 拦截器插件共享的类型定义。
 *
 * ## 为什么不用 axios 自带的拦截器
 *
 * axios 把拦截器列表挂在*实例*上（`axios.interceptors`），因此那里的 `use()` 只能表达
 * “这个实例的每个请求”。而 `@BeforeRequest()` 这类装饰器需要的粒度恰好相反——只针对
 * 这一个方法，外加这一个 api 类——并且它还必须与其他插件排出先后顺序
 * （见 `docs/guide/plugin-lifecycle.md` §2.1）。这两点在实例层面都无法做到，所以拦截器
 * 改在插件生命周期上运行。
 *
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
 * 一个请求或响应拦截器。
 *
 * 请求准备阶段 `T` 是 `InternalAxiosRequestConfig`，一旦有了响应 `T` 就是 `AxiosResponse`。
 * 两个回调都会把实时的 {@link SnailContext} 作为第二个参数传进来，因此拦截器可以自行读取
 * 方法身份（`ctx.fullName`），而不需要插件把信息注入进去。
 *
 * `onFulfilled` 返回 `undefined` 表示保持它收到的值不变：多数拦截器都是就地修改，
 * 若强制每一个都返回配置，只会让常见写法变得啰嗦。
 *
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
  /**
   * 在请求交给 axios 之前运行，或针对响应运行。
   *
   * Runs before the request is handed to axios, or against the response.
   */
  onFulfilled?: (value: T, ctx: SnailContext) => T | void | Promise<T | void>;

  /**
   * 当 `onFulfilled`——或同一阶段更早的拦截器——抛出时运行。
   *
   * 插件在请求仍可挽回时把抛出的值交给它，这与只观察已定局失败的 `onError` 不同。
   * 任何非 `undefined` 的返回值都会被采纳为当前的配置/响应；返回 `undefined` 或再次抛错
   * 都会让失败继续向上传播。
   *
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

/**
 * 在外发 axios 配置仍可修改时运行的条目。
 *
 * An entry that runs while the outgoing axios config is still mutable.
 */
export type RequestInterceptorEntry = InterceptorEntry<InternalAxiosRequestConfig>;

/**
 * 针对已经存在的响应运行的条目。
 *
 * An entry that runs against a response that already exists.
 */
export type ResponseInterceptorEntry = InterceptorEntry<AxiosResponse>;
