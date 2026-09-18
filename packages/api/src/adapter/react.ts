import { useSyncExternalStore } from "react";
import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";

/**
 * A React state box.
 *
 * Wider than {@link SnailStateRef} on purpose: React needs a subscription and a
 * snapshot that changes identity to know a re-render is due. A bare `{ value }`
 * box gives it neither, which is the classic `useSyncExternalStore` pitfall — if
 * the snapshot is the value itself, two renders with an equal primitive look
 * unchanged and React bails out.
 */
interface ReactStateBox<T> extends SnailStateRef<T> {
  /** Monotonic counter used as the `useSyncExternalStore` snapshot. */
  version: number;
  listeners: Set<() => void>;
}

function box<T>(state: SnailStateRef<T>): ReactStateBox<T> {
  return state as ReactStateBox<T>;
}

/**
 * React state adapter.
 *
 * `create` returns a subscribable box; `useBind` is what a component calls during
 * render to subscribe and re-render. Strategies therefore work both in a component
 * (via `useBind`) and in an event handler (via `read`).
 *
 * ```tsx
 * import { ReactState } from "@snail-js/api/adapter/react";
 *
 * @Server({ baseURL: "/api", stateAdapter: ReactState })
 * class BackEnd extends SnailServer {}
 *
 * const { data, loading } = useMethodState(userApi.getUser("1"));
 * ```
 *
 * This module is the only place in the library that imports `react`, and it is
 * reached solely through the `@snail-js/api/adapter/react` subpath.
 */
export const ReactState: SnailStateAdapter = {
  name: "react",

  create<T>(initial: T): SnailStateRef<T> {
    const state: ReactStateBox<T> = {
      value: initial,
      version: 0,
      listeners: new Set()
    };
    return state;
  },

  read<T>(state: SnailStateRef<T>): T {
    return state.value;
  },

  write<T>(state: SnailStateRef<T>, value: T): void {
    const target = box(state);
    target.value = value;
    target.version += 1;
    for (const listener of [...target.listeners]) listener();
  },

  subscribe<T>(state: SnailStateRef<T>, listener: (value: T) => void): () => void {
    const target = box(state);
    // The box stores a 0-argument listener internally; the public signature
    // matches `SnailStateAdapter` and receives the new value.
    const wrapped = (): void => listener(target.value);
    target.listeners.add(wrapped);
    return () => {
      target.listeners.delete(wrapped);
    };
  },

  /**
   * Read a state during render, subscribing the current component.
   *
   * The snapshot is the version counter, not the value: React compares snapshots
   * with `Object.is`, so returning `{ id: 1 }` again would look unchanged and the
   * component would not re-render.
   */
  useBind<T>(state: SnailStateRef<T>): T {
    const target = box(state);
    useSyncExternalStore(
      (listener) => ReactState.subscribe!(state, listener),
      () => target.version,
      () => target.version
    );
    return target.value;
  },

  dispose<T>(state: SnailStateRef<T>): void {
    box(state).listeners.clear();
  }
};

/** What {@link useMethodState} returns. */
export interface ReactMethodState<TData = unknown> {
  /** Unwrapped payload of the most recent response. */
  data: TData | undefined;

  /** `true` between `send()` and settlement. */
  loading: boolean;

  /** Failure of the most recent send, cleared at the start of the next one. */
  error: unknown;

  /** Business code of the most recent response. */
  code: unknown;

  /** Business message of the most recent response. */
  message: unknown;
}

/**
 * A shared placeholder so the hook order never depends on which handles exist.
 *
 * Creating it once avoids allocating a throwaway box on every render.
 */
const MISSING_HANDLE = ReactState.create<unknown>(undefined);

/**
 * Read a request method's state inside a component, subscribing it to changes.
 *
 * ```tsx
 * function User({ id }: { id: string }) {
 *   const method = useMemo(() => userApi.getUser(id), [id]);
 *   const { data, loading, error } = useMethodState(method);
 *   useEffect(() => { void method.send(); }, [method]);
 *   if (loading) return <Spinner />;
 *   return <p>{error ? String(error) : data?.name}</p>;
 * }
 * ```
 *
 * The five handles are bound unconditionally and in a fixed order, because React
 * identifies hooks by call position: a conditional `useBind` throws
 * "rendered fewer hooks than expected" as soon as the second render takes a
 * different branch.
 *
 * Requires `stateAdapter: ReactState` on the server — the handles exist only when
 * an adapter that produces subscribable boxes created them.
 */
export function useMethodState<TData = unknown>(
  method: { meta: Record<string, unknown>; context: { serverOptions: { dataKey: string; codeKey: string; messageKey: string } } }
): ReactMethodState<TData> {
  const meta = method.meta;
  const { dataKey, codeKey, messageKey } = method.context.serverOptions;
  const bind = ReactState.useBind as (ref: SnailStateRef) => unknown;

  // Fixed order and fixed count — do not reorder, do not hoist into a loop.
  const data = bind((meta[dataKey] ?? MISSING_HANDLE) as SnailStateRef);
  const code = bind((meta[codeKey] ?? MISSING_HANDLE) as SnailStateRef);
  const message = bind((meta[messageKey] ?? MISSING_HANDLE) as SnailStateRef);
  const loading = bind((meta.loading ?? MISSING_HANDLE) as SnailStateRef);
  const error = bind((meta.error ?? MISSING_HANDLE) as SnailStateRef);

  return {
    data: data as TData | undefined,
    loading: Boolean(loading),
    error,
    code,
    message
  };
}
