/**
 * `@snail-js/api/plugins`——内置的可选插件。
 *
 * ## 为什么单独作为一个入口
 *
 * 这里没有任何东西属于核心。把插件挡在 `@snail-js/api/plugins` 之后，意味着只导入根入口
 * 的应用完全不必为它们付出代价——没有缓存、没有校验，也没有 JSON→类的水合。每个插件都
 * 有自己的目录和 barrel，因此打包工具可以丢掉某个应用从未调用过的那些。
 *
 * ## 框架适配器不在这里，也不需要
 *
 * 本 barrel 里的每个插件都与框架无关，所以导入它永远不会把 Vue、React 或 zod 拉进产物。
 * 框架的选择是一项**服务端选项**而不是插件：在 `@Server()` 上声明 `stateAdapter` 即可。
 * 核心读取该选项来在 `method.meta` 上构建句柄，`use*` 策略则从传给它的方法上读取它；
 * 一份声明同时驱动两者，而且因为它是按服务端设置的，两个服务端可以使用不同的框架。
 *
 * ## 注册顺序无关紧要
 *
 * 插件按 `priority` 排序，而不是按 `use()` 的调用顺序（优先级表见下）。每个区间都导出为
 * 常量——`INTERCEPTOR_PRIORITY`、`VERSIONING_PRIORITY`、`TRANSFORM_PRIORITY`、
 * `VALIDATE_PRIORITY`、`CACHE_PRIORITY`、`POOL_PRIORITY`——所以插件可以相对邻居定位自己
 * （`CACHE_PRIORITY + 1`），而不必硬编码一个魔法数字。正向钩子按优先级从高到低执行，因此
 * 拦截器在缓存计算哈希之前看到请求，而排在最后的请求池只会拦下缓存无法应答的请求；回卷
 * 钩子方向相反，所以缓存先存下原始信封，再轮到校验与转换。推理见
 * `docs/guide/plugin-lifecycle.md` §2.1。
 *
 * `@snail-js/api/plugins` — the built-in optional plugins.
 *
 * ```ts
 * import {
 *   Cache,
 *   Cacheable,
 *   Invalidates,
 *   Interceptor,
 *   BeforeRequest,
 *   RequestPool,
 *   Versioning,
 *   Version,
 *   Validate,
 *   Transform
 * } from "@snail-js/api/plugins";
 *
 * Service
 *   .use(Interceptor())
 *   .use(Versioning({ type: "header", defaultVersion: "1.0.0" }))
 *   .use(Validate())
 *   .use(Transform())
 *   .use(Cache({ ttl: 60, l2: "localStorage" }))
 *   .use(RequestPool({ concurrency: 4 }));
 * ```
 *
 * ## Why this is a separate entry point
 *
 * Nothing here is in the core. Keeping the plugins behind `@snail-js/api/plugins`
 * means an application that imports only the root entry pays for none of it — no
 * cache, no validation and no JSON→class hydration. Each plugin lives in its own
 * directory with its own barrel, so a bundler can drop the ones a given app never
 * calls.
 *
 * ## No framework adapter is here — and none is needed
 *
 * Every plugin in this barrel is framework-agnostic, so importing it can never pull
 * Vue, React or zod into a bundle.
 *
 * The framework choice is a *server option* rather than a plugin:
 *
 * ```ts
 * import { VueRef } from "@snail-js/api/adapter/vue";
 *
 * @Server({ baseURL: "/api", stateAdapter: VueRef })
 * class BackEnd extends SnailServer {}
 * ```
 *
 * Core reads that option to build the handles on `method.meta`, and the `use*`
 * strategies read it from the method they were given. One declaration drives both,
 * and because it is per server, two servers may use different frameworks.
 *
 * ## Registration order does not matter
 *
 * Plugins are ordered by `priority`, not by the order `use()` was called in:
 *
 * | Priority | Plugin |
 * | --- | --- |
 * | `100` | interceptor |
 * | `50` | versioning |
 * | `20` | `useTokenAuth` (returned by your call, not a built-in to install) |
 * | `0` | user plugins, transform |
 * | `-50` | validate |
 * | `-100` | cache |
 * | `-150` | request pool |
 *
 * Every band is exported as a constant — `INTERCEPTOR_PRIORITY`,
 * `VERSIONING_PRIORITY`, `TRANSFORM_PRIORITY`, `VALIDATE_PRIORITY`,
 * `CACHE_PRIORITY`, `POOL_PRIORITY` — so a plugin can position itself relative to
 * a neighbour (`CACHE_PRIORITY + 1`) instead of hardcoding a magic number.
 *
 * Forward hooks run highest-priority first, so the interceptor sees the request
 * before the cache hashes it and the pool — dead last — only ever gates requests
 * the cache could not answer. Unwind hooks run in the opposite direction, so the
 * cache stores the raw envelope before validation and transformation touch it.
 * See `docs/guide/plugin-lifecycle.md` §2.1 for the reasoning.
 *
 * @packageDocumentation
 */

export * from "./cache";
export * from "./interceptor";
export * from "./pool";
export * from "./transform";
export * from "./validate";
export * from "./version";
