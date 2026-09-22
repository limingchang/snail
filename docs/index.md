---
layout: home

hero:
  name: "@snail-js"
  text: 请求、生成、编辑、组件
  tagline: 只依赖 axios —— 装饰器描述请求，可选能力皆为插件，一套约定贯穿四个包。
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: API 参考
      link: /api/reference

features:
  - title: "@snail-js/api"
    details: 装饰器驱动的 HTTP 客户端。@Server / @Api / @Get 描述请求，插件系统，请求策略，适配vue/react的state。
    link: /guide/introduction
    linkText: 阅读文档
  - title: "@snail-js/cli"
    details: 自动化从 OpenAPI 3.0 / 3.1 文档生成带完整类型的`@snail-js/api`代码。
    link: /cli/
    linkText: 阅读文档
  - title: "@snail-js/editor"
    details: 基于 Tiptap 的模板文档编辑器。真实分页与页眉页脚、变量填充、二维码、水印，以及浏览器原生打印。
    link: /editor/
    linkText: 阅读文档
  - title: "@snail-js/vue"
    details: Vue 3 组件库。新增图标，阿里验证码、点击复制、右键菜单与 3D 词云。
    link: /vue/
    linkText: 阅读文档
---

# 文档导览

`@snail-js` 是一组围绕同一套约定的前端工具包。四个包的共同前提只有两条：**传输层用
axios**，以及**可选能力一律按需引入**，所以不用的东西不会进你的 bundle。

| 包 | 它解决什么 | 从哪看起 |
| --- | --- | --- |
| [`@snail-js/api`](/guide/introduction) | 用装饰器描述接口，用插件承载缓存、校验、转换、请求池 | [快速上手](/guide/getting-started) · [API 参考](/api/reference) |
| [`@snail-js/cli`](/cli/) | 把 OpenAPI 文档变成上面那种接口类 | [`snail generate`](/cli/#snail-generate) |
| [`@snail-js/editor`](/editor/) | 合同模板的编写、变量填充与打印 | [快速上手](/editor/#快速上手) |
| [`@snail-js/vue`](/vue/) | Element Plus 没有的图标，以及几个自用组件 | [组件总览](/vue/#组件总览) |

## 从这里开始（@snail-js/api）

| 我想…… | 看这一页 |
| --- | --- |
| 知道它是什么、和手写 axios 封装的区别 | [简介与设计原则](/guide/introduction) |
| 五分钟跑通第一个请求 | [快速上手](/guide/getting-started) |
| 配好 TypeScript（需要哪些开关、为什么不需要 `reflect-metadata`） | [TypeScript 配置](/guide/typescript) |
| 查某个装饰器怎么用 | [装饰器](/guide/decorators)、[参数装饰器](/guide/parameters) |
| 处理 `{ code, message, data }` 与类型推断 | [响应与类型](/guide/responses) |
| 分支处理各种失败 | [错误处理](/guide/errors) |
| 订阅请求事件（success / error / finish / cache） | [方法事件](/guide/events) |
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
