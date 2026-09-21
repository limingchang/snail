import { getMethodContext } from "../../core/method-context";
import { SnailAdapter } from "../../adapter/plain";
import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";

/**
 * 解析某个策略实例应当使用的 state adapter。
 *
 * 优先级及原因：
 *
 * 1. **`options.adapter`**——每次 hook 的显式覆盖，优先级最高，这样一个特殊的 hook
 *    可以与其所在 server 不同，而不需要第二个 server 类。
 * 2. **所属 server 的 `stateAdapter`**——从传入的 method 工厂上读取。这是常规路径：
 *    用 `@Server({ stateAdapter: VueRef })` 声明一次框架，所有 hook 都会一致。
 * 3. **`SnailAdapter`**——与框架无关的回退，用于手工构造的代理，或上下文读不到的方法。
 *
 * ## 为什么是 server 而不是模块级全局
 *
 * 这里曾经读取一个进程级注册表，由各策略入口以 import 副作用写入。那让框架选择依赖导入
 * 顺序——导入一个入口点会悄悄重配其它所有 server——也让同一个 bundle 里无法存在两个使用
 * 不同框架的 server。改为从方法自己的 server 解析同时解决了这两点，而且每个 hook 只解析
 * **一次**，因此一组句柄绝不会混用两个 adapter。
 *
 * Resolve the state adapter one strategy instance should use.
 *
 * Precedence, and why:
 *
 * 1. **`options.adapter`** — an explicit per-hook override. Wins outright, so a
 *    single exotic hook can differ from its server without a second server class.
 * 2. **The owning server's `stateAdapter`** — read from the method factory that was
 *    passed in. This is the normal path: declare your framework once with
 *    `@Server({ stateAdapter: VueRef })` and every hook agrees.
 * 3. **`SnailAdapter`** — the framework-free fallback, for a proxy built by hand or
 *    a method whose context could not be read.
 *
 * ## Why the server, and not a module global
 *
 * This used to read a process-wide registry that the strategies entry points set as
 * an import side effect. That made the framework choice order-dependent — importing
 * one entry point silently reconfigured every other server — and made two servers
 * with different frameworks impossible in one bundle. Resolving from the method's
 * own server fixes both, and it resolves **once per hook**, so one set of handles
 * can never mix two adapters.
 *
 * @param options 含可选 `adapter` 覆盖的选项 / Options with an optional `adapter` override.
 * @param method 用于解析所属 server 的代理方法 / The proxied method whose server is consulted.
 * @returns 生效的 state adapter / The state adapter in effect.
 */
export function resolveStateAdapter(
  options: { adapter?: SnailStateAdapter } = {},
  method?: unknown
): SnailStateAdapter {
  return (
    options.adapter ??
    getMethodContext(method)?.serverOptions.stateAdapter ??
    SnailAdapter
  );
}

/**
 * 读取当前渲染所需的句柄。
 *
 * `useBind` 是为那些只在显式订阅时才重新渲染的框架准备的（React 的
 * `useSyncExternalStore`）；Vue 自己追踪 `.value` 访问，因此其 adapter 省略该方法，
 * 读取本身就是全部。这里用 `??` 回退而不是真值判断，以免合法的 `false`、`0` 或 `""`
 * 被替换成第二次读取。
 *
 * Read a handle for the current render.
 *
 * `useBind` exists for frameworks that only re-render on an explicit
 * subscription (React's `useSyncExternalStore`); Vue tracks the `.value` access
 * itself, so its adapter omits the method and the read is the whole story. The
 * `??` fallback — rather than a truthiness check — keeps a legitimate `false`,
 * `0` or `""` from being replaced by a second read.
 *
 * @param adapter 生效的 state adapter / The state adapter in effect.
 * @param ref 要读取的状态句柄 / The state handle to read.
 * @returns 句柄的当前值 / The handle's current value.
 */
export function bindRef<T>(adapter: SnailStateAdapter, ref: SnailStateRef<T>): T {
  return adapter.useBind?.(ref) ?? adapter.read(ref);
}
