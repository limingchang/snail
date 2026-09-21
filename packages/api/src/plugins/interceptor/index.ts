/**
 * 拦截器插件。
 *
 * 它运行在插件生命周期上，从不使用 `axios.interceptors`：axios 拦截器挂在实例上，
 * 既无法只针对某个方法，也无法与其他插件排出先后顺序。`priority: 100` 是保留给拦截器的
 * 优先级区间，因此 `@BeforeRequest()` 总在缓存对它做哈希之前看到请求。
 *
 * Interceptor plugin.
 *
 * ```ts
 * import { Interceptor, BeforeRequest, AfterResponse } from "@snail-js/api/plugins";
 *
 * const interceptors = Interceptor();
 * Service.use(interceptors);
 * interceptors.request.use({ onFulfilled: (config) => { config.timeout = 5000; } });
 *
 * @Api("/user")
 * @BeforeRequest((config, ctx) => { config.headers.set("x-trace", ctx.fullName); })
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<User> { return null!; }
 * }
 * ```
 *
 * Runs on the plugin lifecycle, never on `axios.interceptors`: an axios
 * interceptor lives on the instance, so it can neither target one method nor be
 * ordered against the other plugins. `priority: 100` is the reserved interceptor
 * band, so `@BeforeRequest()` always sees the request before the cache hashes it.
 *
 * @packageDocumentation
 */

export {
  AfterResponse,
  BeforeRequest,
  classAfterEntries,
  classBeforeEntries,
  methodAfterEntries,
  methodBeforeEntries
} from "./decorators";
export { InterceptorManager } from "./manager";
export { INTERCEPTOR_PLUGIN_NAME, INTERCEPTOR_PRIORITY, Interceptor } from "./plugin";
export type { InterceptorOptions, InterceptorPlugin } from "./plugin";
export type {
  InterceptorEntry,
  RequestInterceptorEntry,
  ResponseInterceptorEntry
} from "./type";
