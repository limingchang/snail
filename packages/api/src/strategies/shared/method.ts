import type { AxiosProgressEvent } from "axios";
import type { SnailMethod } from "../../core/method";

/**
 * A proxied api method — exactly what `Service.createApi(UserApi).getUser` is.
 *
 * Calling it **builds** a request (no network); `send()` performs it. A strategy
 * needs the callable rather than an already-built `SnailMethod` because it must
 * be able to re-send with different arguments, and because a strategy that
 * forwards the argument tuple keeps the api class's own signature intact.
 */
export type StrategyMethod<
  TArgs extends readonly unknown[] = readonly unknown[],
  TData = unknown
> = (...args: TArgs) => SnailMethod<any, TData, any, any, any>;

/** The `SnailMethod` a strategy drives, with its payload type narrowed. */
export type SnailRequest<TData = unknown> = SnailMethod<any, TData, any, any, any>;

/**
 * Holds the single `SnailMethod` a hook reuses across sends.
 *
 * `docs/guide/plugin-lifecycle.md` §4.3 is explicit that `initMeta` runs once per method, not
 * once per send, so the reactive handles a UI captured stay identical across
 * re-sends. Calling `method(...args)` again would build a *second* context with a
 * second set of refs — the UI would keep rendering the first, frozen one. This
 * holder is what makes "one instance, many sends" the default instead of a rule
 * every hook author has to remember.
 */
export interface MethodHolder<TData = unknown> {
  /** The instance driving every send, or `undefined` before the first one. */
  readonly instance: SnailRequest<TData> | undefined;

  /** `true` while this holder's method has a request in flight. */
  readonly pending: boolean;

  /** Get-or-create the instance. Only the first call's arguments are captured. */
  resolve(args: readonly unknown[]): SnailRequest<TData>;

  /** Cancel the in-flight request, if any. A no-op before the first send. */
  abort(): void;
}

/** Create a {@link MethodHolder} around a proxied api method. */
export function createMethodHolder<
  TArgs extends readonly unknown[],
  TData
>(method: StrategyMethod<TArgs, TData>): MethodHolder<TData> {
  let instance: SnailRequest<TData> | undefined;

  return {
    get instance(): SnailRequest<TData> | undefined {
      return instance;
    },
    get pending(): boolean {
      // `SnailMethod.pending` is the authoritative flag: it is set inside
      // `send()` and cleared in its `finally`, so it also covers a rejected send.
      return instance?.pending ?? false;
    },
    resolve(args: readonly unknown[]): SnailRequest<TData> {
      instance ??= method(...(args as unknown as TArgs));
      return instance;
    },
    abort(): void {
      instance?.abort();
    }
  };
}

/**
 * Attach a per-request upload progress callback.
 *
 * The core resolves `onUploadProgress` from `@UploadProgress(...)` metadata when
 * the `SnailMethod` is built, which is once per method — not once per file. To
 * vary it per request this writes onto the **live** axios config instead.
 *
 * The timing is load-bearing: `send()` calls `begin()` synchronously before its
 * first `await`, so the config read here is the one axios will send. Calling this
 * before `send()` would be silently overwritten by `begin()`, and calling it
 * after an `await` would be too late.
 *
 * @returns `false` when there was no live config to attach to.
 */
export function attachUploadProgress<TData>(
  snail: SnailRequest<TData>,
  listener: (event: AxiosProgressEvent) => void
): boolean {
  const config = snail.context?.request;
  if (!config) return false;

  // Chain rather than replace: a `@UploadProgress()` decorator on the method must
  // keep receiving events even though the strategy owns the callback now.
  const previous = config.onUploadProgress;
  config.onUploadProgress = (event: AxiosProgressEvent): void => {
    if (typeof previous === "function") previous(event);
    listener(event);
  };
  return true;
}
