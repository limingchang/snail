# 缓存插件 `Cache`

缓存是唯一一个**同时出现在正向链末尾与反向链开头**的插件。理解这一点，这个插件的每个设计
都能自己推出来。

```ts
import { Api, Data, Get, Post } from "@snail-js/api";
import { Cache, Cacheable, Invalidates, NoCache } from "@snail-js/api/plugins";
import { Service } from "./service";

Service.use(Cache({ ttl: 30, l2: "localStorage" }));

@Api("/user")
class UserApi {
  @Get("/")
  @Cacheable({ tags: ["users"] })
  list(): Promise<User[]> {
    return null!;
  }

  @Post("/")
  @Invalidates("users")
  create(@Data() body: NewUser): Promise<User> {
    return null!;
  }
}
```

不带任何装饰器时，插件只对 `GET`（`cacheFor` 的默认值）生效；`@Cacheable()` 是一次**显式
opt-in**，它会让被标记的目标即使动词不在 `cacheFor` 里也照样缓存。

## 优先级：`-100`

| 相位 | 位置 | 为什么必须是这个位置 |
| --- | --- | --- |
| 正向（`beforeRequest`） | **最后** | 拦截器（`100`）、版本（`50`）、适配器（`0`）与参数装饰器都已经跑完，url / params / body 才是**定稿**的。用更早的形态算键，会把两个不同的请求算成同一个键，或者把同一个请求算成两个。 |
| 反向（`afterResponse`） | **最先** | 在**未命中**的那次请求里它最先看到响应，于是存下的是服务器原样发出的信封 —— 校验（`-50`）与转换（`0`）在它之后才动这个响应（命中时它们根本不跑，见下）。 |

一条规则概括：**正向钩子从最外层进，反向钩子从最内层出**。缓存插件是「最后进、最先出」，
这正是[插件生命周期](./plugin-lifecycle.md)需要两个方向的原因。

::: danger 命中路径不会发出网络请求，也**不会跑 `afterResponse` 链**
命中时插件设置 `ctx.response` 并调用 `ctx.interrupt(...)`，**不调用 `next()`**，于是 `send()`
的下游步骤 `dispatch` 整体被跳过：

```text
requestInterceptor reduce   ✗ 未运行
axios.request               ✗ 未运行
responseInterceptor reduce  ✗ 未运行
afterResponse 链            ✗ 未运行（校验、转换都在这里）
信封校验 + buildResult      ✓ 运行
```

所以命中时拿到的是**缓存里那个原始信封**：`@ValidateResponse()` 不会对它们生效，
`@Transform(Dto)` 也**不会**把它水合成类实例 —— 第二次调用拿到的是普通对象，不是 DTO 实例。
`result.fromCache` 为 `true`，响应对象是插件**合成**的：

```ts
{
  data: 存储的 body,
  status: 200,
  statusText: "Cache Hit (snail)",
  headers: {},              // 空的：服务器从没发过这些 header，编不出来
  config: ctx.request       // 实时请求，读 response.config 能拿到产生命中的那次请求
}
```

优先级更高的 `beforeRequest` 钩子（拦截器 `100`、版本 `50`）**已经跑过** —— 它们在缓存之前进入
正向链；被跳过的只有缓存下游的部分。存的是 `response.data` 而不是 `SnailResult`，所以缓存条目
与调用方的信封 schema 解耦：同一个服务器换一套 `dataKey` 也不会读到另一套键名下的旧值。
:::

## 选项

```ts
interface CacheOptions {
  ttl?: number;                    // 秒；默认 60
  maxSize?: number;                // L1 LRU 容量；默认 100
  l1?: boolean;                    // 默认 true
  l2?: "localStorage" | "sessionStorage" | "indexedDB" | CacheAdapter;
  cacheFor?: "all" | SnailMethodType | SnailMethodType[];   // 默认 ["GET"]
  prefix?: string;                 // 默认取 server 名
  staleWhileRevalidate?: boolean;  // 默认 false
  dedupe?: boolean;                // 默认 true
}
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `ttl` | `60` | 条目存活秒数。必须是正数，零 / 负数 / 非有限值会**回退到 60**，而不是静默存一条永不过期的记录 |
| `maxSize` | `100` | L1 的 LRU 容量。非正数同样是 `100`：无上限的内存缓存是「带额外步骤的内存泄漏」，不能靠手滑到达 |
| `l1` | `true` | 关掉后只剩 L2（或什么都不剩） |
| `l2` | 未设置 | 字符串选择内置适配器并**惰性**解析全局对象；对象按原样使用。环境里没有对应全局（Node 里既没有 `localStorage` 也没有 `indexedDB`）时**警告一次并只用 L1**，不抛错 |
| `cacheFor` | `["GET"]` | 哪些动词可缓存，接受 `"all"`；字符串与数组都会归一成大写动词 |
| `prefix` | 安装它的 **server 名** | 缓存键的命名空间。同一个 origin 上的两个 server 共用一份 `localStorage` 时不会互相读到 |
| `staleWhileRevalidate` | `false` | 立刻返回过期条目并在后台刷新 |
| `dedupe` | `true` | 合并并发发出的、完全相同的请求 |

`resolveOptions` 的兜底常量是 `"[snail-cache]"`，但插件安装时总会写入 `api.serverName`，
所以实际默认值就是 server 名。未知的 `l2` 字符串会在**安装时**抛
`SnailPluginError`（消息来自 `error.plugin.cache.adapter`），注册随之回滚。

## 装饰器与优先级链

```ts
@Cacheable({ ttl?: number; tags?: readonly string[]; key?: string })
@NoCache()
@Invalidates(...tags: string[])
@HitSource(name: string)     // @Invalidates 的旧名别名，行为完全一致
```

四个装饰器都同时支持**类**与**方法**（TypeScript 靠参数个数区分，这是没有
`reflect-metadata` 时唯一可靠的信号）。`@Cacheable` 与 `@NoCache` 使用
`merge = false`：同一个目标上写两次不会得到一个需要读者自己去调和的数组。
`@Invalidates` 使用 `merge = true`，每个标签一次应用，元数据保持扁平的 `string[]`：

```ts
@Invalidates("users", "orders")   // → ["users", "orders"]
```

### 优先级链

解析顺序（`resolveCachePlan`）严格如下，**方法 > 类**：

| 顺序 | 条件 | 结果 |
| --- | --- | --- |
| 1 | 方法上有 `@NoCache()` | 不缓存（显式退出永不被覆盖） |
| 2 | 方法上有 `@Cacheable()` | 缓存（显式 opt-in 双向胜出） |
| 3 | 类上有 `@NoCache()` | 不缓存 |
| 4 | 类上有 `@Cacheable()` | 缓存（整个类的每个方法） |
| 5 | 以上都没有 | 动词必须出现在 `cacheFor` 里 |

```ts
@Api("/user")
@NoCache()                    // 类级退出
class UserApi {
  @Get("/plain")
  plain(): Promise<void> { return null!; }      // 不缓存

  @Get("/forced")
  @Cacheable()               // 方法级 opt-in 胜过类级退出
  forced(): Promise<void> { return null!; }     // 缓存
}
```

`tags` 是**合并**的（类在前、方法在后，去重）；`ttl` 与 `key` **不合并**，最具体的声明直接
胜出。装饰器参数在装饰阶段就校验：`ttl` 非正数、`key` 非空字符串、`tags` 不是非空字符串数组
都会抛 `SnailDecoratorError`，而不是等到请求时才静默失败。

## 缓存键

```ts
buildCacheKey({ prefix, request, methodType, explicitKey })
// → `${prefix}:${VERB}:${shortHash(stableStringify({ method, baseURL, url, params, data }))}`
```

- **整个请求身份都参与哈希**：动词、最终 url、query params、body，别无其它。
- **header 被刻意排除**：`Authorization` 改变的是「谁在问」，不是「问什么」；把它算进键，
  每次刷新 token 都会变成一次全量缓存失效。
- **用 `stableStringify` 而不是 `JSON.stringify`**：`{ a: 1, b: 2 }` 与 `{ b: 2, a: 1 }` 是同一个
  query，排序后哈希才能得到同一个键。
- 可读的 `prefix:VERB` 留在哈希之外，所以光看一个键就能判断它的来源；只有易变的签名被哈希，
  键才短到放得进 `localStorage`。
- `@Cacheable({ key })` 是**替换**身份而不是扩展它：该方法的每次调用共享同一个条目。适用于
  请求里带着不该参与身份的部分（nonce、时间戳）的场景，代价是这些部分被忽略。

## 多层结构

```text
beforeRequest ──▶ CacheManager.lookup(key)
                    │
              L1: MemoryCacheAdapter ── 命中且新鲜 ──▶ 直接返回
                    │ miss
              L2: CacheAdapter ── 命中 ──▶ 提升进 L1 ──▶ 返回
                    │ miss
                  发请求 ──▶ afterResponse ──▶ CacheManager.set(key, response.data, ttl, tags)
```

**L1** 永远是 `MemoryCacheAdapter`（除非 `l1: false`），由 `maxSize` 限制并为唯一接收 L2
提升的层。它没有 `setInterval` 清扫器：过期在每个操作开始时**惰性**清扫，最多检查 `maxSize`
条记录，也不会像旧实现那样把 Node 进程（或测试 worker）永远吊住。LRU 直接借助 `Map` 的插入
顺序实现 —— 「最久未使用」就是「第一个键」，触碰一个条目就是 `delete` + `set`。

**L2** 是任意 `CacheAdapter`。TTL、LRU 与标签是**策略**而不是存储，全部由 `CacheManager`
持有，所以自定义 L2 只需要回答 get / set / delete，永远不需要知道什么是 tag。

| 内置适配器 | 选择方式 | 默认 | 环境缺失时 |
| --- | --- | --- | --- |
| `MemoryCacheAdapter` | L1，或直接传实例 | `maxSize: 100` | 不适用 |
| `WebStorageCacheAdapter` | `l2: "localStorage"` / `"sessionStorage"` | `prefix: "[snail-cache]"` | 警告一次，退回只用 L1 |
| `IndexedDBCacheAdapter` | `l2: "indexedDB"` | `databaseName: "snail-js-api"`、`storeName: "cache"`、`version: 1` | 警告一次，退回只用 L1 |

```ts
interface CacheAdapter {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;  // ttl <= 0 表示不过期
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys?(): Promise<string[]>;      // 可选：后端能枚举时才实现
}
```

每个方法都是异步的，这**不是**为了好看：`localStorage` 是同步的而 IndexedDB 不是，逼同步
适配器假装异步不花任何代价，反过来则不可能。于是 IndexedDB 在整个插件里不需要任何特例。
适配器永远不该因为「环境里没有这个全局」而抛错（内置的两个都会退化成 no-op），但管理器仍然
包住每一次调用：配额错误（`QuotaExceededError`）是正常结果，绝不能让一个**已经成功**的请求
失败。L2 读 / 写 / 删 / 清失败只会打一条 `cache.warn.l2.failed` 警告。

### TTL 与 `staleWhileRevalidate` 的分工

新鲜度永远由 `CacheManager` 用它在 `set` 时记录的 `expiresAt` 判定。开启
`staleWhileRevalidate` 时，L1 被告知「永不过期」，好让过期副本活到被返回的那一刻；关闭时 L1
拿到真实 TTL，自行清扫。**L2 永远拿到真实 TTL**，这样第二个标签页（没有共享的内存索引）
不会读到过期数据。

## 标签失效：先 purge 再 store

```ts
@Get("/")
@Cacheable({ tags: ["users"] })
list(): Promise<User[]> { return null!; }

@Post("/")
@Invalidates("users")
create(@Data() body: NewUser): Promise<User> { return null!; }
```

`@Invalidates` 的钩子挂在响应路径上，所以「成功」指的是 **HTTP 往返成功**：失败或取消的请求
什么都不会失效。`afterResponse` 里的顺序是**加载关键**的：

1. 先 `invalidateTags(plan.invalidate)`；
2. 再 `manager.set(plan.key, ctx.response.data, plan.ttl, plan.tags)`；
3. 最后 `await next()`，后续反向插件才看得到响应。

先清后存意味着一个方法即使为自己刚写入的 tag 声明了 `@Invalidates`，也不会删掉自己刚写的
条目。

::: tip 失效与写入都发生在 `afterResponse`
`storeResponse` 是插件的 `afterResponse` 钩子，所以命中的请求（上文那条路径）既不会失效任何
标签，也不会重新写入条目 —— 一次命中意味着服务端没有任何变化，这正是缓存的前提。
:::

```ts
const cache = Cache({ ttl: 30 });
Service.use(cache);

await cache.manager?.invalidateTags(["users"]);
await cache.manager?.invalidateAll();   // clear() 的别名
cache.manager?.size;                    // 只在数 L1 的活跃条目，L2 按设计不枚举
```

`cache.manager` 是**安装后**才存在的 getter（名字前缀与解析后的日志级别在 `install` 时才知道），
所以请用 `cache.manager?.` 而不是把 `manager` 提前解构出来。

## 并发去重

`dedupe: true`（默认）时，同一个键上并发发出的相同请求只会产生一次网络往返：

- 第一个到达的请求是 **leader**，它把 promise 登记进 `manager.setInFlight(key, promise)`；
- 后来的 **follower** 拿到同一个 promise 并 `await` 它，命中共享结果后同样
  `markCacheHit()` + `interrupt()`；
- leader 失败时 follower **不会继承失败**，而是自己发一次请求 —— 它并不是 leader 在任何有用
  意义上的「后继」；
- 条目在 promise 落定后自行移除，而且它的拒绝被显式标记为「已观察」，所以一个无人等待的 leader
  失败不会变成 Node 里的 unhandled rejection。

## 命中与 SWR 的实际行为

```ts
const api = Service.createApi(UserApi);

const first = await api.list().send();
first.fromCache;      // false

const second = await api.list().send();
second.fromCache;     // true —— 而且网络请求数没有增加
```

开启 SWR 后，过期条目被**立刻**返回（`fromCache: true`），刷新在带外进行。刷新**刻意不调用
本次请求的 `next()`**：调用方还在读 `ctx.response`，一个分离的链式步骤会把新响应写进同一个
上下文，污染调用方即将拿到的结果。取而代之的是把最终 config 通过 server 自己的 axios 实例
重放一遍，并像 `dispatch` 那样归一化响应（`coerceJSONStringBody` + `responseInterceptor`
reduce），所以刷新写回的条目与一次正常 miss 存下的条目逐字节一致。刷新失败只记
`cache.warn.revalidate.failed` 警告。

::: warning 这张缓存表不是分布式缓存
L1 是进程内存，L2 是当前浏览器 origin 的存储。多标签页共用 L2 时，TTL 由 L2 记录自己的
`expiresAt`，但**标签索引不跨标签页**：`@Invalidates` 只能清掉当前页面知道的键。需要跨页面
强一致时，请在业务层加版本号 / 广播通道。
:::

## 相关

- [插件生命周期](./plugin-lifecycle.md)：优先级区间与两个方向的完整规则
- [校验插件](./plugin-validate.md)：为什么它排在缓存之后（反向）
- [转换插件](./plugin-transform.md)：为什么它也排在缓存之后（反向）
- [在服务端运行](./server-side.md)：服务端 L1 进程级共享、缓存键不含 header 带来的跨用户风险
- [请求池插件](./plugin-pool.md)：为什么池必须排在缓存之下
- [策略概览](./strategies.md)：`useRequest` / `usePagination` 如何与缓存协同
