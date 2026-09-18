/**
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
