import { getMethodContext } from "../../core/method-context";
import { SnailAdapter } from "../../adapter/plain";
import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";

/**
 * Resolve the state adapter one strategy instance should use.
 *
 * Precedence, and why:
 *
 * 1. **`options.adapter`** — an explicit per-hook override. Wins outright, so a
 *    single exotic hook can differ from its server without a second server class.
 * 2. **The owning server's `stateAdapter`** — read from the method factory that was
 *    passed in. This is the normal path: declare your framework once with
 *    `@Server({ stateAdapter: VueRef })` and every hook agrees.
 * 3. **`SnailAdapter`** — the framework-free fallback, for a proxy built by hand or
 *    a method whose context could not be read.
 *
 * ## Why the server, and not a module global
 *
 * This used to read a process-wide registry that the strategies entry points set as
 * an import side effect. That made the framework choice order-dependent — importing
 * one entry point silently reconfigured every other server — and made two servers
 * with different frameworks impossible in one bundle. Resolving from the method's
 * own server fixes both, and it resolves **once per hook**, so one set of handles
 * can never mix two adapters.
 */
export function resolveStateAdapter(
  options: { adapter?: SnailStateAdapter } = {},
  method?: unknown
): SnailStateAdapter {
  return (
    options.adapter ??
    getMethodContext(method)?.serverOptions.stateAdapter ??
    SnailAdapter
  );
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
