/**
 * Options accepted by the Vue adapter plugin.
 *
 * Deliberately empty: the adapter mirrors the envelope keys the server already
 * declares (`dataKey` / `codeKey` / `messageKey`) and adds the two fixed handles
 * `loading` and `error`, so there is nothing left to configure. A per-plugin key
 * option was avoided on purpose — two sources of truth for the same key is how a
 * UI ends up rendering `undefined` while the payload sits one key away.
 *
 * The parameter is part of the factory signature anyway, so a future option can
 * be added without breaking every `VueAdapter()` call site.
 *
 * ## Typing the handles
 *
 * `method.meta.loading` and `.error` are already typed as `Ref<boolean>` /
 * `Ref<unknown>` through the `SnailMeta` interface. The envelope handles are named
 * after the server's configured keys, which a static interface cannot know, so
 * declare them yourself with your real payload type:
 *
 * ```ts
 * import type { Ref } from "vue";
 *
 * declare module "@snail-js/api" {
 *   interface SnailMeta {
 *     data: Ref<User>;
 *     code: Ref<number>;
 *     message: Ref<string>;
 *   }
 * }
 * ```
 */
export interface VueAdapterOptions {}
