# 框架适配器 `SnailAdapter` / `VueRef` / `ReactState`

框架适配器决定「请求状态用什么响应式原语表示」。它是一个 **server 选项**，不是插件，也不是
全局注册：

```ts
import { VueRef } from "@snail-js/api/adapter/vue";

@Server({ baseURL: "/api", stateAdapter: VueRef })
class BackEnd extends SnailServer {}
```

`stateAdapter` 的类型是 `SnailStateAdapter`，默认值是 `SnailAdapter` —— 后者从包根
`@snail-js/api` 导出，是一组普通的 `{ value }` 盒子：值照常更新，只是**不触发任何渲染**。

一次声明同时驱动**两个投影**：`method.meta` 上的句柄，以及每个 `use*` 策略返回的状态。

| 投影 | 谁在读 |
| --- | --- |
| `method.meta` 上的五个句柄 | 直接读方法的代码（`method.meta.data`、`method.meta.loading`） |
| 策略返回的状态 | `useRequest` / `useWatcher` / `usePagination` … 里的 `data` / `loading` / `error` |

因此不再需要「装一个插件管 `meta`、再注册一个全局管策略」这两步 —— 也就不存在两处声明互相
矛盾这回事。

## 真实的子路径映射

来自 `packages/api/package.json` 的 `exports`：

| 子路径 | 内容 | 可选的 peer |
| --- | --- | --- |
| `@snail-js/api` | 核心 + 装饰器 + `SnailAdapter` | `axios` |
| `@snail-js/api/plugins` | cache、interceptor、pool、transform、validate、version | `zod`（仅 validate） |
| `@snail-js/api/strategies` | 全部策略，**不 import 任何框架** | — |
| `@snail-js/api/adapter/vue` | `VueRef` | `vue` |
| `@snail-js/api/adapter/react` | `ReactState`、`useMethodState`、`ReactMethodState` | `react` |
| `@snail-js/api/package.json` | `package.json` 本身 | — |

::: danger `@snail-js/api/adapter/vue` 与 `@snail-js/api/adapter/react` 是仅有的、会 import 框架的模块
原因不是组织偏好，而是**打包器的工作方式**：如果这两个适配器从某个 barrel 再导出，那个 barrel
就会**静态** import `vue` 和 `react`，于是一个只想要 `Cache` 的 React 应用会因为解析不到 `vue`
而构建失败，一个与框架无关的应用则会把两个框架都拖进 bundle。

分成独立子路径之后，可选 peer 才真的可选：不 import 这两个子路径的应用永远不会打包 `vue` /
`react`。核心与 `@snail-js/api/strategies` 全程只和 `SnailStateAdapter` 接口对话。
:::

## `SnailAdapter` —— 默认值

```ts
import { SnailAdapter } from "@snail-js/api";

@Server({ baseURL: "/api" })   // 不写 stateAdapter 时，默认就是 SnailAdapter
class BackEnd extends SnailServer {}
```

显式写出来完全等价：`@Server({ baseURL: "/api", stateAdapter: SnailAdapter })`。

它的 `name` 是 `"plain"`，`create` 返回 `{ value: initial }`。值是**对的**，只是没有人被通知：
这正是测试、Node 脚本、SSR 渲染，以及「自己手动驱动请求」的应用想要的语义。

## `VueRef` —— Vue 3

```ts
import { VueRef } from "@snail-js/api/adapter/vue";
import { Service } from "./service";

@Server({ baseURL: "/api", stateAdapter: VueRef })
class BackEnd extends SnailServer {}

const user = Service.createApi(UserApi).getUser("1");
user.meta.loading;                 // Ref<boolean> —— 立刻可渲染

await user.send();
user.meta.data;                    // Ref<拆包后的载荷>
user.meta.error;                   // Ref<undefined | 失败原因>
```

Vue 的 `ref()` 天生就是 `{ value: T }`，所以 `VueRef` 几乎是纯恒等映射：`create` 直接返回
ref，`read` / `write` 摸 `.value`，另外带一个 `isState`（`isRef`）好让核心不去替换已经存在的
ref。Vue 的渲染副作用自己追踪 `.value` 的读取，因此**写入就够了** —— 没有 `subscribe`，也没有
`useBind`。

## `ReactState` + `useMethodState` —— React

```tsx
import { ReactState, useMethodState } from "@snail-js/api/adapter/react";
import { Service } from "./service";

@Server({ baseURL: "/api", stateAdapter: ReactState })
class BackEnd extends SnailServer {}

function User({ id }: { id: string }) {
  const method = useMemo(() => userApi.getUser(id), [id]);
  const { data, loading, error } = useMethodState(method);

  useEffect(() => {
    void method.send();
  }, [method]);

  if (loading) return <Spinner />;
  return <p>{error ? String(error) : data?.name}</p>;
}
```

```ts
function useMethodState<TData = unknown>(
  method: SnailMethod<any, TData, any, any, any>
): ReactMethodState<TData>;

interface ReactMethodState<TData = unknown> {
  data: TData | undefined;
  loading: boolean;
  error: unknown;
  code: unknown;
  message: unknown;
}
```

`ReactState` 的 `create` 分配的是**可订阅的盒子**（带一个单调递增的 `version` 与一个监听器
集合），`useBind` 用 `useSyncExternalStore` 订阅当前组件。

### 三个必须记住的约束

::: warning 只能在渲染期间调用，且句柄数量固定
React 靠**调用位置**识别 hook：条件式调用 `useBind`，第二次渲染一旦走另一个分支就会抛
「rendered fewer hooks than expected」。所以 `useMethodState` **无条件、按固定顺序**绑定 5 个
句柄（`data`、`code`、`message`、`loading`、`error`），缺句柄时用一个共享的 `MISSING_HANDLE`
占位 —— 缺句柄不能意味着「少调一个 hook」。
:::

1. **`method` 要 memo**：`userApi.getUser(id)` 每次渲染都返回一个新的 `SnailMethod`，而
   `useMethodState` 绑定的是那个实例的盒子。用 `useMemo`（或把 method 提到组件外）。
2. **`data` 可能是 `undefined`**：它读的是实时盒子，而不是一次成功的结果，所以类型上带
   `| undefined`；`loading` 被显式 `Boolean()` 过。
3. **快照是版本号而不是值**：React 用 `Object.is` 比较快照，如果直接返回 `{ id: 1 }`，两次渲染
   看起来一样，组件就不会重渲染。版本号保证每次写入都触发一次重渲染。

### 在渲染之外：直接订阅

`useMethodState` 是**只在渲染期可用**的。事件处理器、Effect 或非组件代码要观察某个句柄，请
直接订阅适配器：

```ts
const method = userApi.getUser("1");
const stop = ReactState.subscribe(method.meta.data, () => {
  console.log(method.meta.data.value);
});
```

`subscribe` 返回取消订阅函数；`dispose(state)` 则一次性清掉该盒子上的全部监听器。

## 写一个自己的适配器

`SnailStateAdapter` 是全部契约 —— 只要满足这个接口，任何响应式系统都能接进来：

```ts
interface SnailStateAdapter {
  readonly name: string;           // 错误消息里用的标识，如 "vue"
  create<T>(initial: T): SnailStateRef<T>;
  read<T>(ref: SnailStateRef<T>): T;
  write<T>(ref: SnailStateRef<T>, value: T): void;

  subscribe?<T>(ref: SnailStateRef<T>, listener: (value: T) => void): () => void;
  useBind?<T>(ref: SnailStateRef<T>): T;
  isState?(value: unknown): boolean;
  dispose?<T>(ref: SnailStateRef<T>): void;
}

interface SnailStateRef<T = unknown> {
  value: T;                        // Vue 的 Ref<T> 在结构上就满足它
}
```

- `name` / `create` / `read` / `write` 是必填的四个成员；
- `useBind` 只对「必须显式订阅才会重渲染」的框架需要（React 的 `useSyncExternalStore` 就住在这里）。
  `bind()` 的实现是 `adapter.useBind?.(ref) ?? adapter.read(ref)`；
- `isState` 让核心判断某个值**已经是**本框架的句柄，从而不去替换 UI 正在渲染的对象；
- `dispose` 在策略销毁时释放适配器分配的资源。

一个最小的自定义适配器（把状态接到 `Svelte` 的 store 上，或者接到一个自己的事件总线上）：

```ts
import type { SnailStateAdapter } from "@snail-js/api";

interface MyBox<T> {
  value: T;
  listeners: Set<() => void>;
}

export const MyState: SnailStateAdapter = {
  name: "my",

  create<T>(initial: T): MyBox<T> {
    return { value: initial, listeners: new Set() };
  },

  read: (ref) => ref.value,

  write(ref, value) {
    const box = ref as MyBox<typeof value>;
    box.value = value;
    for (const listener of [...box.listeners]) listener();
  },

  subscribe(ref, listener) {
    const box = ref as MyBox<unknown>;
    const wrapped = (): void => listener(ref.value);
    box.listeners.add(wrapped);
    return (): void => {
      box.listeners.delete(wrapped);
    };
  },

  isState: (value) =>
    typeof value === "object" && value !== null && "listeners" in value,

  dispose(ref) {
    (ref as MyBox<unknown>).listeners.clear();
  }
};
```

## 单个 hook 的局部覆盖

`adapter` 也在每个策略的公共选项里。它只作用于那个 hook 自己的状态，**永远不改**
`method.meta`：

```ts
import { VueRef } from "@snail-js/api/adapter/vue";
import { useRequest } from "@snail-js/api/strategies";

// server 声明的是 SnailAdapter，但这个 hook 想要 Vue ref
const { data } = useRequest(userApi.getUser, { adapter: VueRef });
```

解析顺序是：`options.adapter` → 该 method 所属 server 的 `stateAdapter` → `SnailAdapter`
兜底。所以一个 hook 可以在不新建 server 类的前提下偏离它所在 server 的框架。

## 为什么它曾经是插件 + 全局

旧设计里，同一个框架要在**两个地方**各声明一次：一个适配器插件负责把状态镜像到 `ctx.meta`，
而三个策略入口各自在 **import 时**往一个进程级注册表安装 state adapter —— 一次 import 的副作用
就悄悄重配了整个 bundle 里所有 server，同一个进程里的两个 server 也因此不可能用不同的框架。

现在句柄由**核心**在构建 `SnailMethod` 时按 `stateAdapter` 创建，策略从它拿到的 method 上读
同一个选项。直接收益是：

- 只有一个地方声明框架，两个投影不可能不一致；
- 框架的选择不再是 import 副作用，删掉一个 import 不会改变别的 server；
- **同一个进程里的两个 server 可以用不同的框架** —— 一个 Vue 管理后台和一个 React 挂件可以
  共存，这在旧设计里是不可能表达的。

## 相关

- [策略概览](./strategies.md)：句柄契约 `SnailStateRef` 与 `bind()`
- [方法事件](./events.md)：`meta` 之外，`SnailMethod` 上的五个事件
- [插件生命周期](./plugin-lifecycle.md)：`initMeta` 现在只是扩展点
- [Vue 3 完整示例](/examples/vue)：手写组合式函数与适配器的对比
- [TypeScript 配置](./typescript.md)：`exports` 映射与模块解析
