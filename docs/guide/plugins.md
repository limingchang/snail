# 使用插件

插件是可选能力的唯一载体：缓存、请求池、版本、拦截器、校验、转换全部是插件。把它们与核心分开
导入，打包器才能把用不到的部分整块摇掉。**框架适配器不是插件** —— 它是
[`@Server({ stateAdapter })`](./adapters.md) 这个 server 选项。

## 四条导入路径

```ts
// 1. 核心 —— 永远从包根导入
import { SnailServer, Server, Api, Get, Query, createPlugin, SnailAdapter } from "@snail-js/api";

// 2. 可选插件 —— 框架无关的那一批
import { Cache, Interceptor, RequestPool, Versioning, Validate, Transform } from "@snail-js/api/plugins";

// 3. 框架适配器 —— 各自独立子路径，避免别的 barrel 静态引入 vue / react
import { VueRef } from "@snail-js/api/adapter/vue";
import { ReactState, useMethodState } from "@snail-js/api/adapter/react";

// 4. 请求策略 —— 不 import 任何框架，框架由 server 的 stateAdapter 决定
import { useRequest, usePagination } from "@snail-js/api/strategies";
```

::: warning 为什么框架适配器不在 `@snail-js/api/plugins` 里
那个 barrel 只导出与框架无关的插件：一旦它再导出 `VueRef` / `ReactState`，它就会**静态**
import `vue` 和 `react`，于是只想用 `Cache` 的 React 应用会因为解析不到 `vue` 而构建失败，
与框架无关的应用则会把两个框架都打进 bundle。

框架的选择不是一个「装不装」的插件，而是一个 server 选项：

```ts
import { VueRef } from "@snail-js/api/adapter/vue";

@Server({ baseURL: "/api", stateAdapter: VueRef })
class BackEnd extends SnailServer {}
```

只有 `@snail-js/api/adapter/vue` 与 `@snail-js/api/adapter/react` 这两个专属子路径会 import
`vue` / `react`，所以可选 peer 才真的可选。完整映射见[框架适配器](./adapters.md)。
:::

## 内置插件一览

| 插件 | `name` | 优先级 | 一句话 | 参考 |
| --- | --- | --- | --- | --- |
| `Interceptor()` | `interceptor` | `100` | 类 / 方法 / 服务级拦截器，`onRejected` 是唯一的恢复点 | [拦截器](./plugin-interceptor.md) |
| `Versioning({...})` | `versioning` | `50` | url / header / query / custom 四种版本载体 | [版本](./plugin-versioning.md) |
| `Transform()` | `transform` | `0` | JSON → 类实例，自带水合引擎 | [转换](./plugin-transform.md) |
| `Validate()` | `validate` | `-50` | zod 校验：请求硬失败，响应只警告 | [校验](./plugin-validate.md) |
| `Cache({...})` | `cache` | `-100` | 多级缓存、TTL / LRU、标签失效、去重、SWR | [缓存](./plugin-cache.md) |
| `RequestPool({...})` | `pool` | `-150` | 并发上限 + 有优先级、有界、可超时的等待队列 | [请求池](./plugin-pool.md) |

`useTokenAuth` 返回的也是一个插件（`name: "token-auth"`、`priority: 20`），见
[`useTokenAuth`](./strategies/use-token-auth.md)。框架适配器（`SnailAdapter` / `VueRef` /
`ReactState`）**不是**插件，它们通过 [`@Server({ stateAdapter })`](./adapters.md) 声明。

请求策略（`useRequest` / `useWatcher` / `useFetcher` / `usePagination` / `useAutoRequest` /
`useRetriableRequest` / `useUploader` / `useTokenAuth` / `useSSE` / `useDownload`）不是插件，而是驱动
一个 `SnailMethod` 的状态机，见[策略概览](./strategies.md) —— 每个 hook 都有一页自己的参考。

## 安装

```ts
import { Interceptor, Versioning } from "@snail-js/api/plugins";
import { Service } from "./service";

Service.use(Interceptor()).use(Versioning({ defaultVersion: "1.0.0" }));
```

- `use()` 是**同步且可链式**的 —— 它返回 `this`，所以 `Service.use(A()).use(B())` 自然成立。
- 它**当场校验**：插件无名、重名、`dependsOn` 未满足都会立刻抛 `SnailPluginError`，
  在任何状态被改动之前。
- 也可以直接传工厂本身：`Service.use(Cache)` 等价于 `Service.use(Cache())`
  （内部会以无参数调用它）。

::: tip 注册顺序不等于执行顺序
执行顺序由 `priority` 决定，注册顺序只在优先级相同时作为稳定的决胜规则。
:::

## 排序与优先级

插件按 `priority` **降序**排序；**正向**钩子从高优先级开始，**反向**钩子从低优先级开始。

| 优先级 | 插件 |
| --- | --- |
| `100` | interceptor（`INTERCEPTOR_PRIORITY`） |
| `50` | versioning（`VERSIONING_PRIORITY`） |
| `20` | `useTokenAuth`（`TOKEN_AUTH_PRIORITY`，由调用返回，不是内置插件） |
| `0` | 用户插件、transform（`TRANSFORM_PRIORITY`） |
| `-50` | validate（`VALIDATE_PRIORITY`） |
| `-100` | cache（`CACHE_PRIORITY`） |
| `-150` | request pool（`POOL_PRIORITY`） |

`priority` 是一个**无上界的数字**，不是一个只有几档的槽位表：任何整数都合法，二十几个插件也
不会互相碰撞 —— 只有**完全相等**才算并列，并列时按注册顺序决定先后。这张表是「具名参考档位」，
不是「一共只有七个位置」。

六个插件常量从 `@snail-js/api/plugins` 导出，`TOKEN_AUTH_PRIORITY` 从
`@snail-js/api/strategies` 导出：

```ts
import {
  CACHE_PRIORITY,        // -100
  INTERCEPTOR_PRIORITY,  //  100
  POOL_PRIORITY,         // -150
  TRANSFORM_PRIORITY,    //    0
  VALIDATE_PRIORITY,     //  -50
  VERSIONING_PRIORITY    //   50
} from "@snail-js/api/plugins";
```

要让自己的插件落在某个内置插件旁边，**相对它定位**，而不是硬编码一个魔法数字：

```ts
import { createPlugin } from "@snail-js/api";
import { CACHE_PRIORITY } from "@snail-js/api/plugins";

export const KeyRewrite = createPlugin({
  name: "key-rewrite",
  priority: CACHE_PRIORITY + 1,   // 正向紧挨着缓存之前，反向紧挨着它之后
  /* … */
});
```

```ts
interface SnailPluginObject<O = unknown> {
  readonly name: string;              // 同一 server 内唯一
  readonly priority?: number;         // 默认 0，越大越先进入正向相位
  readonly dependsOn?: readonly string[];
  // …可选的生命周期钩子，见插件生命周期
}
```

为什么需要两个方向：缓存插件是**最后**看到请求的（它必须等 url 与 body 定稿才能计算缓存键），
却是**最先**看到响应的（它要在校验与转换动到信封之前把原始信封存下来）。一条单向洋葱表达不了
「后进先出」，所以正向 / 反向两条规则并存 —— 详见
[插件生命周期](/guide/plugin-lifecycle#_2-2-为什么是两种顺序-而不是一种)。

## 同步注册、异步安装

- **同步** `install` 在 `use()` 期间就跑完，所以它注册的 `initMeta` 之类的钩子在第一次
  `createApi()` 之前就已存在；
- **异步** `install` 被记录在案，并由 `pluginManager.ready` 在第一次请求前统一 `await`；
- `install` 抛错会让注册**回滚**，不会留下半装状态。

## 卸载

```ts
await Service.remove("cache");     // 按名字
await Service.remove(cachePlugin); // 按实例
Service.hasPlugin("cache");        // boolean
Service.plugins;                   // 已注册插件名，正向链顺序

await Service.dispose();           // 卸载全部插件（反向注册顺序）
```

`Service.remove(...)` 返回 `boolean`：名字不存在时返回 `false`（不会抛错）。
注册表层面的 `pluginManager.remove(name)` 在插件不存在时会抛
`插件[cache]未在服务[SVC]上注册`。

## 注册会遇到的错误

| 场景 | 错误消息 |
| --- | --- |
| `use()` 传入的不是对象 | `[snail] use() expects a plugin object` |
| 插件没有 `name` | `[snail] a plugin must declare a non-empty \`name\`` |
| 同名插件注册两次 | `插件[cache]已在服务[SVC]上注册，请勿重复注册` |
| `dependsOn` 的插件还没注册 | `插件[version]依赖的插件[interceptor]尚未注册，请先 use() 它` |
| `install` 抛错 | `[snail] plugin "cache" failed to install: …`（注册被回滚） |

## 一个最小插件

不依赖任何内置插件也能验证这条链路。下面这个插件记录每个请求的耗时：

```ts
import { createPlugin } from "@snail-js/api";
import { Service } from "./service";

export const Timing = createPlugin({
  name: "timing",
  priority: 20,

  beforeRequest(ctx) {
    ctx.state.set("t0", Date.now());
  },
  afterRequest(ctx) {
    const t0 = ctx.state.get<number>("t0");
    if (t0 !== undefined) {
      console.log(`${ctx.fullName} 耗时 ${Date.now() - t0}ms`);
    }
  }
});

Service.use(Timing());
```

注意 `afterRequest` 在 `finally` 里执行，所以**失败与取消也会记录**。
`ctx.state` 是每个 `send()` 独立的插件暂存区；`ctx.meta` 才是给调用方渲染用的响应式值，
不要把内部记账写进 `meta`。完整的钩子清单、`ctx` 全部成员与链式不变量见
[插件生命周期](/guide/plugin-lifecycle)；自己写一个可分发的插件见
[编写插件](/guide/plugin-authoring)。
