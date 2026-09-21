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
 * React 状态适配器。
 *
 * `create` 返回一个可订阅的盒子；组件在渲染期间调用 `useBind` 来订阅并重新渲染。
 * 因此策略既能在组件里工作（通过 `useBind`），也能在事件处理器里工作（通过
 * `read`）。
 *
 * 本模块是库中唯一导入 `react` 的地方，且只能通过
 * `@snail-js/api/adapter/react` 子路径触达。
 *
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
  /**
   * 适配器标识符，出现在错误信息中。
   *
   * Adapter identifier, used in error messages.
   */
  name: "react",

  /**
   * 创建一个可订阅的状态盒子：值、版本号与监听器集合。
   *
   * Create a subscribable state box: a value, a version counter and a listener set.
   */
  create<T>(initial: T): SnailStateRef<T> {
    const state: ReactStateBox<T> = {
      value: initial,
      version: 0,
      listeners: new Set()
    };
    return state;
  },

  /**
   * 读取当前值，不做订阅。
   *
   * Read the current value without subscribing.
   */
  read<T>(state: SnailStateRef<T>): T {
    return state.value;
  },

  /**
   * 写入值、推进版本号，然后依次通知每个监听器。
   *
   * Write the value, bump the version, then notify every listener in turn.
   */
  write<T>(state: SnailStateRef<T>, value: T): void {
    const target = box(state);
    target.value = value;
    target.version += 1;
    for (const listener of [...target.listeners]) listener();
  },

  /**
   * 订阅该状态的变化，返回取消订阅的函数。
   *
   * Subscribe to changes of this state and return an unsubscribe function.
   */
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
   * 在渲染期间读取状态，并订阅当前组件。
   *
   * 快照取的是版本号而不是值：React 用 `Object.is` 比较快照，若再次返回
   * `{ id: 1 }`，看起来就没有变化，组件也就不会重新渲染。
   *
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

  /**
   * 丢弃为该状态登记的监听器。
   *
   * Drop every listener registered for this state.
   */
  dispose<T>(state: SnailStateRef<T>): void {
    box(state).listeners.clear();
  }
};

/**
 * `{@link useMethodState}` 的返回值。
 *
 * What {@link useMethodState} returns.
 */
export interface ReactMethodState<TData = unknown> {
  /**
   * 最近一次响应解包后的载荷。
   *
   * Unwrapped payload of the most recent response.
   */
  data: TData | undefined;

  /**
   * 从 `send()` 到请求定局之间为 `true`。
   *
   * `true` between `send()` and settlement.
   */
  loading: boolean;

  /**
   * 最近一次发送的失败原因，在下一次发送开始时清空。
   *
   * Failure of the most recent send, cleared at the start of the next one.
   */
  error: unknown;

  /**
   * 最近一次响应的业务码。
   *
   * Business code of the most recent response.
   */
  code: unknown;

  /**
   * 最近一次响应的业务消息。
   *
   * Business message of the most recent response.
   */
  message: unknown;
}

/**
 * A shared placeholder so the hook order never depends on which handles exist.
 *
 * Creating it once avoids allocating a throwaway box on every render.
 */
const MISSING_HANDLE = ReactState.create<unknown>(undefined);

/**
 * 在组件内读取某个请求方法的状态，并让组件订阅它的变化。
 *
 * 五个句柄被无条件、按固定顺序绑定，因为 React 依靠调用位置识别 hook：一旦某个
 * 条件式的 `useBind` 让第二次渲染走不同分支，就会抛
 * "rendered fewer hooks than expected"。
 *
 * 要求 server 上设置 `stateAdapter: ReactState`——只有当创建这些句柄的适配器会
 * 产出可订阅盒子时，句柄才存在。
 *
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
 *
 * @param method 要读取状态的请求方法 / The request method whose state is read
 * @returns 五个句柄的实时取值 / The live values of the five handles
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
