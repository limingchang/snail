# 请求池插件 `RequestPool`

给「同时在飞的请求数」装一个硬上限：一个有优先级的、有界的、有等待时限的队列。

```ts
import { RequestPool } from "@snail-js/api/plugins";
import { Service } from "./service";

Service.use(RequestPool({ concurrency: 6, maxQueue: 50, queueTimeout: 10_000 }));
```

插件 `name` 是 `pool`，`priority` 是 **`-150`**（低于缓存的 `-100`，是优先级最低的插件）。

## 为什么已经有了浏览器队列，还需要一个池

浏览器确实会排队：HTTP/1.1 下同一个 origin 大约六条连接，超出的请求在网络栈里等着。但那个内置队列
是 **FIFO、不可见、无优先级**的：

- 一个界面一次发出五十个请求时，应用**没法说**用户正在看的那个应该先走；
- 没法知道**有多少**在等（没有计数器可读）；
- 没法阻止一次突发**饿死**页面其余部分（后台预取和用户点击排在同一条队伍里）。

**HTTP/2 也没有取消这个需求**：多路复用把「六条连接」的上限换成了**流数量**上限（常见是 100），而
服务端的容量仍然是有限的。五百个请求走 HTTP/2 一样能把它打满。

池提供三件浏览器给不了的东西：

| 能力 | 说明 |
| --- | --- |
| 硬上限 | `concurrency` 在 HTTP/1.1 与 HTTP/2 上都成立 |
| 优先级 | `priority` 让交互请求排在后台预取之前 |
| 有界队列 | `maxQueue` / `queueTimeout` 让积压**快速失败**，而不是无声地无限增长 |

## 为什么它在 `-150`

正向钩子按优先级**从高到低**执行，所以 `-150` 让请求池成为传输之前的**最后一步**，排在缓存
（`-100`）之后：

```text
interceptor (100) → versioning (50) → … → validate (-50) → cache (-100) → pool (-150) → 网络
```

**一次缓存能回答的请求根本到不了池，也永远不占用槽位。** 反过来，如果把池放在缓存之上，几个命中缓存
的读就会占满整个池，把后面真正要发出去的请求饿死（这条行为有测试守着）。

## 槽位只为「传输」而持有

池的 `beforeRequest` 里是 `acquire() → await next() → finally release()`。在 `-150` 这个位置，`next()`
的尽头就是网络步骤（`dispatch`：请求拦截器 → `axios.request` → 响应拦截器），所以：

- 响应一到，槽位就**已经还回去了**；
- 之后的 `afterResponse` 链（校验 `-50`、转换 `0`）、信封校验、`buildResult` 与调用方的响应式更新，
  都发生在槽位释放**之后**；
- 释放写在 `finally` 里：传输失败、校验抛错、取消，都会归还槽位。否则每出错一次池就悄悄少一个槽位，
  最终在 ceiling 上永久死锁。

## 选项

```ts
interface RequestPoolOptions {
  concurrency?: number;               // 默认 6
  maxQueue?: number;                  // 默认 Infinity
  queueTimeout?: number;              // 默认 0（不限时）
  priority?: (ctx: unknown) => number; // 默认 0
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `concurrency` | `number` | `6` | 同时在飞的请求数。六是经典的 HTTP/1.1 单 origin 连接上限 —— 这是「在老服务器上不会更糟、又能约束 HTTP/2 突发」的最大值。非有限值回落 6，结果被夹到 ≥ 1 |
| `maxQueue` | `number` | `Infinity` | 允许**等待**的请求数。设成有限值即可快速失败：队列满之后，多出来的请求立刻 reject，而不是加入一条用户永远看不到尽头的积压。`0` 表示完全不排队 |
| `queueTimeout` | `number` | `0`（不限时） | 一个请求最多能等多久（毫秒）。用户已经不再等待的请求比失败更糟 —— 它最终仍会占一个槽位，并可能覆盖更新的数据。负数被夹到 0 |
| `priority` | `(ctx) => number` | `0` | 排队请求的排序权重。**数值越小越先跑**；相同权重按到达顺序；**本来就拿到空槽位的请求根本不排队**，所以不受它影响。抛错或返回非有限值时回落到 `0` |

`priority` 拿到的是完整的 `SnailContext`，所以它能读到 `ctx.state`、`ctx.methodName`、
`ctx.request`。这正是一个交互请求可以插到后台预取前面的原因：

```ts
import { createPlugin } from "@snail-js/api";
import { RequestPool } from "@snail-js/api/plugins";

// 标记哪些请求是后台预取。它在池（-150）之前进入 beforeRequest，所以池读得到它写的 state。
const MarkPrefetch = createPlugin({
  name: "mark-prefetch",
  priority: 20,
  beforeRequest(ctx, next) {
    if (ctx.methodName === "prefetchList") ctx.state.set("prefetch", true);
    return next();
  }
});

Service.use(MarkPrefetch()).use(
  RequestPool({
    concurrency: 4,
    // 权重越小越先跑：用户点的请求 0，后台预取 100
    priority: (ctx) => (ctx.state.get("prefetch") ? 100 : 0)
  })
);
```

不想要额外插件时，`ctx.methodName` / `ctx.request.url` 本身就是现成的判据：

```ts
Service.use(RequestPool({ priority: (ctx) => (ctx.methodName === "prefetchList" ? 100 : 0) }));
```

## 导出

```ts
import {
  RequestPool,             // 插件工厂
  RequestPoolScheduler,    // 独立的调度核心（可单独使用/测试）
  poolStats,               // (plugin) => RequestPoolStats | undefined
  clearPool,               // (plugin, reason?) => void
  isPoolError,             // (error) => error is SnailPoolError
  SnailPoolError,          // 拒绝时抛出的错误类
  POOL_ERROR_CODES         // 四个 code 的常量表
} from "@snail-js/api/plugins";

type RequestPoolOptions = { concurrency?: number; maxQueue?: number; queueTimeout?: number; priority?: (ctx: unknown) => number };
type RequestPoolStats = { active: number; queued: number; concurrency: number };
type PoolTicket = { readonly release: () => void };
type PoolErrorCode = "SNAIL_POOL_QUEUE_FULL" | "SNAIL_POOL_QUEUE_TIMEOUT" | "SNAIL_POOL_ABORTED" | "SNAIL_POOL_CLEARED";
```

`@snail-js/api/plugins` 还导出 `POOL_PLUGIN_NAME`（`"pool"`）、`POOL_PRIORITY`（`-150`）与类型
`AbortLike` / `RequestPoolPlugin`。

## 运行时读计数器

```ts
import { poolStats } from "@snail-js/api/plugins";

const pool = RequestPool({ concurrency: 3 });
Service.use(pool);

poolStats(pool);        // { active: 1, queued: 4, concurrency: 3 }
```

`RequestPoolPlugin.scheduler` 是一个 getter：`install` 在 `use()` 期间**同步**执行，所以 `Service.use(pool)`
返回之后就能读到统计；**从未安装**过时 `poolStats()` 返回 `undefined`（安装过就不会再变回 `undefined`
—— 卸载只是清空队列，`scheduler` 引用还在）。后端扛得住时可以随时放宽：

```ts
pool.scheduler?.setConcurrency(6);   // 提高上限会立刻放行排队中的请求
```

## 拒绝 ≠ 传输失败

一次池拒绝意味着这个请求**从未到达网络**：payload 没动过，服务端状态没变。所以：

- `SnailPoolError` 是一个**独立的类**，不是 `SnailRequestError` 的复用 —— 分不清这两者的调用方，
  要么会重试一个服务端已经处理过的请求，要么会对一个只是排在突发后面的请求放弃；
- `isPoolError(error)` 是受支持的判定方式，在默认的四条拒绝路径上都是 `true`（传了自定义 `reason` 的
  `clearPool` 是例外，见下）；
- **重试是安全且通常正确的**。一条常见的写法：

```ts
import { isPoolError } from "@snail-js/api/plugins";

try {
  await api.list().send();
} catch (error) {
  if (isPoolError(error)) {
    // 从未发出：稍后再试，或用更小的并发重新排
    scheduleRetry();
    return;
  }
  throw error;
}
```

或者直接把它接进重试策略：`useRetriableRequest` 的 `retryOn` 对池拒绝返回 `true` 是合理的，因为那一
次没有副作用。

| `POOL_ERROR_CODES` | 值 | 触发条件 | 中文消息 |
| --- | --- | --- | --- |
| `queueFull` | `"SNAIL_POOL_QUEUE_FULL"` | 等待队列已达 `maxQueue` | 请求池队列已满（等待中 `%s` 个），请稍后重试 |
| `queueTimeout` | `"SNAIL_POOL_QUEUE_TIMEOUT"` | 等待超过 `queueTimeout` | 请求池排队超时（已等待 `%sms`） |
| `aborted` | `"SNAIL_POOL_ABORTED"` | 还在排队时被取消（`ctx.request.signal` 已 abort，或排队期间 abort） | 请求在排队期间被取消 |
| `cleared` | `"SNAIL_POOL_CLEARED"` | 队列被 `clearPool()` 清空，或插件被卸载 | 请求池已清空，排队的请求被取消 |

取消在池里的语义与其它地方一致：`aborted` 是**控制流**，不是失败。排队中的请求被取消时会**离开
队列**（不会白占一个位置），真正失败的是在飞的那次传输。

## 清空与卸载

```ts
import { clearPool } from "@snail-js/api/plugins";

clearPool(pool);                       // 每个等待者以 SnailPoolError(cleared) 被拒绝
clearPool(pool, new Error("reload"));  // 或者用你自己的 reason
```

- `clearPool(plugin, reason?)` 会拒绝**所有排队中**的请求，但**不动**正在飞的请求：它们持有的槽位照
  常在 `finally` 里归还。
- 传了 `reason` 时，等待者拒绝的是那个值本身，而**不是** `SnailPoolError` —— 此时
  `isPoolError()` 返回 `false`。`reason` 只在「明确想用自己的错误类型」时才传。
- 卸载插件（`Service.remove("pool")` / `Service.dispose()`）会自动清空队列：一个排队的请求不能永远
  等一个再也不会放行它的池。

## 独立的 `RequestPoolScheduler`

调度核心刻意与「请求」「插件」两个概念无关，只发放 `release` 回调：

```ts
const scheduler = new RequestPoolScheduler({ concurrency: 2, maxQueue: 10 });
const ticket = await scheduler.acquire(ctx, signal);
scheduler.stats;              // { active, queued, concurrency }
scheduler.setConcurrency(4);
ticket.release();             // 幂等：重复调用不会把计数减到负数
scheduler.clear();
```

它唯一的硬不变量是 `active` 必须永远等于在外的 ticket 数；泄漏一个槽位在池永久死锁之前是看不见的，
所以这条不变量在调度器里强制执行，而不是在调用点。想在自己的并发控制里复用它，直接 `new` 就好。

::: warning 池的边界
- **它约束的是「同时在飞」，不是「总量」**：一个无限循环的 `useAutoRequest` 仍会一个接一个地发。
  要限制速率，请配合 `pollingInterval`、`debounce` 或后端限流。
- **`concurrency` 是每个 server 的**：池安装在哪个 server 上，就只约束那个 server 的请求；两个
  server（例如主站 + 第三方）各有自己的池。
- **优先级只在排队时起作用**：有空槽位时请求直接过，`priority` 不会被求值。
- **`queueTimeout` 用 `setTimeout`，在 Node 上会被 `unref()`**：排队定时器不会吊住进程。
- 一个**无法监听**的 signal（axios 的 `GenericAbortSignal` 类型上 `addEventListener` 是可选的）只是
  意味着已排队的请求不会被提前撤下：它仍会拿到槽位，然后由传输层拒绝它。
:::

## 相关

- [插件生命周期](./plugin-lifecycle.md)：优先级区间与两个方向的完整规则
- [缓存插件 `Cache`](./plugin-cache.md)：为什么池必须排在它下面
- [使用插件](./plugins.md)：`use()` / `remove()` 与优先级表
- [`useRetriableRequest`](./strategies/use-retriable-request.md)：把池拒绝接进重试策略
