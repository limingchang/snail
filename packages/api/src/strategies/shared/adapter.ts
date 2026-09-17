import { getStateAdapter } from "../../adapter/registry";
import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";

/**
 * Resolve the state adapter one strategy instance should use.
 *
 * The adapter is resolved **once per hook** rather than per read. A hook that
 * asked the registry on every write could observe two different adapters if an
 * application called `setStateAdapter()` between two requests, and would then mix
 * Vue refs with plain boxes in one set of handles.
 */
export function resolveStateAdapter(options: { adapter?: SnailStateAdapter } = {}): SnailStateAdapter {
  return options.adapter ?? getStateAdapter();
}

/**
 * Read a handle for the current render.
 *
 * `useBind` exists for frameworks that only re-render on an explicit
 * subscription (React's `useSyncExternalStore`); Vue tracks the `.value` access
 * itself, so its adapter omits the method and the read is the whole story. The
 * `??` fallback — rather than a truthiness check — keeps a legitimate `false`,
 * `0` or `""` from being replaced by a second read.
 */
export function bindRef<T>(adapter: SnailStateAdapter, ref: SnailStateRef<T>): T {
  return adapter.useBind?.(ref) ?? adapter.read(ref);
}
