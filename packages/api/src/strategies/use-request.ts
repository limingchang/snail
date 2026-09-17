import type { SnailStrategyCommonOptions } from "../typings/adapter";
import { noop } from "../utils/object";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/** Options accepted by {@link useRequest}. */
export interface UseRequestOptions<TData> extends SnailStrategyCommonOptions {
  /** Value `data` starts at, before the first successful send. */
  initialData?: TData;

  /**
   * Reset `data` back to `initialData` before every send.
   *
   * Off by default because the previous payload is usually still worth rendering
   * while the next one is in flight (no flicker on refresh). Turn it on for a
   * detail pane that must not show the *previous* record's data while loading the
   * next one.
   */
  resetOnSend?: boolean;
}

/**
 * What {@link useRequest} returns.
 *
 * `send` resolves with the **unwrapped payload** (`result.data`) rather than the
 * whole `SnailResult`: the envelope's `code`/`message` are already on the state
 * handles, and every caller that wants more can still reach the method's own
 * `result`.
 */
export interface UseRequestResult<
  TData,
  TArgs extends readonly unknown[] = readonly unknown[]
> extends StrategyState<TData> {
  send(...args: TArgs): Promise<TData>;
}

/**
 * Drive one api method from component state.
 *
 * ```ts
 * const user = useRequest(userApi.getUser);
 * await user.send("1");              // → payload
 * user.data.value;                   // → the same payload
 * ```
 *
 * The hook owns exactly one `SnailMethod`, built from the arguments of the first
 * send and reused afterwards. That is what keeps the reactive handles stable
 * across re-sends — see `shared/method.ts` for why a second instance would break
 * the UI — while `send("2")` still overrides the arguments per call.
 *
 * One instance also means one request at a time: `SnailMethod` resets its context
 * at the start of every `send()`, so a second `send()` issued while the first is
 * still in flight would leave the first reading a context that belongs to the
 * second. Call `abort()` first, or use `useWatcher`/`useAutoRequest`, which
 * collapse bursts for exactly this reason.
 */
export function useRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseRequestOptions<TData> = {}
): UseRequestResult<TData, TArgs> {
  const holder = createMethodHolder<TArgs, TData>(method);

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    initialData: options.initialData,
    onAbort: () => holder.abort()
  });

  const { state } = controller;

  // The common callbacks are registered as plain listeners rather than called
  // inline, so a caller can also subscribe later with `onSuccess`/`onError` and
  // both paths behave identically.
  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  async function send(...args: TArgs): Promise<TData> {
    const snail = holder.resolve(args);

    // Cleared before the request: a stale error left in place during the next
    // send would make the UI show "failed" while a fresh attempt is in flight.
    controller.resetForSend();
    if (options.resetOnSend) controller.setData(options.initialData);
    controller.setLoading(true);

    try {
      const result = await snail.send(...args);
      const payload = controller.applySuccess(result);
      controller.emitSuccess(payload);
      return payload;
    } catch (error) {
      // Cancellation is expected control flow: reporting it would mean every
      // `abort()` raised an error toast. It still settles, so `onFinish` runs.
      if (isCancellation(error)) throw error;
      controller.applyFailure(error);
      controller.emitError(error);
      throw error;
    } finally {
      controller.setLoading(false);
      controller.emitFinish();
    }
  }

  const result: UseRequestResult<TData, TArgs> = { ...state, send };

  if (options.immediate) {
    // The rejection is deliberately not propagated: no caller holds this promise,
    // so a failed immediate send would surface as an unhandled rejection instead
    // of as `state.error` (plus whatever `onError` the caller registered).
    void send(...([] as unknown as TArgs)).catch(noop);
  }

  return result;
}
