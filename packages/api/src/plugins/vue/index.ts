/**
 * Vue adapter plugin.
 *
 * ```ts
 * import { VueAdapter } from "@snail-js/api/plugins/vue";
 *
 * Service.use(VueAdapter());
 *
 * const user = Service.createApi(UserApi).getUser("1");
 * // `user.meta.loading` / `meta.data` / `meta.error` are Vue refs.
 * ```
 *
 * This sits behind its own subpath rather than in `@snail-js/api/plugins`: that
 * barrel must not statically import `vue`, or an application using only `Cache`
 * would fail to resolve Vue at all.
 *
 * @packageDocumentation
 */

export { VueAdapter } from "./plugin";
export type { VueAdapterOptions } from "./type";
