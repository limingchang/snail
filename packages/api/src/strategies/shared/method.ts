import type { AxiosProgressEvent } from "axios";
import type { SnailMethod } from "../../core/method";

/**
 * 代理后的 api 方法——正是 `Service.createApi(UserApi).getUser` 本身。
 *
 * 调用它只是**构建**请求（不发网络）；`send()` 才真正执行。策略需要的是这个可调用对象，
 * 而不是已经构建好的 `SnailMethod`，因为它必须能用不同参数重新发送；也因为转发参数元组
 * 的策略可以保持 api 类自身签名不变。
 *
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

/**
 * 策略驱动的 `SnailMethod`，其载荷类型已被收窄。
 *
 * The `SnailMethod` a strategy drives, with its payload type narrowed.
 */
export type SnailRequest<TData = unknown> = SnailMethod<any, TData, any, any, any>;

/**
 * 持有 hook 在多次发送间复用的那唯一一个 `SnailMethod`。
 *
 * `docs/guide/plugin-lifecycle.md` §4.3 明确指出 `initMeta` 每个 method 只运行一次，而不是
 * 每次发送一次，因此 UI 捕获到的响应式句柄在重复发送之间保持同一。再次调用
 * `method(...args)` 会构建出带第二套 ref 的*第二个*上下文——UI 会继续渲染第一个、已冻结
 * 的那套。这个持有者正是让「一个实例，多次发送」成为默认行为、而不是每个 hook 作者都必须
 * 记住的规则的东西。
 *
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
  /**
   * 驱动每次发送的实例；第一次发送之前为 `undefined`。
   *
   * The instance driving every send, or `undefined` before the first one.
   */
  readonly instance: SnailRequest<TData> | undefined;

  /**
   * 当本持有者的 method 有请求在途时为 `true`。
   *
   * `true` while this holder's method has a request in flight.
   */
  readonly pending: boolean;

  /**
   * 获取或创建实例。只有第一次调用的参数会被捕获。
   *
   * Get-or-create the instance. Only the first call's arguments are captured.
   */
  resolve(args: readonly unknown[]): SnailRequest<TData>;

  /**
   * 取消在途请求（如果有）。第一次发送之前是空操作。
   *
   * Cancel the in-flight request, if any. A no-op before the first send.
   */
  abort(): void;
}

/**
 * 围绕一个代理 api 方法创建 {@link MethodHolder}。
 *
 * Create a {@link MethodHolder} around a proxied api method.
 *
 * @param method 代理后的 api 方法 / The proxied api method.
 * @returns 复用同一个 `SnailMethod` 实例的持有者 / A holder reusing one `SnailMethod` instance.
 */
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
 * 为单个请求附加上传进度回调。
 *
 * 核心在构建 `SnailMethod` 时从 `@UploadProgress(...)` 元数据解析 `onUploadProgress`，
 * 那是每个 method 一次——而不是每个文件一次。要按请求改变它，这里改为写入**当前生效的**
 * axios config。
 *
 * 时机是关键：`send()` 在第一次 `await` 之前同步调用 `begin()`，因此这里读到的 config
 * 就是 axios 将要发送的那一份。在 `send()` 之前调用会被 `begin()` 静默覆盖，在某个
 * `await` 之后调用则已经太晚。
 *
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
 * @returns 无实时 config 可附加时返回 `false` / `false` when there was no live config to attach to.
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
