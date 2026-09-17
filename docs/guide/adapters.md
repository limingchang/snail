# 框架适配器 `VueAdapter` / `ReactAdapter`

适配器插件把每次请求的状态镜像到 `method.meta` 上，变成一个 UI 可以直接渲染的响应式句柄。
装上它之后，组件里不需要自己写 `ref()`、不需要自己 `watch`，也不需要手写组合式函数。

```ts
import { VueAdapter } from "@snail-js/api/plugins/vue";
```
```ts
import { ReactAdapter, useMethodState } from "@snail-js/api/plugins/react";
```

::: danger 这两个插件**不在** `@snail-js/api/plugins` 里
它们在各自专属的子路径下：

```ts
import { VueAdapter } from "@snail-js/api/plugins/vue";
import { ReactAdapter, useMethodState } from "@snail-js/api/plugins/react";
```

`@snail-js/api/plugins` 只导出与框架无关的插件：cache、interceptor、validate、transform、
versioning。原因是**打包器的工作方式**，不是组织偏好：如果那个 barrel 再导出这两个适配器，
它就会**静态** import `vue` 和 `react` —— 于是一个只想要 `Cache` 的 React 应用会因为解析不到
`vue` 而直接构建失败，一个与框架无关的应用则会把两个框架都拖进 bundle。分成独立子路径，可选
peer 才真的可选。这也是 `package.json` 里 `exports` 会同时列出
`./plugins`、`./plugins/vue`、`./plugins/react` 的原因。
:::

真实子路径映射（来自 `packages/api/package.json` 的 `exports`）：

| 子路径 | 内容 | 可选的 peer |
| --- | --- | --- |
| `@snail-js/api` | 核心 + 装饰器 | `axios` |
| `@snail-js/api/plugins` | cache、interceptor、transform、validate、version | `zod`（仅 validate） |
| `@snail-js/api/plugins/vue` | `VueAdapter` | `vue` |
| `@snail-js/api/plugins/react` | `ReactAdapter`、`useMethodState` | `react` |
| `@snail-js/api/strategies` | 全部策略，装好 Vue 适配器 | `vue` |
| `@snail-js/api/strategies/plain` | 全部策略，无框架 | — |
| `@snail-js/api/strategies/react` | 全部策略，装好 React 适配器 | `react` |

## 共同的镜像规则

两个适配器的钩子逐条相同，唯一的差别是句柄的实现。`priority: 0`。

| 钩子 | 做的事 |
| --- | --- |
| `initMeta` | 创建 5 个句柄：`dataKey`、`codeKey`、`messageKey`（取自 server 选项）、`loading`、`error` |
| `beforeCreate` | `loading = true`，`error = undefined`（新的一次尝试清掉上一次的失败） |
| `afterResponse` | 拆出信封，写 `data` / `code` / `message`，然后 `next()` |
| `onError` | 写 `error`，但**跳过** `SnailCancelledError` |
| `afterRequest` | `loading = false` |

句柄的键名不是硬编码的 `data`：`dataKey` / `codeKey` / `messageKey` 来自
`@Server({ dataKey: "result" })` 之类的声明，适配器严格镜像 server 已经声明的键。
`loading` 与 `error` 是两个**固定的**键，不属于信封。

::: tip 为什么句柄在 `initMeta` 里创建
`initMeta` 在 `SnailMethod` **构造时**只跑一次，而 `beforeCreate` 每次 `send()` 都跑。在
per-send 钩子里 `ref()` 是「列表永远渲染第一页」那个经典 bug 的成因：UI 抓到的是 ref #1，第二次
发送却写进了 ref #2。句柄在这里创建、之后只被**写入**，所以调用方持有的对象在整个方法生命周期
内保持同一个身份。

两个适配器都带 `ensureHandle` 守卫，因为 `send()` 在上下文早于插件安装时重建的情况下会再跑一次
`initMeta` —— 那时重建 ref 会静默地把 UI 正在渲染的东西摘掉。
:::

`ctx.meta` 是**调用方可见**的，所以每个句柄都在它的值成立的那一刻被写入：载荷在响应到达后
（早于 `success` 事件，因此监听器读到的 `meta.data` 一定是新的）、错误早于 `error` / `codeError`
事件、`loading` 放在 `afterRequest` —— 它在 `finally` 里，成功、失败、取消一视同仁。

## `VueAdapter`

```ts
import { VueAdapter } from "@snail-js/api/plugins/vue";
import { Service } from "./service";

Service.use(VueAdapter());

const user = Service.createApi(UserApi).getUser("1");
user.meta.loading.value;   // false —— 立刻可渲染

await user.send();
user.meta.data.value;      // 拆包后的载荷
user.meta.error.value;     // undefined，或者失败原因
```

`VueAdapter()` 不接受任何选项：它镜像 server 已经声明的三个键、外加两个固定键，没有东西需要
配置。一个「每个插件自己再配一套键」的选项只会在 UI 渲染 `undefined` 而载荷就在隔壁键上时
结束。`VueAdapterOptions` 仍然作为空接口存在，好让未来加选项时不破坏现有的每个 `VueAdapter()`
调用点。

Vue 侧不需要任何额外仪式：`ref()` 天生就是 `{ value: T }`，所以这些句柄就是普通的 Vue ref，
模板里直接 `.value`（或在 `<script setup>` 里解构后用）。

## `ReactAdapter` + `useMethodState`

```tsx
import { ReactAdapter, useMethodState } from "@snail-js/api/plugins/react";
import { Service } from "./service";

Service.use(ReactAdapter());

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
```

```ts
interface ReactMethodState<TData = unknown> {
  data: TData | undefined;
  loading: boolean;
  error: unknown;
  code: unknown;
  message: unknown;
}
```

### 为什么 React 需要自己的入口

Vue 的 `ref()` 由读取 `.value` 的渲染副作用自己追踪，所以**写入就够了**。React 没有这种追踪：
组件只会在有人显式通知它时重新渲染。于是 React 适配器分配的是**可订阅的盒子**（带一个单调
递增的 `version` 与一个监听器集合），并用 `useSyncExternalStore` 实现 `useBind` —— 也就是
`bind()` 在渲染期间调用的东西。

### 三个必须记住的约束

::: warning 只能在渲染期间调用，且句柄数量固定
React 靠**调用位置**识别 hook：条件式调用 `useBind`，第二次渲染一旦走另一个分支就会抛
「rendered fewer hooks than expected」。所以 `useMethodState` **无条件、按固定顺序**绑定 5 个
句柄，缺句柄时用一个共享的 `MISSING_HANDLE` 占位 —— 缺句柄不能意味着「少调一个 hook」。
:::

1. **`method` 要 memo**：`userApi.getUser(id)` 每次渲染都返回一个新的 `SnailMethod`，而
   `useMethodState` 绑定的是那个实例的盒子。用 `useMemo`（或把 method 提到组件外）。
2. **`data` 可能是 `undefined`**：它读的是实时盒子，而不是一次成功的结果，所以类型上带
   `| undefined`；`loading` 被显式 `Boolean()` 过。
3. **快照是版本号而不是值**：React 用 `Object.is` 比较快照，如果直接返回 `{ id: 1 }`，两次渲染
   看起来一样，组件就不会重渲染。版本号保证每次写入都触发一次重渲染。

## 适配器插件 vs 策略入口

同一份运行时适配器（`src/adapter/vue.ts` / `src/adapter/react.ts`）会被两处使用，它们解决的是
两个不同的问题：

| | 适配器**插件** | 策略**入口** |
| --- | --- | --- |
| 导入 | `@snail-js/api/plugins/vue` | `@snail-js/api/strategies` |
| 安装什么 | `VueAdapter()` 插件，写 `ctx.meta` | 全局 state adapter（`setStateAdapter`） |
| 谁受益 | `method.meta.data` 这类**直接读方法**的用法 | `useRequest()` 等策略返回的句柄 |
| 是否需要 | 不用策略、只读 `meta` 时需要 | 用策略时需要 |

两者可以同时使用，互不冲突：插件管 `ctx.meta`，注册表管策略句柄。忘了装插件、却去读
`method.meta.data` 时，读到的是 `undefined` 而请求其实成功了 —— 这是最常见的「适配器没生效」
症状。

## 相关

- [策略概览](./strategies.md)：句柄契约 `SnailStateRef` 与 `bind()`
- [插件生命周期](./plugin-lifecycle.md)：`initMeta` 为什么只跑一次
- [Vue 3 完整示例](/examples/vue)：手写组合式函数与插件的对比
- [TypeScript 配置](./typescript.md)：`exports` 映射与模块解析
