# 请求策略 `useRequest`

把一个 `SnailMethod` 包成**手动驱动**的状态机：调用方决定什么时候发、用什么参数发，hook 负责
`loading` / `data` / `error` 与事件。它是其余策略的底座 —— `useWatcher`、`useAutoRequest`、
`useRetriableRequest` 都继承它的选项与返回形状。

```ts
function useRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseRequestOptions<TData>
): UseRequestResult<TData, TArgs>;
```

## 选项

```ts
interface UseRequestOptions<TData> extends SnailStrategyCommonOptions {
  initialData?: TData;      // 默认 undefined
  resetOnSend?: boolean;    // 默认 false
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `initialData` | `TData` | `undefined` | `data` 的初始值，也是 `resetOnSend` 复位到的值 |
| `resetOnSend` | `boolean` | `false` | 每次发送前把 `data` 复位成 `initialData`。默认关闭是因为上一份载荷通常还值得继续渲染（刷新不闪烁）；明细面板这种「不能显示上一条记录」的场景才打开 |
| `immediate` | `boolean` | `false` | 创建时用**空参数**发一次 |
| `adapter` | `SnailStateAdapter` | 全局注册的 | 显式指定适配器 |
| `onSuccess` / `onError` / `onFinish` | `(…) => void` | 未设置 | 与 `state.onSuccess(...)` 注册的监听器走同一条路径 |

公共选项的完整语义见[策略概览](../strategies.md#公共选项)。

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `send(...args)` | `(...args: TArgs) => Promise<TData>` | 发送请求，**resolve 拆包后的载荷**（`result.data`，不是 `SnailResult`） |
| 状态句柄 | `StrategyState<TData>` | `loading` / `data` / `error` / `code` / `message`，以及 `abort` / `update` / `bind` / `onSuccess` / `onError` / `onFinish` |

`send()` resolve 的是 `result.data`：信封的 `code` / `message` 已经在状态句柄上，需要更多信息可以直接
读方法自己的 `result`。

## 示例

```ts
import { useRequest } from "@snail-js/api/strategies";
import { userApi } from "./service";

const user = useRequest(userApi.getUser, {
  initialData: undefined,
  onError: (error) => console.error(error)
});

const payload = await user.send("1");
user.data.value;      // payload
user.loading.value;   // false
user.code.value;      // 业务码
user.abort();         // 中止在飞的请求
```

```tsx
// React：bind() 才会订阅当前组件
const { data, loading } = user.bind();
```

## 诚实地说，它的边界

- **每次 `send()` 先清掉上一次的 `error` / `code` / `message`，再置 `loading = true`**。所以失败的
  提示不会在重新尝试时继续挂在界面上；`data` 不会被清（除非 `resetOnSend`）。
- **同一个 hook 只持有一个 `SnailMethod`**：第一次 `send()` 的参数被捕获，后续 `send()` 不传参时
  会沿用它们。这不是优化而是正确性要求，原因见[策略概览](../strategies.md#一个方法-多次发送)。
- **一个实例意味着同一时刻只有一个请求**。`SnailMethod` 每次 `send()` 都会重置自己的上下文，所以
  在第一次还在飞的时候发起第二次 `send()`，会让第一次读到一个属于第二次的上下文（「最新者胜」，
  第一次以取消落定）。要并发就先 `abort()`，或者用 `useWatcher` / `useAutoRequest`。
- `immediate: true` 会用**空参数**立即发送一次，且那次 promise 的拒绝被刻意吞掉（没有调用方持有
  它）：失败只会出现在 `error` 与 `onError` 上，不会变成 unhandled rejection。参数装饰器无法满足时
  这一次同样会失败在 `error` 里。
- **取消不是失败**：`abort()` 不写 `error`、不触发 `onError`，但仍然触发 `onFinish`，而 `send()`
  本身会 reject 一个 `SnailCancelledError`。

::: warning `immediate` 不是 `useAutoRequest` 的 `start()`
`immediate: true` 只发**一次**。需要轮询请用 [`useAutoRequest`](./use-auto-request.md)，或自己调用
`send()`。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、三个入口、公共选项
- [`useWatcher`](./use-watcher.md)：被监视的值变化时重发（突发合并）
- [`useFetcher`](./use-fetcher.md)：不需要状态句柄的请求
- [`usePagination`](./use-pagination.md)：分页与无限滚动
