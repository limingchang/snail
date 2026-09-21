import type { SnailStrategyCommonOptions } from "../typings/adapter";
import { noop } from "../utils/object";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/**
 * {@link useRequest} 接受的选项。
 *
 * Options accepted by {@link useRequest}.
 */
export interface UseRequestOptions<TData> extends SnailStrategyCommonOptions {
  /**
   * `data` 的起始值，在第一次成功发送之前使用。
   *
   * Value `data` starts at, before the first successful send.
   */
  initialData?: TData;

  /**
   * 每次发送之前把 `data` 重置回 `initialData`。
   *
   * 默认关闭，因为上一份载荷在下一次请求在途时通常仍然值得渲染（刷新时不闪烁）。当一个
   * 详情面板在加载下一条记录时绝不能显示*上一条*记录的数据时，打开它。
   *
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
 * {@link useRequest} 的返回值。
 *
 * `send` 以**解包后的载荷**（`result.data`）兑现，而不是整个 `SnailResult`：信封上的
 * `code`/`message` 已经在 state 句柄上，想要更多的调用方仍然可以拿到 method 自己的
 * `result`。
 *
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
  /**
   * 发送请求，以解包后的载荷兑现。
   *
   * Send the request. Resolves with the unwrapped payload.
   */
  send(...args: TArgs): Promise<TData>;
}

/**
 * 用组件状态驱动一个 api 方法。
 *
 * hook 只拥有一个 `SnailMethod`，它由第一次 send 的参数构建，之后一直复用。这正是让响应
 * 式句柄在重复发送之间保持稳定的原因——为什么第二个实例会破坏 UI 见 `shared/method.ts`
 * ——而 `send("2")` 仍然会按调用覆盖参数。
 *
 * 一个实例也意味着同一时间只有一个请求：`SnailMethod` 在每次 `send()` 开始时重置自己的
 * 上下文，因此第一次仍在途时发起的第二次 `send()`，会让第一次读到一个属于第二次的上下文。
 * 请先调用 `abort()`，或改用 `useWatcher`/`useAutoRequest`——它们正是为此折叠突发调用。
 *
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
 *
 * @param method 代理后的 api 方法 / The proxied api method.
 * @param options 策略选项 / Strategy options.
 * @returns 带 state 句柄与 `send` 的结果 / The result carrying the state handles and `send`.
 */
export function useRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseRequestOptions<TData> = {}
): UseRequestResult<TData, TArgs> {
  const holder = createMethodHolder<TArgs, TData>(method);

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    method,

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
