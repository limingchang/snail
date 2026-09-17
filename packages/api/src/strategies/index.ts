/**
 * `@snail-js/api/strategies` — the default entry point, wired for Vue.
 *
 * ```ts
 * import { useRequest, usePagination } from "@snail-js/api/strategies";
 *
 * const user = useRequest(userApi.getUser);
 * ```
 *
 * ## Why the adapter is installed here and nowhere else
 *
 * A strategy hands the caller state handles; only the framework knows what a
 * handle is. Importing this module is therefore the *only* thing that makes Vue's
 * `ref()` the state primitive, and it is what pulls `vue` into a bundle. An
 * application that never imports this entry (or the Vue adapter plugin) never
 * ships Vue — which is why this file and `react.ts` are the only modules in the
 * strategy layer allowed to import a framework.
 *
 * The assignment runs before the re-export below, so a hook created immediately
 * after the import already sees the Vue adapter.
 */
import { vueStateAdapter } from "../adapter/vue";
import { setStateAdapter } from "../adapter/registry";

setStateAdapter(vueStateAdapter);

export * from "./shared/public";
