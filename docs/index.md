---
layout: home

hero:
  name: "@snail-js/api"
  text: 装饰器驱动的 HTTP 请求库
  tagline: 基于 axios —— 装饰器描述请求，可选能力皆为插件，同时提供多种请求策略。
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: API 参考
      link: /api/reference

features:
  - title: 装饰器描述请求
    details: '@Server @Api @Get @Query … 请求从装饰器创建，随处调用，并提供完整的Typing。`@Server({ stateAdapter })` 多框架state适配。'
  - title: 插件优先
    details: 提供内置插件：缓存、请求池、版本、拦截器、校验、转换，你也可以按需求开发自己的插件，没有内部特权通道。
  - title: 请求策略
    details: 'useRequest / useWatcher / usePagination / useUploader / useDownload … 一套实现，可适配 Vue、React 或无框架；框架由 server 的 stateAdapter 决定，只有对应的 adapter 子路径会引入框架。'
  - title: 浏览器与服务端
    details: 核心只用平台能力，DOM 触点全部有守卫；Node 与 SSR 里可以直接 import 并发请求，要用响应式句柄时再按需声明 stateAdapter。
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
`@snail-js/api/plugins`、`@snail-js/api/strategies`，以及两个框架适配器子路径
`@snail-js/api/adapter/vue` / `@snail-js/api/adapter/react`。这样打包器才能把用不到的缓存、
校验器和适配器整块摇掉 —— 尤其是 `vue` / `react`：只有这两个 adapter 子路径会静态引入它们。
:::

::: warning 框架适配器是一个 server 选项，不是插件
`@Server({ stateAdapter })` 一次声明同时决定 `method.meta` 上的句柄和每个 `use*` 策略返回的
状态；不写它就是默认的 `SnailAdapter`（普通 `{ value }` 盒子，不 import 任何框架）。详见
[框架适配器](/guide/adapters)：把一个框架从插件改成选项，是因为插件与「进程级注册」的旧组合
让同一个进程里的两个 server 无法使用不同框架。
:::
