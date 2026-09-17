# 在服务端运行（Node / SSR）

**可以。** 这个库不是浏览器库：它没有运行时依赖，唯一的传输层是 axios（peer dependency），而少数
必须碰 DOM 的地方都是显式守卫过的 —— 没有 DOM 时它们要么安静地退化，要么立刻抛出可读的错误，绝不
是「看起来在工作、其实什么都没发生」。

整份测试套件就跑在 Node 里（`packages/api/vitest.config.ts` 的 `environment: "node"`，没有 jsdom），
所以「能 import、能发请求、策略能跑」不是推测。

## 逐条证据（都来自源码）

| 关注点 | 事实 | 位置 |
| --- | --- | --- |
| 运行时依赖 | `packages/api/package.json` **根本没有 `dependencies` 字段**；`axios` 是 peer，`vue` / `react` / `zod` 是**可选** peer | `packages/api/package.json` |
| 装饰器元数据 | 存在内部的 `WeakMap<object, OwnerRecord>` 注册表里；不用 `reflect-metadata`，也不碰 DOM | `src/core/metadata.ts` |
| 浏览器全局 | 惰性、逐次查找：`getWindowTarget()` / `getDocumentTarget()` 在 `typeof window === "undefined"` 时返回 `undefined`；`isDocumentVisible()` 在 Node 里返回 `true`（没有隐藏页面这回事） | `src/strategies/shared/dom.ts` |
| 下载 | `triggerDownload()` 检测不到 `document` 时抛一个带解释的 `ReferenceError`；`triggerBlobDownload()` 在缺少 `URL.createObjectURL` 时同样抛错 | `src/utils/download.ts` |
| 语言探测 | 先读 `globalThis.navigator`（守卫过），再读 `process.env` 的 `SNAIL_LOCALE` / `LC_ALL` / `LC_MESSAGES` / `LANG`，最后兜底 `"en"` | `src/locale/index.ts` |
| 缓存的 L2 | `localStorage` / `sessionStorage` / `IndexedDB` 适配器都先看全局在不在；缺失时**警告一次并只用 L1**，不抛错 | `src/plugins/cache/adapters/*.ts`、`manager.ts` |
| 流式传输 | 用 `fetch`（SSE、HTTP 流）、`new WebSocket(...)`、`ReadableStream`、`AbortController`、`TextDecoder` —— 都是**平台全局**，不是 DOM API | `src/core/sse.ts`、`websocket.ts`、`http-stream.ts` |
| 框架适配器 | Vue / React 适配器在它们自己的子路径里；`@snail-js/api/strategies/plain` 只安装 plain 适配器，不 import 任何框架 | `src/adapter/plain.ts`、`src/strategies/plain.ts` |
| `isBrowser()` | 导出给**应用**使用的判断（`typeof window !== "undefined" && typeof document !== "undefined"`）；库内部并不依赖它做分支 | `src/utils/is.ts` |

## 一个能跑的 Node 例子

```ts
import { Api, Get, Params, Server, SnailServer } from "@snail-js/api";

@Server({ baseURL: "https://api.example.com", timeout: 5000 })
class BackEnd extends SnailServer {}

// 模块作用域创建一次：选项在构造时解析，插件注册是同步的
export const Service = new BackEnd();

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }
}

const userApi = Service.createApi(UserApi);
const user = await userApi.getUser("1").send();   // 真的走了一次 HTTP
```

**不需要配置 `adapter`。** `SnailServer` 的构造函数里是裸的 `axios.create()`（`src/core/server.ts`），
而 `@Server({ adapter })` 未设置时会原样交给 axios 自行探测：浏览器里是 `xhr` / `fetch`，Node 里是
`http` / `https`。只有当你想显式指定时才需要写它 —— 例如在测试里塞一个记录请求的假 adapter，或者
强制走某个自定义 agent。

## 服务端**做不了**的事

### 1. 触发浏览器下载

`triggerDownload()` 与 `triggerBlobDownload()` 在服务端**抛 `ReferenceError`**，这是刻意的：一个
「唯一的职责就是副作用」的函数，安静地什么都不做是最坏的结果。

服务端要做的是把 URL 交给客户端（见 [`useDownload`](./strategies/use-download.md)），或者干脆自己把
字节写到磁盘：

```ts
import { writeFile } from "node:fs/promises";

@Api("/report")
class ReportApi {
  @Post("/raw", { responseType: "blob" })
  raw(): Promise<Blob> {
    return null!;
  }
}

const blob = await reportApi.raw().send();          // responseType: "blob" 时载荷就是 Blob
await writeFile("/srv/exports/report.pdf", Buffer.from(await blob.arrayBuffer()));
```

`useDownload()` 也**不**是服务端的工具：它的 `download()` 在无 DOM 时会 reject（`triggerDownload()`
的 `ReferenceError` 被写进 `error`）。请让浏览器那边调用它。

### 2. 框架适配器

**不要在服务端入口安装 `VueAdapter()` / `ReactAdapter()`。** 它们的作用是把请求状态镜像成框架的
响应式原语，而服务端没有渲染器：

- React 适配器的 `bind()` 走 `useSyncExternalStore`（`src/plugins/react/plugin.ts`），那是一个只能在
  React 渲染过程中调用的 hook；
- 两个适配器都会把 `vue` / `react` 拉进服务端 bundle，而它们在服务端没有任何用处。

服务端要用策略就导入 **`@snail-js/api/strategies/plain`**：三个入口的导出清单完全相同，只是它安装
的是 plain 适配器（普通 `{ value }` 盒子），值照常更新，只是不触发渲染。

### 3. 依赖 `window` 的刷新信号

`useAutoRequest` 的 `enableFocusRefresh` / `enableReconnectRefresh` / `refreshOnVisible` 监听的是
`window` 的 `focus` / `online` 与 `document` 的 `visibilitychange`。服务端没有这些目标，
`createListenerScope().add()` 直接返回 `false`：**监听器安静地没挂上**，轮询本身照常工作。所以在
服务端用它们不是错误，只是没有意义。

## Node 版本下限

仓库的 `engines` 是 **`node >= 20.19.0`**。理由不是语法，而是这些**全局对象**：

| 需要什么 | 谁在用 | Node 里的情况 |
| --- | --- | --- |
| `fetch` | SSE（`createSse`）、HTTP 流（`@HttpStream`） | v18.0.0 起默认可用（v17.5 起需要开关），v21.0.0 起不再 experimental |
| `ReadableStream` / `ReadableStreamDefaultReader` | HTTP 流的 `for await`、SSE 的解析器 | v18.0.0 加入 |
| `AbortController` / `AbortSignal` | 每个连接与请求 | v15.0.0 起 |
| `TextDecoder` | SSE / 流的解码 | v11.0.0 起 |
| `Event` | SSE 的 `@OnSseOpen` / `@OnSseError` 处理器收到的事件对象 | v15.0.0 起 |
| `WebSocket` | `@WebSocket`（`createWebSocket(...).open()`） | **v21.0.0 / v20.10.0 加入，但默认受 `--experimental-websocket` 约束；v22.0.0 起不再需要该开关，v22.4.0 起标记为非 experimental** |

所以：

- **HTTP 请求、SSE、HTTP 流**：`engines` 的下限（20.19）就够；
- **`@WebSocket`**：在 20.19–21.x 上 `WebSocket` 全局默认**不存在**。三种处理方式：
  1. 用 **Node ≥ 22**（最省事）；
  2. 在 20.10–21.x 上启动时加 `--experimental-websocket`；
  3. 自己提供全局实现，在调用 `open()` 之前赋值即可 —— 连接层读的就是全局
     `new WebSocket(url, protocols)`：

```ts
import { WebSocket } from "ws";            // 或任何符合接口的实现

(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

const socket = Service.createWebSocket(Chat).open();
```

需要 WebSocket 但不想升级运行时，就用第三种。

## SSR：一个 server 实例，每次 `send()` 一个请求上下文

### server 建在模块作用域

```ts
// service.ts —— 模块作用域创建一次
import { Server, SnailServer, setLocale } from "@snail-js/api";

@Server({ baseURL: process.env.API_BASE_URL ?? "https://api.example.com", timeout: 8000 })
class BackEnd extends SnailServer {}

export const Service = new BackEnd();

// 服务端入口（Node）：不要在这里 use(VueAdapter())
setLocale("zh");
```

`SnailServer` 的构造是**廉价且同步**的：解析选项、建一个 axios 实例、建插件注册表。`use()` 也是同步
的，所以插件必须在第一个请求之前注册好 —— 放在模块作用域正是为了这一点。

### 请求上下文是每次调用独立的

调用一个 api 方法（`userApi.getUser("1")`）会构造一个**新的 `SnailMethod`**，它拥有自己的
`SnailContext`；`send()` 开始时 `ctx.reset(config)` 只清这一次请求的字段，`ctx.state` 的生命周期就是
这一次 `send()`。所以**两个并发的 SSR 渲染不会互相踩**：它们的上下文、`ctx.state`、`ctx.result` 都是
不同的对象。

跨渲染真正共享的是：server 实例本身、它的 axios 实例与插件注册表 —— 这三样本来就是设计成共享的。

::: warning 不要把请求策略的 hook 提到模块作用域
一个 hook 内部只持有**一个** `SnailMethod`（[为什么](./strategies.md#一个方法-多次发送)），所以同一
时刻只能有一个请求。渲染期在渲染函数里创建 hook（每个渲染各得一份），模块作用域只放 server 与
无状态的辅助函数。
:::

### 服务端的面子问题：语言

Node ≥ 21.2 会提供 `navigator.language`（取自操作系统的 ICU 默认语言），`detectLanguage()` 会**优先**
读它，其次才是 `SNAIL_LOCALE` / `LC_ALL` / `LC_MESSAGES` / `LANG`，最后兜底 `"en"`。所以想固定服务端
输出的语言，请显式调用：

```ts
import { setLocale } from "@snail-js/api";

setLocale("zh");        // 或者启动时设置 SNAIL_LOCALE=zh-CN
```

### 服务端的缓存要小心

缓存的 L1 是**进程内存**，L2 在 Node 里默认不存在（既没有 `indexedDB`，也没有默认可用的
`localStorage` —— Node 22.4+ 那个 `localStorage` 要 `--experimental-webstorage` 才启用，而且是**进程级
共享**的；插件在全局缺失时警告一次并退回只用 L1）。而缓存键的哈希只包含 `method` / `baseURL` / `url` /
`params` / `data`（`src/plugins/cache/key.ts`），**header 被刻意排除**。

::: danger 服务端不要用它缓存「每个用户不同」的响应
在浏览器里，「一个 origin 一份存储 = 一个用户」，所以排除 `Authorization` 是对的。在服务端，
**L1 被进程内所有请求、所有用户共享**，于是两个用户请求同一个 `GET` 会命中同一条缓存 —— 这是跨用户
的数据泄漏，而且不会报任何错。

要么服务端不要安装 `Cache()`，要么让每个条目天然按用户隔离（`@Cacheable({ key })` 里带上用户标识，
或让 `prefix` 按用户区分），要么只缓存与用户无关的响应。
:::

## 我**没有**声称的东西

写文档时严格区分「验证过」和「没验证」：

- **没有**声称所有能力在服务端都可用。框架适配器（第 2 条）、浏览器下载（第 1 条）、依赖
  `window` 的刷新信号（第 3 条）都明确不适用于服务端。
- **没有**声称 `useUploader` 适合服务端。它消费的是 `<input type="file">` 交出来的 `File` /
  `FileList`，形状就是浏览器的；服务端上传文件请直接用 `FormData` + 方法（或 `node:fs` 读流），本页
  没有对这条路径做过验证。
- **没有**声称 Web Storage / IndexedDB 的 L2 在 Node 里可用 —— 它们只会退化并警告。
- **没有**声称测试过 Worker / Edge / Deno / Bun 运行时。上面每条关于版本与全局的判断都只针对 Node，
  依据是 Node 自身的文档。
- **没有**声称 `isBrowser()` 被库内部用来分支：它只是一个导出给应用的判断函数。

## 相关

- [服务端配置](./configuration.md)：`@Server(...)` 的每个默认值（含 `adapter`）
- [TypeScript 配置](./typescript.md#环境要求)：`engines` 与各 peer 的版本要求
- [策略概览](./strategies.md)：三个入口如何选择
- [`useDownload`](./strategies/use-download.md)：下载这件事必须发生在浏览器
- [`useFetcher`](./strategies/use-fetcher.md)：SSR 里最常用的策略
