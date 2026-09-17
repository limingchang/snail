# 请求策略 `usePagination`

分页与无限滚动。方法接收**单个**参数 `{ page, pageSize }`；声明成更宽的查询对象
（`PageRequest & { keyword: string }`）也没问题。

```ts
function usePagination<TData>(
  method: StrategyMethod<[PageRequest], TData>,
  options?: UsePaginationOptions<TData>
): UsePaginationResult<TData>;
```

## 选项

```ts
interface UsePaginationOptions<TData> extends SnailStrategyCommonOptions {
  initialPage?: number;                              // 默认 1
  initialPageSize?: number;                          // 默认 10
  total?: (payload: TData) => number;
  list?: (payload: TData) => unknown[];
  append?: boolean;                                  // 默认 false
  preloadNext?: boolean;                             // 默认 false
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `initialPage` | `number` | `1` | 起始页码（1 起）。非有限值回落 1，且被夹到 ≥ 1 |
| `initialPageSize` | `number` | `10` | 起始每页条数。非有限值回落 10，且被夹到 ≥ 1 |
| `total` | `(payload) => number` | 数组则取长度，否则 `payload.total ?? payload.count ?? 列表长度` | 从载荷里读总行数 |
| `list` | `(payload) => unknown[]` | 载荷是数组则用它本身，否则 `payload.list ?? payload.items`，都没有则 `[]` | 从载荷里读当前页的行 |
| `append` | `boolean` | `false` | 累积而不是替换 —— 无限滚动模式 |
| `preloadNext` | `boolean` | `false` | 后台预取下一页，`next()` 时立刻返回 |
| 公共选项 | — | — | `adapter` / `onSuccess` / `onError` / `onFinish` |

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `page` / `pageSize` / `total` / `list` / `isLastPage` | `SnailStateRef<...>` | 分页派生状态；`total` 初始 `0`、`list` 初始 `[]`、`isLastPage` 初始 `false` |
| `next()` / `prev()` | `() => Promise<TData \| undefined>` | 到达边界时是 **no-op**，不发请求，resolve `undefined` |
| `goTo(page)` | `(page: number) => Promise<TData \| undefined>` | 页码被夹到合法区间；跳到当前页是 no-op |
| `reload()` | `() => Promise<TData \| undefined>` | 清空 `list`、回到第一页并重新拉取 |
| `changePageSize(size)` | `(size: number) => Promise<TData \| undefined>` | 改每页条数、回到第 1 页、重新拉取；`size` 不是有限数或小于 1 时是 no-op |
| 状态句柄 | `StrategyState<TData>` | 与 `useRequest` 相同，`data` 是最近一次请求的完整载荷 |

## 示例

```ts
import { usePagination } from "@snail-js/api/strategies";
import { userApi } from "./service";

const users = usePagination(userApi.list, {
  total: (payload) => payload.total,
  list: (payload) => payload.rows,
  append: true
});

await users.reload();
users.total.value;         // 总行数
users.isLastPage.value;    // false

await users.next();
users.list.value;          // 两页累积
```

```ts
@Api("/users")
class UserApi {
  @Get("/")
  list(@Query() query: PageRequest & { keyword?: string }): Promise<Page<User>> {
    return null!;
  }
}
```

## 诚实地说，它的边界

- `next()` / `prev()` 在边界上**不发请求**：用户按住「下一页」不会把服务器打满，promise 仍然
  resolve（`undefined`），所以 `await` 不会挂住。
- `goTo()` 即使处于 `append` 模式也**替换**列表：把第 7 页拼在第 3 页后面只会交错两个不相关的
  区间。`changePageSize()` 同理（也重置到第 1 页）。
- `preloadNext` 用一个**一次性**的 `SnailMethod` 实例做预取（`method(...)` 再 `send()`），它有自己的
  上下文，所以预取的 `loading` / `data` 永远不会碰调用方的句柄；预取失败会被吞掉，`next()` 只是退回
  一次真实请求。代价是每页多一次请求。
- `reload()` 会先清空 `list` 与 `isLastPage` 再请求，所以失败时列表是空的，而不是留在旧页上。

::: warning 边界只有在观测到总数之后才存在
`total` 初始为 `0`、`isLastPage` 初始为 `false`，此时 `lastPage()` 是 `Infinity` —— 也就是说在第一次
成功响应之前，`next()` 的上界是「无」。而 `isLastPage` 的判定在 `total > 0` 时用
`target * size >= total`，在**没有总数**时退化成「本页不满 = 最后一页」，这无法识别「最后一页恰好是
满的」。请尽量提供可靠的 `total`。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、三个入口、公共选项
- [`useWatcher`](./use-watcher.md)：筛选条件变化时重发
- [`useRequest`](./use-request.md)：自己管页码的手动发送
