/**
 * React adapter plugin.
 *
 * ```tsx
 * import { ReactAdapter, useMethodState } from "@snail-js/api/plugins/react";
 *
 * Service.use(ReactAdapter());
 *
 * const { data, loading, error } = useMethodState(userApi.getUser("1"));
 * ```
 *
 * This sits behind its own subpath rather than in `@snail-js/api/plugins`: that
 * barrel must not statically import `react`, or an application using only `Cache`
 * would fail to resolve React at all.
 *
 * @packageDocumentation
 */

export { ReactAdapter, useMethodState } from "./plugin";
export type { ReactAdapterOptions, ReactMethodState } from "./type";
