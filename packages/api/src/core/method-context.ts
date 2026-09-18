import type { SnailMethodType } from "../typings/api";
import type { ResolvedServerOptions } from "../typings/server";

/**
 * The metadata the `createApi` proxy attaches to each method factory.
 *
 * ## Why it exists
 *
 * A `use*` strategy receives the *proxied method* — `userApi.getUser` — and must
 * create its state handles **immediately**, because a Vue template renders them on
 * the first pass. It therefore needs the owning server's `stateAdapter` and
 * envelope keys synchronously, before any request exists and before a
 * `SnailMethod` (and its context) has been constructed.
 *
 * The proxied method is the only handle the caller has, so the description rides on
 * it under a symbol key. That is what replaced the process-global adapter registry:
 * the framework decision now travels with the callable instead of living in a module
 * variable that any import could overwrite. Stream endpoints built by `createSse` /
 * `createWebSocket` carry it the same way — see {@link attachServerContext}.
 *
 * The key is `Symbol.for`, so two copies of the library in one bundle still agree.
 */
export const SNAIL_METHOD_CONTEXT = Symbol.for("@snail-js/api:method-context");

/** What {@link attachMethodContext} records. */
export interface SnailMethodContext {
  /** Resolved options of the owning server. */
  readonly serverOptions: ResolvedServerOptions;

  /** Api class name, for diagnostics. */
  readonly apiName?: string;

  /** Method name, for diagnostics. */
  readonly methodName?: string;

  /** Request verb. */
  readonly methodType?: SnailMethodType;
}

/**
 * Record the owning server's options on something that is **not** a method.
 *
 * `Service.createSse()` returns an endpoint factory rather than a proxied api
 * method, but a `use*` hook driving it needs the same thing a method hook needs:
 * the server's `stateAdapter`, read synchronously, before any request exists.
 * Without this, `useSSE` could not inherit the framework its server declared and
 * every SSE app would have to repeat `{ adapter: VueRef }` by hand — exactly the
 * two-places-to-configure problem this design removed.
 */
export function attachServerContext<T extends object>(
  target: T,
  serverOptions: ResolvedServerOptions
): T {
  return attachMethodContext(target, { serverOptions });
}

/** Record the owning server's description on a proxied method factory. */
export function attachMethodContext<T extends object>(
  factory: T,
  context: SnailMethodContext
): T {
  Object.defineProperty(factory, SNAIL_METHOD_CONTEXT, {
    value: context,
    enumerable: false,
    configurable: true,
    writable: false
  });
  return factory;
}

/**
 * Read the description {@link attachMethodContext} recorded, if any.
 *
 * Accepts functions and plain objects: methods carry it, and so do the stream
 * endpoints built by `createSse` / `createWebSocket`.
 */
export function getMethodContext(target: unknown): SnailMethodContext | undefined {
  if (target === null || (typeof target !== "object" && typeof target !== "function")) {
    return undefined;
  }
  return (target as Record<symbol, unknown>)[SNAIL_METHOD_CONTEXT] as
    | SnailMethodContext
    | undefined;
}
