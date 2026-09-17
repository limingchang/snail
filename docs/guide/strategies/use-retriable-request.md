# 请求策略 `useRetriableRequest`

会自愈的请求：指数退避重试，并把「实际打了几次网络」暴露成状态。

```ts
function useRetriableRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseRetriableRequestOptions<TData>
): UseRetriableRequestResult<TData, TArgs>;
```

## 选项

```ts
interface UseRetriableRequestOptions<TData> extends UseRequestOptions<TData>, RetryOptions {
  retryOn?: (error: unknown, attempt: number) => boolean;
}

interface RetryOptions {
  retries?: number;      // 默认 3
  delayMs?: number;      // 默认 1000
  maxDelayMs?: number;   // 默认 30000
  factor?: number;       // 默认 2
  jitter?: boolean;      // 默认 true
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `retries` | `number` | `3` | 第一次失败之后的**额外**尝试次数（总次数 = `retries + 1`）；负数被夹到 0 |
| `delayMs` | `number` | `1000` | 首次延迟；负数被夹到 0 |
| `maxDelayMs` | `number` | `30000` | 单次延迟上限 |
| `factor` | `number` | `2` | 每次失败后的倍数；小于 1 被夹到 1 |
| `jitter` | `boolean` | `true` | 抖动：`base/2 + random * base/2`（半抖动，不是全随机 —— 全随机可能产生接近 0 的延迟，把重试风暴变成锤击循环） |
| `retryOn` | `(error, attempt) => boolean` | 除取消外都重试 | 判断一次失败是否值得再试；`attempt` 是**下一次**尝试的序号（1 起） |
| 其余 | — | — | 继承 `UseRequestOptions`（`initialData` / `resetOnSend` / 公共选项） |

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `send(...args)` | `(...args: TArgs) => Promise<TData>` | 可能打网络最多 `retries + 1` 次 |
| `attempts` | `SnailStateRef<number>` | 最近一次 `send()` 实际尝试了几次；每次 `send()` 开始时重置为 `0`，初始也是 `0` |
| 状态句柄 | `StrategyState<TData>` | 与 `useRequest` 相同 |

## 示例

```ts
import { useRetriableRequest } from "@snail-js/api/strategies";
import { api } from "./service";

const save = useRetriableRequest(api.save, {
  retries: 3,
  delayMs: 200,
  retryOn: (error, attempt) => attempt <= 2 || !(error as { status?: number }).status
});

await save.send(payload);   // 最多 4 次网络往返
save.attempts.value;        // 实际尝试次数，可上报埋点
```

## 诚实地说，它的边界

- hook 自持一个 `AbortController` 管理**两次尝试之间**的退避 —— 那一刻没有在飞请求可以取消。
  `abort()` 同时触发两者，所以在 30 秒延迟里 `abort()` 会立刻 reject，而不是让调用方的 promise 挂到
  定时器触发。
- **取消永远不重试**，也永远不写 `error`（`defaultRetryPredicate` 就是 `!isCancellation(error)`）。
- 退避期间会把这次临时失败写进 `error` 并触发 `onError`，让界面显示「重试中」而不是上一次的旧成功
  状态。
- 最终成功时 `applySuccess` 会清掉 `error`，所以「失败两次后成功」不会把陈旧失败留在屏幕上。
- 与 `useRequest` 相同的「一个实例一个请求」：重试期间再 `send()` 会让前一次以取消落定（而取消不会
  被重试）。
- `attempts` 是**状态**，不是历史：它只反映最近一次 `send()`。

::: tip 重试的是每次尝试，不是整条管线
每次尝试都重新调用 `snail.send(...)`，也就是重新走一遍插件管线（拦截器、缓存、校验都会再跑）。对
非幂等的写操作请务必用 `retryOn` 排除，或干脆不要用这个 hook —— 一个已被服务器处理但响应丢失的
POST，重试是会造成重复写入的。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、三个入口、公共选项
- [`useRequest`](./use-request.md)：不重试的手动发送
- [`useAutoRequest`](./use-auto-request.md)：周期性刷新
- [错误处理](../errors.md)：取消为什么不是失败
