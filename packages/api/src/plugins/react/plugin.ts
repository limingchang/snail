import { reactStateAdapter } from "../../adapter/react";
import { createPlugin } from "../../core/plugin";
import { readKey, unwrapEnvelope } from "../../core/response";
import { SnailCancelledError } from "../../error/request";
import type { SnailContext } from "../../core/context";
import type { SnailMethod } from "../../core/method";
import type { SnailStateRef } from "../../typings/adapter";
import type { ReactAdapterOptions, ReactMethodState } from "./type";

/**
 * React adapter plugin.
 *
 * Mirrors every request's state onto `ctx.meta` as subscribable boxes and exposes
 * {@link useMethodState} to bind them during render.
 *
 * ## Why this is not just the Vue plugin with another adapter
 *
 * A Vue `ref` tracks reads by itself, so writing it is enough. A React box has no
 * idea a component rendered it: the component must subscribe during render
 * (`useSyncExternalStore`) or the new value is never painted. That subscription
 * lives in `useMethodState`, not in the plugin hooks.
 *
 * ## Why `initMeta` and not `beforeRequest`
 *
 * `initMeta` runs **once**, when the `SnailMethod` is built, while `beforeCreate`
 * runs per `send()`. Creating the boxes per send is the classic bug where a
 * component keeps rendering the first response forever, because the UI captured
 * box #1 while the second send wrote into box #2.
 */

/** Key of the `loading` handle. Fixed, and not part of the envelope. */
const LOADING_KEY = "loading";

/** Key of the `error` handle. Fixed, and not part of the envelope. */
const ERROR_KEY = "error";

/**
 * Stand-in bound when a handle is missing.
 *
 * `useMethodState` must call the same number of hooks in the same order on every
 * render; a missing handle therefore cannot mean "call one hook fewer".
 */
const MISSING_HANDLE = reactStateAdapter.create<unknown>(undefined);

/** `useSyncExternalStore` behind a non-optional name, so it can always be called. */
const bindHandle = reactStateAdapter.useBind as (ref: SnailStateRef) => unknown;

/**
 * Create one box unless the caller already holds one for that key.
 *
 * The guard keeps a re-run of `initMeta` (a context built before the plugin was
 * installed) from replacing boxes the UI is already subscribed to.
 */
function ensureHandle(ctx: SnailContext, key: string, initial: unknown): void {
  if (reactStateAdapter.isState?.(ctx.meta[key])) return;
  ctx.meta[key] = reactStateAdapter.create(initial);
}

/** Create the five boxes. Runs once per `SnailMethod`. */
function createHandles(ctx: SnailContext): void {
  const { dataKey, codeKey, messageKey } = ctx.serverOptions;
  ensureHandle(ctx, dataKey, undefined);
  ensureHandle(ctx, codeKey, undefined);
  ensureHandle(ctx, messageKey, undefined);
  ensureHandle(ctx, LOADING_KEY, false);
  ensureHandle(ctx, ERROR_KEY, undefined);
}

/** Write one box, ignoring a key this plugin never created. */
function writeHandle(ctx: SnailContext, key: string, value: unknown): void {
  const handle = ctx.meta[key];
  if (handle) reactStateAdapter.write(handle as SnailStateRef, value);
}

/** Copy the envelope of the current response into the caller's boxes. */
function captureResponse(ctx: SnailContext): void {
  const response = ctx.getResponse();
  if (!response) return;

  const { dataKey, codeKey, messageKey } = ctx.serverOptions;
  writeHandle(ctx, dataKey, unwrapEnvelope(response.data, dataKey));
  writeHandle(ctx, codeKey, readKey(response.data, codeKey));
  writeHandle(ctx, messageKey, readKey(response.data, messageKey));
}

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
 */
export function useMethodState<TData = unknown>(
  method: SnailMethod<any, TData, any, any, any>
): ReactMethodState<TData> {
  const meta = method.meta;
  const { dataKey, codeKey, messageKey } = method.context.serverOptions;

  // Fixed order and fixed count — do not reorder, do not hoist into a loop.
  const data = bindHandle((meta[dataKey] ?? MISSING_HANDLE) as SnailStateRef);
  const code = bindHandle((meta[codeKey] ?? MISSING_HANDLE) as SnailStateRef);
  const message = bindHandle((meta[messageKey] ?? MISSING_HANDLE) as SnailStateRef);
  const loading = bindHandle((meta[LOADING_KEY] ?? MISSING_HANDLE) as SnailStateRef);
  const error = bindHandle((meta[ERROR_KEY] ?? MISSING_HANDLE) as SnailStateRef);

  return {
    data: data as TData | undefined,
    loading: Boolean(loading),
    error,
    code,
    message
  };
}

/**
 * Create the React adapter plugin.
 *
 * ```tsx
 * Service.use(ReactAdapter());
 *
 * const method = Service.createApi(UserApi).getUser("1");
 * const { data, loading } = useMethodState(method);
 * ```
 */
export const ReactAdapter = createPlugin<ReactAdapterOptions>({
  name: "react-adapter",
  priority: 0,

  setup() {
    return {
      initMeta(ctx) {
        createHandles(ctx);
      },

      beforeCreate(ctx) {
        writeHandle(ctx, LOADING_KEY, true);
        // A new attempt clears the previous failure; a stale error would otherwise
        // keep rendering next to data that has just loaded successfully.
        writeHandle(ctx, ERROR_KEY, undefined);
      },

      afterResponse(ctx, next) {
        captureResponse(ctx);
        return next();
      },

      onError(ctx, error) {
        // Cancellation is expected control flow, not a failure: writing it would
        // flash an error state every time a component unmounts mid-request.
        if (error instanceof SnailCancelledError) return;
        writeHandle(ctx, ERROR_KEY, error);
      },

      afterRequest(ctx) {
        writeHandle(ctx, LOADING_KEY, false);
      }
    };
  }
});
