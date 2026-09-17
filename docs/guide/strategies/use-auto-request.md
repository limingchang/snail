# 请求策略 `useAutoRequest`

让请求自己保持新鲜：轮询，加上仪表盘真正需要的三种「用户回来了」信号（焦点 / 重连 / 可见性）。

```ts
function useAutoRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseAutoRequestOptions<TData>
): UseAutoRequestResult<TData, TArgs>;
```

## 选项

```ts
interface UseAutoRequestOptions<TData> extends UseRequestOptions<TData> {
  pollingInterval?: number;
  enableFocusRefresh?: boolean;
  enableReconnectRefresh?: boolean;
  refreshOnVisible?: boolean;
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `pollingInterval` | `number` | 未设置（等价 `0`，即不轮询） | 轮询间隔（毫秒）。**下一次只在本次落定之后才排期**，所以后端比间隔更慢时排队长度是 1，而不是不断堆叠 |
| `enableFocusRefresh` | `boolean` | `false` | 窗口重新获得焦点时刷新（`window` 的 `focus`） |
| `enableReconnectRefresh` | `boolean` | `false` | 网络恢复时刷新（`window` 的 `online`） |
| `refreshOnVisible` | `boolean` | `false` | 标签页重新可见时刷新（`document` 的 `visibilitychange`，只在 `visibilityState !== "hidden"` 时） |
| 其余 | — | — | 继承 `UseRequestOptions`（`initialData` / `resetOnSend` / `immediate` / 公共选项） |

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `running` | `SnailStateRef<boolean>` | 在 `start()` 与 `stop()` 之间为 `true` |
| `start()` | `() => void` | 开始轮询并挂上刷新监听；**同时立刻发一次请求**（用 `refresh()`，因此沿用上一次的发送参数） |
| `stop()` | `() => void` | 停止轮询并移除本 hook 注册的**每一个**监听器 |
| `refresh()` | `() => Promise<TData>` | 复用上一次发送的参数立即请求一次 |
| `dispose()` | `() => void` | `stop()` + 一个永久标记：dispose 之后 `start()` 被忽略 |
| `send(...args)` | `(...args: TArgs) => Promise<TData>` | 继承自 `useRequest`，可手动带参数发送 |
| 状态句柄 | `StrategyState<TData>` | 与 `useRequest` 相同 |

## 示例

```ts
import { useAutoRequest } from "@snail-js/api/strategies";
import { statsApi } from "./service";

const stats = useAutoRequest(statsApi.get, {
  pollingInterval: 5000,
  refreshOnVisible: true,
  enableReconnectRefresh: true
});

stats.start();
stats.running.value;    // true

// 组件卸载时：
stats.dispose();
```

## 诚实地说，它的边界

- **`stop()` 是唯一的释放点**：它同时停掉轮询定时器并移除所有监听器，所以卸载的视图不会再被一个
  focus 处理器吊住。`start()` 会重新武装两者。
- 刷新监听器在**创建时**就挂上，而不是在 `start()` 里 —— 一个唯一职责是「用户回来就刷新」的 hook
  不应该还需要额外调用一次；只有轮询本身受 `start()` / `stop()` 控制。代价是：创建即注册，
  `dispose()` 之前它们一直有效。
- 定时器在 Node 上会被 `unref()`，不会让进程或测试 worker 一直活着。
- `window` / `document` 是**惰性**查找的，可能不存在，所以在 SSR 里创建这个 hook 是无害的（监听器
  注册会安静地失败）。
- `immediate: true` 等价于立刻 `start()`（而 `useAutoRequest` 内部固定给 `useRequest` 传
  `immediate: false`，所以不会发两次）。
- `refresh()` 在**任何 `send()` 之前**被调用时没有任何参数：方法声明的 `@Params` 无法满足时这一次
  会失败 —— 与 `immediate` 的契约一致。
- 轮询的失败已经写进 `error` 与 `onError`，并且被吞掉：一次失败的轮询不会变成 unhandled rejection，
  也不会中断下一次排期。

::: warning 没有 `pollingInterval` 时 `start()` 只发一次
`pollingInterval` 缺失或不是正数时 `schedule()` 直接返回：`start()` 仍然会立刻请求一次、仍然会挂上
你打开的那几个刷新监听，但**不会有周期**。这是刻意的（0 间隔会变成锤击循环）。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、三个入口、公共选项
- [`useRequest`](./use-request.md)：它内部委托的就是这个状态机
- [`useRetriableRequest`](./use-retriable-request.md)：把失败的那一次自己修好
