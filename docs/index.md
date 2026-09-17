---
layout: home

hero:
  name: "@snail-js/api"
  text: 浏览器与服务端通用的 HTTP 客户端
  tagline: 装饰器描述请求，一切皆插件。同一份代码跑在浏览器、Node 与 SSR 里。
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: API 参考
      link: /api/reference

features:
  - title: 只依赖 axios
    details: dependencies 里只有 axios。没有 reflect-metadata，没有 polyfill，没有任何运行时注入。
  - title: 浏览器与服务端
    details: '没有运行时依赖，axios 是 peer；DOM 触点全部有守卫。Node 与 SSR 里可以直接 import 并发请求，需要框架适配器的地方再装。'
  - title: 装饰器描述请求
    details: '@Server @Api @Get @Query … 装饰器只做一件事：往元数据仓库里写数据。请求体永远不会执行。'
  - title: 插件优先
    details: 缓存、请求池、版本、拦截器、校验、转换、框架适配器全部是插件，用的是第三方作者拿到的同一套公开 API。
  - title: 内置插件
    details: 'Cache / RequestPool / Interceptor / Versioning / Validate / Transform 在 @snail-js/api/plugins；Vue 与 React 适配器在 /plugins/vue、/plugins/react，barrel 不静态引入任何框架。'
  - title: 请求策略
    details: 'useRequest / useWatcher / usePagination / useUploader / useDownload … 一套实现、三个入口：Vue、React、plain，只有你导入的那个会引入框架。'
  - title: 类型来自声明
    details: '方法声明的返回类型就是 data 的类型：Promise&lt;User&gt; 让 send() 的 data 直接是 User。'
  - title: 可预测的错误
    details: 每个错误都有稳定的 code 字段；业务码被拒绝时抛出 SnailResponseError，取消被单独区分。
  - title: 按需加载
    details: 核心从包根导入，可选能力从 @snail-js/api/plugins、/plugins/vue、/plugins/react 与 @snail-js/api/strategies 导入。
---

# 文档导览

`@snail-js/api` 是一个从零重写的、装饰器驱动且插件优先的 HTTP 客户端。它把
axios 当作唯一的传输层，自己只负责三件事：**装饰器写入的元数据**、**请求管线**、
**插件生命周期**。所有本页列出的行为都能在
[`packages/api/src`](https://github.com/limingchang/snail) 中找到对应实现。

## 从这里开始

| 我想…… | 看这一页 |
| --- | --- |
| 知道它是什么、和手写 axios 封装的区别 | [简介与设计原则](/guide/introduction) |
| 五分钟跑通第一个请求 | [快速上手](/guide/getting-started) |
| 配好 TypeScript（需要哪些开关、为什么不需要 `reflect-metadata`） | [TypeScript 配置](/guide/typescript) |
| 查某个装饰器怎么用 | [装饰器](/guide/decorators)、[参数装饰器](/guide/parameters) |
| 处理 `{ code, message, data }` 与类型推断 | [响应与类型](/guide/responses) |
| 分支处理各种失败 | [错误处理](/guide/errors) |
| 逐项核对 `@Server(...)` 的默认值 | [服务端配置](/guide/configuration) |
| 在 Node / SSR 里用同一个库 | [在服务端运行（Node / SSR）](/guide/server-side) |
| 接 SSE / WebSocket / 流式响应 | [SSE / WebSocket / HTTP 流](/guide/streaming) |
| 装插件，或者自己写一个 | [使用插件](/guide/plugins)、[编写插件](/guide/plugin-authoring) |
| 查某个内置插件的选项 | [缓存](/guide/plugin-cache)、[请求池](/guide/plugin-pool)、[拦截器](/guide/plugin-interceptor)、[版本](/guide/plugin-versioning)、[校验](/guide/plugin-validate)、[转换](/guide/plugin-transform) |
| 让 `method.meta` 变成响应式 | [框架适配器 Vue / React](/guide/adapters) |
| 用 `useRequest` 之类的请求策略 | [策略概览](/guide/strategies)，每个 hook 各有参考页（[`useDownload`](/guide/strategies/use-download)、[`useRequest`](/guide/strategies/use-request) …） |
| 从旧的 0.1.x 迁过来 | [从 0.1.x 迁移](/guide/migration) |

::: tip 核心与可选能力分开导入
核心永远是 `import { SnailServer, Server, Api, Get } from "@snail-js/api"`；可选能力是
`@snail-js/api/plugins`、`@snail-js/api/plugins/vue`、`@snail-js/api/plugins/react` 与
`@snail-js/api/strategies`。这样打包器才能把用不到的缓存、校验器和框架适配器整块摇掉 ——
尤其是 `vue` / `react`：它们只在对应子路径里被静态引入。
:::

::: warning `@snail-js/api/plugins` 里没有框架适配器
`VueAdapter` 与 `ReactAdapter` 已移动到 `@snail-js/api/plugins/vue` 与
`@snail-js/api/plugins/react`。原因见[框架适配器](/guide/adapters)：那个 barrel 一旦静态
引入框架，只想要 `Cache` 的应用就会被拖上两个框架。
:::
