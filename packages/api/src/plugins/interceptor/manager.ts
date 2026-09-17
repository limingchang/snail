import { SnailPluginError } from "../../error";
import type { InterceptorEntry } from "./type";

/**
 * Runtime registry of programmatic interceptors.
 *
 * Decorators cover interceptors that are known at class-definition time. This
 * class covers the other half — an application that decides at runtime "from now
 * on, sign every request" — and it is also what the plugin uses internally to
 * hold the server-wide entries passed to `Interceptor({ request })`.
 *
 * Entries keep insertion order: that order *is* the execution order, since the
 * interceptor contract is deliberately sequential rather than priority based.
 */
export class InterceptorManager<T = unknown> {
  private readonly registry = new Map<number, InterceptorEntry<T>>();
  private sequence = 0;

  /** Register an entry. Returns the id {@link eject} needs to remove it again. */
  use(entry: InterceptorEntry<T>): number {
    if (!entry || (typeof entry.onFulfilled !== "function" && typeof entry.onRejected !== "function")) {
      throw new SnailPluginError(
        "[snail] InterceptorManager.use() expects an entry with onFulfilled and/or onRejected",
        { pluginName: "interceptor" }
      );
    }

    // Ids are never reused: an `eject` racing a late `use` must not remove the
    // wrong entry, which array-index ids in the pre-rewrite implementation did.
    this.sequence += 1;
    this.registry.set(this.sequence, entry);
    return this.sequence;
  }

  /** Remove an entry by the id returned from {@link use}. Returns whether it existed. */
  eject(id: number): boolean {
    return this.registry.delete(id);
  }

  /** Drop every entry. */
  clear(): void {
    this.registry.clear();
  }

  /** Registered entries, in execution order. */
  get entries(): InterceptorEntry<T>[] {
    return [...this.registry.values()];
  }

  /** Number of registered entries. */
  get size(): number {
    return this.registry.size;
  }
}
