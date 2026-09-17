/**
 * `@snail-js/api/strategies/plain` — the framework-free entry point.
 *
 * ```ts
 * import { useRequest } from "@snail-js/api/strategies/plain";
 *
 * const user = useRequest(userApi.getUser);
 * await user.send("1");
 * user.data.value;      // values update, nothing re-renders
 * ```
 *
 * State handles are plain mutable boxes. Everything works — reads, writes,
 * `bind()`, events — it just does not *trigger* a render, which is exactly right
 * for a script, a server-side pass or a test. This entry is also what the strategy
 * test suite imports, so the whole layer is exercised without a UI framework.
 */
import { plainStateAdapter } from "../adapter/plain";
import { setStateAdapter } from "../adapter/registry";

// The registry already defaults to this adapter; setting it explicitly keeps the
// three entries symmetric and makes the choice visible at the import site.
setStateAdapter(plainStateAdapter);

export * from "./shared/public";
