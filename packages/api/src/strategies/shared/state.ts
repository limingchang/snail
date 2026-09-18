import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";
import { Emitter } from "../../utils/emitter";
import { bindRef, resolveStateAdapter } from "./adapter";
import { readErrorCode, readErrorMessage } from "./error";

/** Partial write accepted by {@link StrategyState.update}. */
export interface StrategyStatePatch<TData> {
  data?: TData;
  loading?: boolean;
  error?: unknown;
  code?: number | string;
  message?: string;
}

/** The resolved snapshot {@link StrategyState.bind} returns. */
export interface StrategyBoundState<TData> {
  loading: boolean;
  data: TData | undefined;
  error: unknown;
  code: number | string | undefined;
  message: string | undefined;
}

/**
 * The state surface every request strategy exposes.
 *
 * ## Why handles and not values
 *
 * A strategy cannot know whether it is being read by a Vue render effect, a React
 * render or a plain script. Handing back a `SnailStateRef` keeps the strategy
 * framework-free: a Vue `Ref` already satisfies the interface, React goes through
 * `bind()`, and a script may read `.value` directly.
 *
 * ## Why `update()` exists
 *
 * An optimistic update has to write the cache entry into the state *before* the
 * server confirms it, and has to roll it back when the request fails. Without
 * `update()` every caller would reach into the refs and bypass the adapter.
 */
export interface StrategyState<TData> {
  /** `true` from the start of a send until it settles. */
  readonly loading: SnailStateRef<boolean>;

  /** Payload of the most recent successful send. */
  readonly data: SnailStateRef<TData | undefined>;

  /** Failure of the most recent send. Never set for a cancellation. */
  readonly error: SnailStateRef<unknown>;

  /** Business/HTTP code of the most recent send. */
  readonly code: SnailStateRef<number | string | undefined>;

  /** Business message of the most recent send. */
  readonly message: SnailStateRef<string | undefined>;

  /** Abort the in-flight request, if any. */
  abort(): void;

  /** Patch state directly — e.g. after an optimistic update. */
  update(patch: StrategyStatePatch<TData>): void;

  /** Resolved values, subscribing the current component when the adapter supports it. */
  bind(): StrategyBoundState<TData>;

  /** Called after a successful send. Returns an unsubscribe function. */
  onSuccess(callback: (data: TData) => void): () => void;

  /** Called after a failed send. Cancellations are not failures. */
  onError(callback: (error: unknown) => void): () => void;

  /** Called once a send settles, successfully or not. */
  onFinish(callback: () => void): () => void;
}

/**
 * Events a state controller emits.
 *
 * A type alias rather than an interface so it satisfies the `Record<string,
 * unknown>` constraint `Emitter` requires — interfaces do not get implicit index
 * signatures.
 */
export type StrategyStateEvents<TData> = {
  success: TData;
  error: unknown;
  finish: undefined;
};

/** Options accepted by {@link createStrategyState}. */
export interface StrategyStateOptions<TData> {
  adapter?: SnailStateAdapter;
  /**
   * The proxied method this hook drives.
   *
   * Used only to read the owning server's `stateAdapter`, so a hook inherits the
   * framework its server declared rather than consulting a process-wide global.
   */
  method?: unknown;
  /** Value `data` starts at. Defaults to `undefined`. */
  initialData?: TData;
  /** Invoked by `state.abort()`. The hook owns what "abort" means. */
  onAbort?: () => void;
}

/**
 * The {@link StrategyState} plus the write side only the hook should use.
 *
 * Keeping the writers off the caller-visible object is what stops application code
 * from poking `data` mid-flight: the handle is readable, the transitions are not.
 */
export interface StrategyStateController<TData> {
  readonly adapter: SnailStateAdapter;
  readonly state: StrategyState<TData>;

  setLoading(value: boolean): void;
  setData(value: TData | undefined): void;
  setError(value: unknown): void;
  setCode(value: number | string | undefined): void;
  setMessage(value: string | undefined): void;

  /** Clear the failure fields at the start of a send. `data` is left alone. */
  resetForSend(): void;

  /** Write `data`/`code`/`message` from a successful result and clear `error`. */
  applySuccess(result: {
    data: TData;
    code?: number | string | undefined;
    message?: string | undefined;
  }): TData;

  /** Write `error` — plus the code/message the error carries. */
  applyFailure(error: unknown): void;

  emitSuccess(data: TData): void;
  emitError(error: unknown): void;
  emitFinish(): void;

  /** Release adapter resources and drop every listener. */
  dispose(): void;
}

/** `true` when `key` was explicitly provided, even with an `undefined` value. */
function hasKey(source: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

/**
 * Build the state handles, the listeners and the writers for one hook.
 *
 * All five refs are created here, even for a hook that will not use them: a
 * `useFetcher({ withState: false })` still has to answer `abort()` and
 * `onFinish()`, and creating state lazily would hand the UI handles that appear
 * only after the first request.
 */
export function createStrategyState<TData>(
  options: StrategyStateOptions<TData> = {}
): StrategyStateController<TData> {
  const adapter = resolveStateAdapter(options, options.method);
  const loading = adapter.create<boolean>(false);
  const data = adapter.create<TData | undefined>(options.initialData);
  const error = adapter.create<unknown>(undefined);
  const code = adapter.create<number | string | undefined>(undefined);
  const message = adapter.create<string | undefined>(undefined);
  const events = new Emitter<StrategyStateEvents<TData>>();

  const state: StrategyState<TData> = {
    loading,
    data,
    error,
    code,
    message,

    abort(): void {
      options.onAbort?.();
    },

    update(patch: StrategyStatePatch<TData>): void {
      // Presence, not truthiness: `update({ error: undefined })` is how a caller
      // clears a failure, and `update({ loading: false })` must not be skipped.
      if (hasKey(patch, "data")) adapter.write(data, patch.data);
      if (hasKey(patch, "loading")) adapter.write(loading, patch.loading as boolean);
      if (hasKey(patch, "error")) adapter.write(error, patch.error);
      if (hasKey(patch, "code")) adapter.write(code, patch.code);
      if (hasKey(patch, "message")) adapter.write(message, patch.message);
    },

    bind(): StrategyBoundState<TData> {
      return {
        loading: bindRef(adapter, loading),
        data: bindRef(adapter, data),
        error: bindRef(adapter, error),
        code: bindRef(adapter, code),
        message: bindRef(adapter, message)
      };
    },

    onSuccess(callback: (value: TData) => void): () => void {
      return events.on("success", callback);
    },

    onError(callback: (value: unknown) => void): () => void {
      return events.on("error", callback);
    },

    onFinish(callback: () => void): () => void {
      return events.on("finish", callback);
    }
  };

  return {
    adapter,
    state,

    setLoading(value: boolean): void {
      adapter.write(loading, value);
    },

    setData(value: TData | undefined): void {
      adapter.write(data, value);
    },

    setError(value: unknown): void {
      adapter.write(error, value);
    },

    setCode(value: number | string | undefined): void {
      adapter.write(code, value);
    },

    setMessage(value: string | undefined): void {
      adapter.write(message, value);
    },

    resetForSend(): void {
      adapter.write(error, undefined);
      adapter.write(code, undefined);
      adapter.write(message, undefined);
    },

    applySuccess(result: {
      data: TData;
      code?: number | string | undefined;
      message?: string | undefined;
    }): TData {
      adapter.write(data, result.data);
      adapter.write(code, result.code);
      adapter.write(message, result.message);
      adapter.write(error, undefined);
      return result.data;
    },

    applyFailure(failure: unknown): void {
      adapter.write(error, failure);
      adapter.write(code, readErrorCode(failure));
      adapter.write(message, readErrorMessage(failure));
    },

    emitSuccess(value: TData): void {
      events.emit("success", value);
    },

    emitError(failure: unknown): void {
      events.emit("error", failure);
    },

    emitFinish(): void {
      events.emit("finish", undefined);
    },

    dispose(): void {
      events.clear();
      adapter.dispose?.(loading);
      adapter.dispose?.(data);
      adapter.dispose?.(error);
      adapter.dispose?.(code);
      adapter.dispose?.(message);
    }
  };
}
