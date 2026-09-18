# 请求策略 `useWatcher`

被监视的值变化时重发，并带 `debounce` / `throttle` 收敛突发。它是「搜索框 + 筛选条件」这类界面的
默认选择。

```ts
function useWatcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseWatcherOptions<TData>      // watching 必填
): UseWatcherResult<TData, TArgs>;
```

## 选项

```ts
interface UseWatcherOptions<TData> extends UseRequestOptions<TData> {
  watching: () => readonly unknown[];    // 必填
  debounce?: number;
  throttle?: number;
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `watching` | `() => readonly unknown[]` | **必填** | 返回触发重发的**普通值**，例如 `() => [page.value]` |
| `debounce` | `number` | 未设置 | 等待这么多毫秒的安静再发一次；与 `throttle` 同时设置时**优先** |
| `throttle` | `number` | 未设置 | 前沿立刻发，之后每个窗口最多再发一次（会为突发末尾补一次尾随执行） |
| 其余 | — | — | 继承 `UseRequestOptions`（`initialData` / `resetOnSend` / 公共选项） |

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `send(...args)` | `(...args: TArgs) => Promise<TData>` | 求值 `watching()`；值没变就是 no-op，直接 resolve 当前 `data` |
| `watching` | `SnailStateRef<boolean>` | 置为 `false` 后每一次 `send()` 都无条件发送 |
| 状态句柄 | `StrategyState<TData>` | 与 `useRequest` 相同 |

## 示例

```ts
import { ref } from "vue";
import { useWatcher } from "@snail-js/api/strategies";
import { searchApi } from "./service";

const keyword = ref("");
const search = useWatcher(searchApi.find, {
  watching: () => [keyword.value],
  debounce: 200
});

await search.send();                        // 发送
await search.send();                        // 值没变 → 不发请求，立刻返回当前 data
keyword.value = "ab";
await search.send();                        // 再次发送

search.watching.value = false;              // 手动「刷新」按钮：无条件发送
```

## 为什么 `send()` 就是求值时机

状态适配器只暴露 `create` / `read` / `write` 和一个可选的 `subscribe`，**没有 `watch` 或 `effect`**
—— 核心刻意不把框架响应式引入策略层。所以没有任何东西能在「值变化的**那一刻**」触发请求：hook 在
`send()` 被调用时求值 `watching()`，并把**快照未变**当作 no-op。

这让行为确定且与框架无关：Vue / React 的集成可以在自己的响应式副作用里调用 `send()`，脚本则直接
调用。`debounce` / `throttle` 收敛的正是响应式副作用产生的那一串 `send()` 突发；被合并的调用方
promise 都会以那**唯一一次**请求的结果落定，所以不会有 `await` 悬空。

## 诚实地说，它的边界

- 比较用 `Object.is`（逐项浅比较），所以 `NaN` 不会被当成每次都在变化；但**深层的对象变化不会被
  察觉**，请把真正参与身份的字段展开成数组。
- `watching()` 返回非数组时会被归一成一个单元素列表，而不是盲目展开（展开字符串会比较字符，展开
  `undefined` 会在 hook 里抛错）。
- **返回值里的句柄会被自动解包**：`adapter.isState` 认得出 Vue ref；plain / React 的盒子则靠
  「只有一个自有键 `value`」这一启发式识别。所以 `() => [pageRef]` 能工作，但**一个真正的数据对象
  如果恰好只有 `value` 一个键，就会被当成句柄** —— 那种情况请写成 `() => [obj.value]`。
- `watching()` 抛错时，错误写进 `error`、触发 `onError`，并只 reject 这一次调用 —— 用户代码的异常
  不会从 hook 里逃出去把组件带崩。
- `abort()` 做三件事：取消已排期的执行、用 `SnailCancelledError` reject 所有排队的等待者（否则它们
  会永远 pending），再中止在飞的请求。
- 被合并的等待者共享**同一个** promise 结果：一次失败会让那一批 `send()` 全部 reject。

::: danger 没有定时器就不会有「延迟重发」这回事
`send()` 不调用，请求就不存在。把 `watching()` 当成声明式依赖去期待自动重发是行不通的 —— 需要在
值变化时由框架的响应式副作用负责调用 `send()`，这也是它刻意不内置 `watch` 的代价。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、适配器与公共选项
- [`useRequest`](./use-request.md)：不带监视的手动发送
- [`usePagination`](./use-pagination.md)：把页码交给 hook 自己管
