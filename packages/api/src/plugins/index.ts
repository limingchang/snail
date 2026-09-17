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
 *   .use(Cache({ ttl: 60, l2: "localStorage" }));
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
 * ## The framework adapters are *not* here
 *
 * `VueAdapter` and `ReactAdapter` live behind their own subpaths:
 *
 * ```ts
 * import { VueAdapter } from "@snail-js/api/plugins/vue";
 * import { ReactAdapter } from "@snail-js/api/plugins/react";
 * ```
 *
 * They are kept out of this barrel deliberately. A re-export would make this
 * module statically import both `vue` and `react`, so a React application that
 * only wanted `Cache` would fail to resolve `vue` at all — and a framework-free
 * one would pull both frameworks into its bundle. Separate subpaths keep the
 * optional peers genuinely optional.
 *
 * ## Registration order does not matter
 *
 * Plugins are ordered by `priority`, not by the order `use()` was called in:
 *
 * | Priority | Plugin |
 * | --- | --- |
 * | `100` | interceptor |
 * | `50` | versioning |
 * | `0` | framework adapter, transform |
 * | `-50` | validate |
 * | `-100` | cache |
 * | `-150` | request pool |
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
