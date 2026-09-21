/**
 * `@snail-js/api/strategies`——请求策略 hook 模块。
 *
 * ## 一个入口，且不导入任何框架
 *
 * 这里曾经有三个入口——本文件（Vue）、`/plain` 与 `/react`——它们唯一的区别，是以 import
 * 副作用往一个**进程级注册表**里安装哪个 state adapter。导入其中任何一个都会静默重配
 * bundle 里其它所有 server，同一个进程里也无法存在两个使用不同框架的 server。
 *
 * 现在框架只在 server 上声明一次：用 `@Server({ stateAdapter: VueRef })` 声明后，每个
 * hook 都从交给它的 method 上读取该选项。因此本模块完全不导入框架——Vue、React 与无框架
 * 应用都用这一个入口，只有应用自己导入的 adapter 才会把对应框架拉进来。
 *
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
