/**
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
