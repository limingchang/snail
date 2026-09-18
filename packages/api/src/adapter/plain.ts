import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * The framework-free state adapter — the default.
 *
 * A plain mutable box. Values update correctly, they just do not *trigger*
 * anything, which is exactly right for a test, an SSR pass, a Node script or an
 * application that drives requests by hand.
 *
 * Assign it per server, or not at all:
 *
 * ```ts
 * @Server({ baseURL: "/api" })                             // SnailAdapter, implicitly
 * @Server({ baseURL: "/api", stateAdapter: SnailAdapter }) // or explicitly
 * class BackEnd extends SnailServer {}
 * ```
 *
 * ## Why this is a value rather than a global registration
 *
 * The framework choice used to be installed process-wide by `setStateAdapter()`.
 * That turned it into an import side effect — importing one strategies entry point
 * silently reconfigured every other server in the bundle — and made two servers
 * with different frameworks impossible. It is now a resolved server option; see
 * `SnailServerOptions.stateAdapter`.
 */
export const SnailAdapter: SnailStateAdapter = {
  name: "plain",

  create<T>(initial: T): SnailStateRef<T> {
    return { value: initial };
  },

  read<T>(ref: SnailStateRef<T>): T {
    return ref.value;
  },

  write<T>(ref: SnailStateRef<T>, value: T): void {
    ref.value = value;
  }
};
