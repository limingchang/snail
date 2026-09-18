/**
 * `@snail-js/api/strategies` — the request-strategy hooks.
 *
 * ```ts
 * import { useRequest, usePagination, useDownload } from "@snail-js/api/strategies";
 * ```
 *
 * ## One entry point, and it imports no framework
 *
 * There used to be three entries — this one (Vue), `/plain` and `/react` — whose
 * only difference was which state adapter they installed into a **process-wide
 * registry** as an import side effect. Importing one of them silently reconfigured
 * every other server in the bundle, and two servers with different frameworks were
 * impossible in one process.
 *
 * The framework is now declared once, on the server:
 *
 * ```ts
 * import { VueRef } from "@snail-js/api/adapter/vue";
 *
 * @Server({ baseURL: "/api", stateAdapter: VueRef })
 * class BackEnd extends SnailServer {}
 *
 * const { data } = useRequest(userApi.getUser);   // data is a Vue Ref
 * ```
 *
 * Each hook reads that option from the method it was handed, so this module imports
 * no framework at all — Vue, React and framework-free applications all use this one
 * entry, and only the adapter an application imports pulls its framework in.
 *
 * @packageDocumentation
 */

export * from "./shared/public";
