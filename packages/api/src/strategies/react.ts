/**
 * `@snail-js/api/strategies/react` — the React entry point.
 *
 * ```ts
 * import { useRequest } from "@snail-js/api/strategies/react";
 *
 * const user = useRequest(userApi.getUser);
 * const { data, loading } = user.bind();   // subscribes this component
 * ```
 *
 * ## Why React needs its own entry
 *
 * Vue's `ref()` is tracked by the render effect that reads `.value`, so Vue needs
 * nothing from the strategy layer. React has no such tracking: a component only
 * re-renders when something explicitly tells it to. The React adapter therefore
 * allocates subscribable boxes and implements `useBind` with
 * `useSyncExternalStore`, and it is what `bind()` calls during render.
 *
 * Importing this module is what puts React's adapter in place — and the module is
 * the only place in the strategy layer that imports `react`, so an application
 * built on Vue never pulls it in.
 */
import { reactStateAdapter } from "../adapter/react";
import { setStateAdapter } from "../adapter/registry";

setStateAdapter(reactStateAdapter);

export * from "./shared/public";
