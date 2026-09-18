# 请求策略 `useFetcher`

**无视图**的请求：预取、SSR 过程、静默刷新。默认不产生任何状态句柄，所以调用它永远不会让一个
没人要求观察的 spinner 出现。

```ts
// 有状态
function useFetcher<TArgs, TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseFetcherStateOptions<TData>          // { withState: true, ... }
): UseFetcherResult<TData, TArgs>;

// 无状态（默认）
function useFetcher<TArgs, TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseFetcherOptions<TData>
): UseFetcherCore<TData, TArgs>;
```

## 选项

```ts
interface UseFetcherOptions<TData> extends SnailStrategyCommonOptions {
  withState?: boolean;      // 默认 false
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `withState` | `boolean` | `false` | 把每次请求镜像进 `loading` / `data` / `error` / `code` / `message` |
| `immediate` | `boolean` | `false` | 创建时用空参数 `fetch()` 一次，拒绝被吞掉 |
| `adapter` | `SnailStateAdapter` | 所属 server 的 `stateAdapter`（再兜底 `SnailAdapter`） | 两种模式下都用于事件与（开启时的）状态 |
| `onSuccess` / `onError` / `onFinish` | `(…) => void` | 未设置 | **两种模式下都触发** |

## 返回

| 返回 | `withState: false` | `withState: true` |
| --- | --- | --- |
| `fetch(...args)` | `Promise<TData>`（拆包载荷） | 同左 |
| `abort()` | `() => void` | 同左 |
| `onSuccess` / `onError` / `onFinish` | 有 | 有 |
| 状态句柄 | **没有** | `StrategyState<TData>` |

## 示例

```ts
import { useFetcher } from "@snail-js/api/strategies";
import { userApi } from "./service";

// 预取：预热缓存，不碰任何界面状态
const prefetch = useFetcher(userApi.getUser);
await prefetch.fetch("1");

// 让 fetcher 自己驱动一个可见视图
const detail = useFetcher(userApi.getUser, { withState: true });
await detail.fetch("1");
detail.loading.value;   // false
```

默认无状态是有意的：fetcher 通常是**后台**请求（预取、SSR 过程、静默刷新），写调用方状态会让一个
没人要求观察的请求闪出一个 spinner。

::: tip 静默只针对状态，不针对事件
`withState: false` 时不写任何状态句柄，但 `onError` / `onFinish` 回调**照常触发** —— 生命周期回调
与渲染无关，把它们也静默掉就没有任何地方能观察到失败了。取消在两种模式下都不算失败：不写 `error`，
也不触发 `onError`。
:::

## 诚实地说，它的边界

- `withState: false` 时**没有** `loading` / `data` / `error` / `code` / `message`，也没有 `update()` /
  `bind()`：返回的 `UseFetcherCore` 只有 `fetch` / `abort` / 三个事件订阅。需要读中间状态就必须打开
  `withState`。
- `withState: true` 时的状态语义与 `useRequest` 完全一致：每次 `fetch()` 先清 `error` / `code` /
  `message`，`data` 保留到下一次成功。
- 与 `useRequest` 相同的「一个实例一个请求」：并发 `fetch()` 会让前一次以取消落定。
- 取消：`fetch()` 仍然 reject 一个 `SnailCancelledError`（调用方持有 promise，这里的拒绝不会被吞），
  只是不写 `error`。

## 相关

- [策略概览](../strategies.md)：状态形状、适配器与公共选项
- [`useRequest`](./use-request.md)：需要状态句柄的手动发送
- [缓存插件 `Cache`](../plugin-cache.md)：预取最常见的目的地
- [在服务端运行](../server-side.md)：SSR 里用默认的 `SnailAdapter`，句柄照常更新、只是不触发渲染
