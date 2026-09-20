 # @snail-js/api

> 装饰器驱动、一切皆插件的 TypeScript 请求管理库，仅基于 [axios](https://axios-http.com/)。

<p>
  <img src="https://img.shields.io/npm/v/typescript?label=TypeScript&color=67C23A&labelColor=1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=Axios&color=67C23A"></img>
</p>

[官方文档 | Document](https://limingchang.github.io/snail/)

- **装饰器驱动** — `@Server` / `@Api` / `@Get` 定义请求，设计思想来自 Nest.js
- **一切皆插件** — 缓存、拦截器、请求池、版本、校验、转换全是插件，核心只做三件事；提供 `stateAdapter` 选项，适配无框架、![Vue](https://img.shields.io/npm/v/vue?label=Vue&color=67C23A&labelColor=1e80ff)、![React](https://img.shields.io/npm/v/react?label=React&color=67C23A&labelColor=1e80ff)
- **零运行时依赖** — `dependencies` 是空的；axios 是 peer 依赖，也不需要 `reflect-metadata`
- **完整的类型推断** — 从方法声明的返回类型推断 `data` 类型，无需手写泛型
- **请求策略** — 多场景请求策略 `useRequest` / `usePagination` / `useRetriableRequest` / `useDownload` 等 hook
- **浏览器与服务端皆可** — 核心只用平台能力，没有 DOM 依赖；SSR 与 Node 服务同样适用

## 安装

```bash
pnpm add @snail-js/api axios
```

`vue`、`react`、`zod` 都是**可选**的 peer 依赖，只有用到对应的适配器、插件或策略时才需要安装。

## 快速开始

### 1. 配置 TypeScript

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

> **不需要** `reflect-metadata`，也**不需要** `emitDecoratorMetadata`。
> TypeScript 7 已不再产出 `design:*` 元数据，本库使用自己的元数据存储。
> 如果你从旧版本迁移，请参照[迁移指南](https://snail-js.github.io/api/guide/migration)。

### 2. 创建后端服务端点

```ts
// service.ts
import { Server, SnailServer } from "@snail-js/api";

@Server({ baseURL: "/api", timeout: 5000 })
class BackEnd extends SnailServer {}

export const service = new BackEnd();
```

### 3. 定义 API

```ts
// user.api.ts
import { Api, Data, Get, Params, Post, Query } from "@snail-js/api";
import { service } from "./service";

export interface User {
  id: number;
  name: string;
}

@Api("/user")
class UserApi {
  /** 方法体永远不会执行，它只用来声明参数类型和返回类型 */
  @Get("/:id")
  getUser(@Params("id") id: string, @Query("withProfile") withProfile?: boolean): Promise<User> {
    return null!;
  }

  @Post("/")
  createUser(@Data() payload: Omit<User, "id">): Promise<User> {
    return null!;
  }
}

export const userApi = service.createApi(UserApi);
```

### 4. 发起请求

```ts
// 调用被装饰的方法不会发送请求，它只创建一个待发送的请求对象
const method = userApi.getUser("1");
const { data, code, message, fromCache } = await method.send();

// data 已经被推断为 User —— 无需手写泛型，也不会有 any
console.log(data.name);
```

单个方法实例可以重复使用，参数可以在 `send()` 时覆盖：

```ts
const method = userApi.getUser();
await method.send("1");
await method.send("2");
```

## 返回结构

后端返回的数据默认遵循下面的结构：

```json
{ "code": 0, "message": "ok", "data": {} }
```

三个字段名都可以通过 `@Server({ codeKey, messageKey, dataKey })` 修改；
结构本身可以通过 `declare module` 重定义：

```ts
declare module "@snail-js/api" {
  interface SnailEnvelopeSchema {
    status: number;
    msg: string;
    result: unknown;
  }
}
```

`send()` 返回一个 `SnailResult`，而不是裸的信封：

| 字段 | 说明 |
| --- | --- |
| `data` | **已解包**的业务数据，绝大多数情况下你只需要它 |
| `envelope` | 完整信封 `{ code, message, data }` |
| `response` | 原始 axios 响应 |
| `code` / `message` | 业务状态码与消息 |
| `fromCache` | 是否来自缓存 |
| `config` | 最终生效的请求配置 |

## 插件

插件从子路径按需引入，未使用的插件会被打包器完全剔除：

```ts
import { Cache, Interceptor, RequestPool, Versioning } from "@snail-js/api/plugins";

service
  .use(Interceptor())
  .use(Versioning({ type: "header", defaultVersion: "1.0.0" }))
  .use(Cache({ ttl: 60, l2: "localStorage" }))
  .use(RequestPool({ concurrency: 4, maxQueue: 50, queueTimeout: 10000 }));
```

`use()` 是同步且可链式调用的，插件名重复或依赖缺失会在调用时立即抛错。

请求池用来给并发设上限：浏览器的队列是先进先出、不可见、无法排优先级的，
一个页面的并发爆发会把用户真正在等的那条请求挤到后面。它排在缓存**之后**，
所以缓存能答的请求不会占用并发额度。

## 请求策略

```ts
import { useDownload, useRequest } from "@snail-js/api/strategies";

const { loading, data, error, send, bind } = useRequest(userApi.getUser);
await send("1");

// 下载：只 await「换取临时链接」的那次请求，文件本身交给浏览器原生下载
const { download } = useDownload(reportApi.create);
await download({ from: "2026-01-01" });
```

策略入口只有一个：`@snail-js/api/strategies`，它不引入任何框架。状态适配器是 `@Server` 的选项，
默认是无框架的 `SnailAdapter`（普通 `{ value }` 盒子，值会更新但不会触发渲染）：

```ts
import { VueRef } from "@snail-js/api/adapter/vue";          // Vue 用户；React 用 @snail-js/api/adapter/react

@Server({ baseURL: "/api", stateAdapter: VueRef })
class BackEnd extends SnailServer {}
```

这一次声明同时驱动两处状态：`method.meta` 上的 `data`/`code`/`message`/`loading`/`error` 句柄，
以及每个 `use*` hook 返回的状态（React 侧的 `ReactState` 配合 `useMethodState` 在渲染期绑定）。
某个 hook 想用自己的适配器，可以只覆盖自己那份状态：`useRequest(method, { adapter: VueRef })`。

不想把整个文件读进 JavaScript 内存时用 `useDownload`：它 await 的只是让服务端
生成临时下载链接的那次请求，随后用 `<a>` 触发浏览器原生下载 —— 有进度、可断点
续传、不占内存。`useDownload` 属于策略而非插件，因为它是一次明确的用户动作，
而不是作用于所有请求的横切关注点。

## 文档

完整文档：<https://limingchang.github.io/snail>

- [快速开始](https://snail-js.github.io/api/guide/getting-started)
- [装饰器参考](https://snail-js.github.io/api/guide/decorators)
- [插件生命周期](https://snail-js.github.io/api/guide/plugin-lifecycle)（[English](https://snail-js.github.io/api/guide/plugin-lifecycle_EN)）
- [编写插件](https://snail-js.github.io/api/guide/plugin-authoring)
- [从 0.1.x 迁移](https://snail-js.github.io/api/guide/migration)

## 设计说明

核心只负责三件事，其余能力（插件与状态适配器）都建立在同一套公开 API 之上：

1. 装饰器写入的元数据；
2. 请求管线；
3. 插件生命周期（Koa 风格中间件 + 双向洋葱模型）。

内置插件使用的公开 API 与第三方插件完全相同 —— 不存在内部特权通道。如果你在编写插件，
请阅读[插件生命周期](https://snail-js.github.io/api/guide/plugin-lifecycle)（英文原文见
[Plugin lifecycle](https://snail-js.github.io/api/guide/plugin-lifecycle_EN)）。

## License

[MIT](./LICENSE)
