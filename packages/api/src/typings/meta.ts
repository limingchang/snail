import type { SnailStateRef } from "./adapter";

/**
 * The caller-visible handles a framework adapter publishes on
 * `SnailMethod.meta`.
 *
 * ## Augmenting it
 *
 * This interface is the `declare module` extension point for the adapter types,
 * mirroring how `SnailEnvelopeSchema` is the one for the response envelope:
 *
 * ```ts
 * // app/env.d.ts
 * import type { Ref } from "vue";
 *
 * declare module "@snail-js/api" {
 *   interface SnailMeta {
 *     data: Ref<User>;
 *     code: Ref<number>;
 *     message: Ref<string>;
 *   }
 * }
 *
 * const method = userApi.getUser("1");
 * method.meta.data; // Ref<User>
 * ```
 *
 * ## Why `data` / `code` / `message` are not declared here
 *
 * Their names come from `@Server({ dataKey, codeKey, messageKey })`, which is a
 * runtime value — a static interface cannot name a key that is only known at
 * configuration time. Declaring them with a placeholder type would make
 * augmentation impossible (interface merging can only *add*, never narrow), so
 * they are left to the application to declare with its real payload type.
 *
 * `loading` and `error` are different: every adapter owns those two names and
 * their types are fixed, so they are declared here and typed precisely.
 */
export interface SnailMeta {
  /** `true` while a request is in flight. Present with any state adapter. */
  loading?: SnailStateRef<boolean>;

  /** The most recent failure, or `undefined`. Present with any state adapter. */
  error?: SnailStateRef<unknown>;
}
