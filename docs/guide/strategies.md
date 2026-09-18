# 策略概览

**策略（strategy）是驱动一个 `SnailMethod` 的小状态机**：它替你管理 `loading`、`data`、
`error`，替你处理取消与并发，并把状态暴露成当前框架真正能渲染的句柄。装饰器回答「怎么描述一个
请求」，策略回答「怎么在界面里使用一个请求」。

```ts
import { useRequest } from "@snail-js/api/strategies";
import { userApi } from "./service";

const user = useRequest(userApi.getUser);

await user.send("1");   // → 载荷
user.data.value;        // → 同一个载荷
user.loading.value;     // false
```

## 一个入口，不 import 任何框架

策略只有一个入口 —— `@snail-js/api/strategies` —— 而它**不 import 任何框架**。框架由 server 决定：

```ts
import { Server, SnailServer } from "@snail-js/api";
import { VueRef } from "@snail-js/api/adapter/vue";

@Server({ baseURL: "/api", stateAdapter: VueRef })
class BackEnd extends SnailServer {}

const { data } = useRequest(userApi.getUser);   // data 是 Vue Ref
```

每个 hook 从它拿到的 method 上读该 server 的 `stateAdapter`，所以同一份导入清单在 Vue、React 与
无框架的应用里完全一致。旧版的三个入口（`/plain`、`/react`）已经不存在：它们唯一的差别是在
导入时往一个**进程级注册表**里安装适配器，那既是 import 副作用，也让同一个进程里的两个 server
无法使用不同的框架。

| 适配器 | 导入 | 返回的句柄是什么 | 读取时会订阅吗 |
| --- | --- | --- | --- |
| `SnailAdapter`（默认） | `@snail-js/api` | 普通 `{ value }` 盒子 | 不会 —— 值照常更新，只是不触发渲染 |
| `VueRef` | `@snail-js/api/adapter/vue` | Vue `ref()` | 会 —— Vue 的渲染副作用追踪 `.value` 的读取 |
| `ReactState` | `@snail-js/api/adapter/react` | 可订阅盒子 | 需要 `bind()` / `useBind`（`useSyncExternalStore`） |

也可以不用 server 声明，给单个 hook 显式传 `adapter`（见 `SnailStateAdapter`）：它只覆盖**这个
hook 自己的状态**，永远不改 `method.meta`。解析顺序是 `options.adapter` → 所属 server 的
`stateAdapter` → `SnailAdapter`。三种适配器的完整说明见[框架适配器](./adapters.md)。

## 共享的状态形状

```ts
interface StrategyState<TData> {
  readonly loading: SnailStateRef<boolean>;
  readonly data: SnailStateRef<TData | undefined>;
  readonly error: SnailStateRef<unknown>;
  readonly code: SnailStateRef<number | string | undefined>;
  readonly message: SnailStateRef<string | undefined>;

  abort(): void;
  update(patch: StrategyStatePatch<TData>): void;
  bind(): StrategyBoundState<TData>;

  onSuccess(callback: (data: TData) => void): () => void;
  onError(callback: (error: unknown) => void): () => void;
  onFinish(callback: () => void): () => void;
}
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `loading` | `SnailStateRef<boolean>` | 从一次 `send()` 开始到它落定 |
| `data` | `SnailStateRef<TData \| undefined>` | 最近一次**成功**发送的载荷 |
| `error` | `SnailStateRef<unknown>` | 最近一次发送的失败；**取消永远不写这里** |
| `code` | `SnailStateRef<number \| string \| undefined>` | 最近一次发送的业务 / HTTP code，失败路径也会尽力填上 |
| `message` | `SnailStateRef<string \| undefined>` | 最近一次发送的业务消息 |
| `abort()` | `() => void` | 中止在飞的请求（各 hook 对「中止」的定义略有不同，见每个 hook 自己的参考页） |
| `update(patch)` | `(patch) => void` | 直接改写状态，例如乐观更新及其回滚 |
| `bind()` | `() => StrategyBoundState<TData>` | 解出**当前值**，并在适配器支持时订阅当前组件 |
| `onSuccess` / `onError` / `onFinish` | `(cb) => () => void` | 事件订阅，返回取消订阅函数 |

```ts
interface StrategyStatePatch<TData> {
  data?: TData;
  loading?: boolean;
  error?: unknown;
  code?: number | string;
  message?: string;
}

interface StrategyBoundState<TData> {
  loading: boolean;
  data: TData | undefined;
  error: unknown;
  code: number | string | undefined;
  message: string | undefined;
}
```

`update()` 按**存在性**而不是真值判断：`update({ error: undefined })` 是调用方清除失败的方式，
`update({ loading: false })` 也不能被跳过。

`abort()` 与事件订阅都存在于**每一个** hook 上 —— 包括 `useFetcher({ withState: false })`。
一个「没有状态」的 fetcher 仍然要能回答「中止」和「结束了吗」，所以五个句柄总是被创建；惰性
创建只会把句柄交给 UI 一个「第一次请求之后才出现」的时机。

## 句柄：为什么 VUE 不需要仪式，React 需要 `bind()`

```ts
interface SnailStateRef<T = unknown> {
  value: T;             // Vue 的 Ref<T> 在结构上就满足它
}
```

句柄刻意保持最小：任何带可变 `value` 属性的东西都算。**Vue 的 `ref()` 天生就是 `{ value: T }`**，
所以 Vue 适配器几乎是纯恒等映射 —— `create` 直接返回 ref，`read` / `write` 摸 `.value`。Vue 的
渲染副作用自己追踪 `.value` 的读取，因此**写入就够了**，Vue 侧不需要 `bind()`，也不需要任何
订阅实现。

React 没有这种追踪，组件只在有人显式通知时重渲染，所以：

```ts
function bindRef<T>(adapter: SnailStateAdapter, ref: SnailStateRef<T>): T {
  return adapter.useBind?.(ref) ?? adapter.read(ref);
}
```

| 适配器 | `useBind` | `bind()` 的行为 |
| --- | --- | --- |
| `VueRef` | 未实现 | 读取 `.value`（渲染副作用自己追踪） |
| `ReactState` | `useSyncExternalStore` | **订阅当前组件并返回快照** |
| `SnailAdapter` | 未实现 | 读取 `.value`，只是不触发渲染 |

```tsx
// React：bind() 是让组件重渲染的那一步
import { ReactState } from "@snail-js/api/adapter/react";

const user = useRequest(userApi.getUser, { adapter: ReactState });
const { data, loading } = user.bind();
```

`?? ` 而不是真值判断是有意的：合法的 `false` / `0` / `""` 不能被第二次读取替换掉。

## 一个方法，多次发送

每个 hook 内部都用 `MethodHolder` 持有**唯一**一个 `SnailMethod`，第一次 `send()` 的参数被捕获，
之后复用：

```ts
interface MethodHolder<TData = unknown> {
  readonly instance: SnailRequest<TData> | undefined;
  readonly pending: boolean;
  resolve(args: readonly unknown[]): SnailRequest<TData>;
  abort(): void;
}
```

这不是优化，而是正确性要求：核心在构建 `SnailMethod` 时创建的五个 `meta` 句柄每个方法只创建
一次（[插件生命周期](./plugin-lifecycle.md)），再调用一次 `method(...args)` 会构造**第二个**
上下文和第二套 ref —— UI 会一直渲染第一个，冻结在那里。`send("2")` 仍然会用新参数覆盖本次请求，
只是不换实例。

副作用是：**一个实例意味着同一时刻只有一个请求**。`SnailMethod` 每次 `send()` 都会重置自己的
上下文，所以在第一次还在飞的时候发起第二次 `send()`，会让第一次读到一个属于第二次的上下文。
要并发就先 `abort()`，或者用 `useWatcher` / `useAutoRequest` —— 它们收敛突发调用正是为了这个。

## 公共选项

```ts
interface SnailStrategyCommonOptions {
  immediate?: boolean;             // 默认 false
  adapter?: SnailStateAdapter;     // 默认取所属 server 的 stateAdapter
  onSuccess?: (data: unknown) => void;
  onError?: (error: unknown) => void;
  onFinish?: () => void;
}
```

`SnailStrategyCommonOptions` 从包根 `@snail-js/api` 导出。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `immediate` | `false` | 创建时就发一次。`useRequest` / `useFetcher` / `useWatcher` 用**空参数**发送；`useAutoRequest` 的 `immediate` 等价于 `start()` |
| `adapter` | 所属 server 的 `stateAdapter`（再兜底 `SnailAdapter`） | 只覆盖这个 hook 自己的句柄，不影响 `method.meta` |
| `onSuccess` / `onError` / `onFinish` | 未设置 | 与 `state.onSuccess(...)` 注册的监听器走同一条路径，所以两种写法行为一致 |

`onError` **不会**为取消触发：取消是预期控制流（`abort()`、策略丢弃过期响应），不是失败。上报
它只会让每次用户主动中止都弹一个错误提示。

## 有哪些 hook

| Hook | 一句话 | 参考 |
| --- | --- | --- |
| `useRequest` | 一个方法 + 状态句柄，手动 `send()` | [参考](./strategies/use-request.md) |
| `useWatcher` | 被监视的值变化时重发，带 debounce / throttle | [参考](./strategies/use-watcher.md) |
| `useFetcher` | 无视图的请求：预取、SSR、静默刷新 | [参考](./strategies/use-fetcher.md) |
| `usePagination` | 分页 / 无限滚动 | [参考](./strategies/use-pagination.md) |
| `useAutoRequest` | 轮询 + 焦点 / 重连 / 可见性刷新 | [参考](./strategies/use-auto-request.md) |
| `useRetriableRequest` | 指数退避重试，返回尝试次数 | [参考](./strategies/use-retriable-request.md) |
| `useUploader` | 有界并发的文件上传与进度 | [参考](./strategies/use-uploader.md) |
| `useTokenAuth` | Bearer token + 单飞刷新（返回的是**插件**） | [参考](./strategies/use-token-auth.md) |
| `useSSE` | 把 SSE 端点消费成响应式状态 | [参考](./strategies/use-sse.md) |
| `useDownload` | 服务端签发 URL、浏览器执行下载 | [参考](./strategies/use-download.md) |

**每一个 hook 都有一页自己的参考**：用途、真实默认值、返回表、完整示例与边界。首页只列「有哪些」，
不再把十个签名堆在一起。

还有两个底层导出，插件作者与自定义策略会用到：`createStrategyState`（自己拼一个状态机）以及
`MethodHolder` / `SnailRequest` / `StrategyMethod` 这组类型。

## 相关

- 每个 hook 的签名、选项表、返回表与完整示例：[`useRequest`](./strategies/use-request.md)、
  [`useWatcher`](./strategies/use-watcher.md)、[`useFetcher`](./strategies/use-fetcher.md)、
  [`usePagination`](./strategies/use-pagination.md)、
  [`useAutoRequest`](./strategies/use-auto-request.md)、
  [`useRetriableRequest`](./strategies/use-retriable-request.md)、
  [`useUploader`](./strategies/use-uploader.md)、
  [`useTokenAuth`](./strategies/use-token-auth.md)、[`useSSE`](./strategies/use-sse.md)、
  [`useDownload`](./strategies/use-download.md)
- [框架适配器](./adapters.md)：`bind()` 与 `useMethodState` 的关系
- [在服务端运行](./server-side.md)：SSR 与脚本里用哪个适配器
- [方法事件](./events.md)：状态句柄之外的五个请求事件
- [错误处理](./errors.md#取消)：为什么取消要单独区分
