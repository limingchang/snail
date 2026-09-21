import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";
import { Emitter } from "../../utils/emitter";
import { bindRef, resolveStateAdapter } from "./adapter";
import { readErrorCode, readErrorMessage } from "./error";

/**
 * {@link StrategyState.update} 接受的部分写入。
 *
 * Partial write accepted by {@link StrategyState.update}.
 */
export interface StrategyStatePatch<TData> {
  /**
   * 要写入 `data` 的值。
   *
   * The value to write into `data`.
   */
  data?: TData;
  /**
   * 要写入 `loading` 的值。
   *
   * The value to write into `loading`.
   */
  loading?: boolean;
  /**
   * 要写入 `error` 的值。
   *
   * The value to write into `error`.
   */
  error?: unknown;
  /**
   * 要写入 `code` 的值。
   *
   * The value to write into `code`.
   */
  code?: number | string;
  /**
   * 要写入 `message` 的值。
   *
   * The value to write into `message`.
   */
  message?: string;
}

/**
 * {@link StrategyState.bind} 返回的已解析快照。
 *
 * The resolved snapshot {@link StrategyState.bind} returns.
 */
export interface StrategyBoundState<TData> {
  /**
   * 是否有一次发送仍在进行。
   *
   * Whether a send is still in flight.
   */
  loading: boolean;
  /**
   * 最近一次成功发送的载荷。
   *
   * Payload of the most recent successful send.
   */
  data: TData | undefined;
  /**
   * 最近一次发送的失败对象。取消不会写入这里。
   *
   * Failure of the most recent send. Never set for a cancellation.
   */
  error: unknown;
  /**
   * 最近一次发送的业务/HTTP code。
   *
   * Business/HTTP code of the most recent send.
   */
  code: number | string | undefined;
  /**
   * 最近一次发送的业务信息。
   *
   * Business message of the most recent send.
   */
  message: string | undefined;
}

/**
 * 每个请求策略都暴露的 state 接口面。
 *
 * ## 为什么是句柄而不是值
 *
 * 策略无法知道自己正被 Vue 渲染副作用、React 渲染还是普通脚本读取。交回一个
 * `SnailStateRef` 让策略与框架无关：Vue 的 `Ref` 本身就满足该接口，React 走 `bind()`，
 * 脚本可以直接读 `.value`。
 *
 * ## 为什么存在 `update()`
 *
 * 乐观更新必须在服务端确认*之前*把缓存条目写进 state，并在请求失败时回滚。没有
 * `update()`，每个调用方都会伸手去碰 ref，从而绕过 adapter。
 *
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
  /**
   * 从一次发送开始到它结束期间为 `true`。
   *
   * `true` from the start of a send until it settles.
   */
  readonly loading: SnailStateRef<boolean>;

  /**
   * 最近一次成功发送的载荷。
   *
   * Payload of the most recent successful send.
   */
  readonly data: SnailStateRef<TData | undefined>;

  /**
   * 最近一次发送的失败对象。取消时绝不写入。
   *
   * Failure of the most recent send. Never set for a cancellation.
   */
  readonly error: SnailStateRef<unknown>;

  /**
   * 最近一次发送的业务/HTTP code。
   *
   * Business/HTTP code of the most recent send.
   */
  readonly code: SnailStateRef<number | string | undefined>;

  /**
   * 最近一次发送的业务信息。
   *
   * Business message of the most recent send.
   */
  readonly message: SnailStateRef<string | undefined>;

  /**
   * 中止在途请求（如果有）。
   *
   * Abort the in-flight request, if any.
   */
  abort(): void;

  /**
   * 直接打补丁——例如在乐观更新之后。
   *
   * Patch state directly — e.g. after an optimistic update.
   */
  update(patch: StrategyStatePatch<TData>): void;

  /**
   * 解析后的值；adapter 支持时会订阅当前组件。
   *
   * Resolved values, subscribing the current component when the adapter supports it.
   */
  bind(): StrategyBoundState<TData>;

  /**
   * 成功发送之后调用。返回取消订阅函数。
   *
   * Called after a successful send. Returns an unsubscribe function.
   */
  onSuccess(callback: (data: TData) => void): () => void;

  /**
   * 失败发送之后调用。取消不算失败。
   *
   * Called after a failed send. Cancellations are not failures.
   */
  onError(callback: (error: unknown) => void): () => void;

  /**
   * 一次发送结束（无论成功与否）后调用。
   *
   * Called once a send settles, successfully or not.
   */
  onFinish(callback: () => void): () => void;
}

/**
 * state controller 发出的事件。
 *
 * 用类型别名而不是接口，是为了满足 `Emitter` 要求的 `Record<string, unknown>` 约束——
 * 接口不会获得隐式索引签名。
 *
 * Events a state controller emits.
 *
 * A type alias rather than an interface so it satisfies the `Record<string,
 * unknown>` constraint `Emitter` requires — interfaces do not get implicit index
 * signatures.
 */
export type StrategyStateEvents<TData> = {
  /**
   * 一次成功发送后，以解包后的载荷触发。
   *
   * Emitted with the unwrapped payload after a successful send.
   */
  success: TData;
  /**
   * 一次失败发送后，以错误对象触发。取消不会触发它。
   *
   * Emitted with the error after a failed send. A cancellation does not emit it.
   */
  error: unknown;
  /**
   * 一次发送结束（无论成功与否）后触发，不带载荷。
   *
   * Emitted with no payload once a send settles, successfully or not.
   */
  finish: undefined;
};

/**
 * {@link createStrategyState} 接受的选项。
 *
 * Options accepted by {@link createStrategyState}.
 */
export interface StrategyStateOptions<TData> {
  /**
   * 这些句柄使用的 state adapter。
   *
   * State adapter for these handles.
   */
  adapter?: SnailStateAdapter;
  /**
   * 本 hook 驱动的代理方法。
   *
   * 仅用于读取所属 server 的 `stateAdapter`，因此 hook 继承其 server 声明的框架，而不是
   * 去查进程级全局。
   *
   * The proxied method this hook drives.
   *
   * Used only to read the owning server's `stateAdapter`, so a hook inherits the
   * framework its server declared rather than consulting a process-wide global.
   */
  method?: unknown;
  /**
   * `data` 的起始值。默认 `undefined`。
   *
   * Value `data` starts at. Defaults to `undefined`.
   */
  initialData?: TData;
  /**
   * 由 `state.abort()` 调用。什么算「abort」由 hook 决定。
   *
   * Invoked by `state.abort()`. The hook owns what "abort" means.
   */
  onAbort?: () => void;
}

/**
 * {@link StrategyState} 加上只有 hook 才该使用的写入侧。
 *
 * 把这些写入方法挡在调用方可见对象之外，是防止应用代码在请求途中乱改 `data` 的关键：
 * 句柄可读，状态迁移不可写。
 *
 * The {@link StrategyState} plus the write side only the hook should use.
 *
 * Keeping the writers off the caller-visible object is what stops application code
 * from poking `data` mid-flight: the handle is readable, the transitions are not.
 */
export interface StrategyStateController<TData> {
  /**
   * 创建这些句柄的 state adapter。
   *
   * The state adapter that created these handles.
   */
  readonly adapter: SnailStateAdapter;
  /**
   * 调用方可见的 state 接口面。
   *
   * The caller-visible state surface.
   */
  readonly state: StrategyState<TData>;

  /**
   * 写入 `loading`。
   *
   * Write `loading`.
   */
  setLoading(value: boolean): void;
  /**
   * 写入 `data`。
   *
   * Write `data`.
   */
  setData(value: TData | undefined): void;
  /**
   * 写入 `error`。
   *
   * Write `error`.
   */
  setError(value: unknown): void;
  /**
   * 写入 `code`。
   *
   * Write `code`.
   */
  setCode(value: number | string | undefined): void;
  /**
   * 写入 `message`。
   *
   * Write `message`.
   */
  setMessage(value: string | undefined): void;

  /**
   * 在发送开始时清空失败字段。`data` 保持不变。
   *
   * Clear the failure fields at the start of a send. `data` is left alone.
   */
  resetForSend(): void;

  /**
   * 用成功结果写入 `data`/`code`/`message` 并清空 `error`。
   *
   * Write `data`/`code`/`message` from a successful result and clear `error`.
   */
  applySuccess(result: {
    data: TData;
    code?: number | string | undefined;
    message?: string | undefined;
  }): TData;

  /**
   * 写入 `error`——外加错误携带的 code/message。
   *
   * Write `error` — plus the code/message the error carries.
   */
  applyFailure(error: unknown): void;

  /**
   * 触发 `success` 事件。
   *
   * Emit the `success` event.
   */
  emitSuccess(data: TData): void;
  /**
   * 触发 `error` 事件。
   *
   * Emit the `error` event.
   */
  emitError(error: unknown): void;
  /**
   * 触发 `finish` 事件。
   *
   * Emit the `finish` event.
   */
  emitFinish(): void;

  /**
   * 释放 adapter 资源并丢弃所有监听器。
   *
   * Release adapter resources and drop every listener.
   */
  dispose(): void;
}

/** `true` when `key` was explicitly provided, even with an `undefined` value. */
function hasKey(source: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

/**
 * 为单个 hook 构建 state 句柄、监听器与写入方法。
 *
 * 五个 ref 都在这里创建，即使某个 hook 用不到它们：`useFetcher({ withState: false })`
 * 仍然要能响应 `abort()` 和 `onFinish()`，而惰性创建 state 会把「第一次请求之后才出现」
 * 的句柄交给 UI。
 *
 * Build the state handles, the listeners and the writers for one hook.
 *
 * All five refs are created here, even for a hook that will not use them: a
 * `useFetcher({ withState: false })` still has to answer `abort()` and
 * `onFinish()`, and creating state lazily would hand the UI handles that appear
 * only after the first request.
 *
 * @param options state 选项 / The state options.
 * @returns 句柄已接好的 controller / The controller with its handles wired up.
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
