<p>
  <img src="https://img.shields.io/npm/v/typescript?label=TypeScript&color=67C23A&labelColor=1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=Axios&color=67C23A"></img>
</p>

# @snail-js

中文 | [English](./README_EN.MD)

`@snail-js/*` 请求工具集所在的 monorepo。

| 包 | 说明 |
| --- | --- |
| [<img src="https://img.shields.io/npm/v/%40snail-js%2Fapi?label=%40snail-js%2Fapi&labelColor=1e80ff&color=67C23A"></img>](./packages/api) | 装饰器驱动、一切皆插件的 HTTP 客户端，仅基于 axios。 |
| [<img src="https://img.shields.io/npm/v/%40snail-js%2Fapi?label=%40snail-js%2Fcli&labelColor=1e80ff&color=67C23A"></img>](./packages/cli) | 从 OpenAPI 3 文档直接生成带完整类型的前端请求代码。 |
| [<img src="https://img.shields.io/npm/v/%40snail-js%2Fapi?label=%40snail-js%2Fskill&labelColor=1e80ff&color=67C23A"></img>](./packages/skill) | 教 AI 助手正确编写 `@snail-js/api` 代码的 Agent Skill。 |
| [`docs`](./docs) | VitePress 文档站点。 |

## 安装

`npm install @snail-js/api`

## 快速一览

```ts
// service.ts
import { Server, SnailServer } from "@snail-js/api";

@Server({ baseURL: "/api" })
class BackEnd extends SnailServer {}
export const service = new BackEnd();

// user.api.ts
import { Api, Get, Params, Query } from "@snail-js/api";
import { service } from "./service";

export interface User {
  id: number;
  name: string;
}

@Api("/user")
class UserApi {
  /** 方法体永远不会执行 —— 它只用来声明参数类型和返回类型 */
  @Get("/:id")
  getUser(
    @Params("id") id: string,
    @Query("withProfile") withProfile?: boolean
  ): Promise<User> {
    return null!;
  }
}

export const userApi = service.createApi(UserApi);
```

```ts
// data 的类型由方法声明的返回类型推断而来，即 User
const { data } = await userApi.getUser("1").send();

// 也可以用请求策略来驱动（状态适配器由 @Server 的 stateAdapter 决定，默认无框架）
import { useRequest } from "@snail-js/api/strategies";

const { data: current, loading, error, send } = useRequest(userApi.getUser);
await send("1");
```

## 两条引入规则

1. **核心一律从包根引入。**

   ```ts
   import { SnailServer, Server, Api, Get, Post, Query, Data, Params } from "@snail-js/api";
   import { SnailAdapter } from "@snail-js/api";   // 默认状态适配器（框架无关）也在包根
   ```

2. **可选能力从子路径按需引入。**

   ```ts
   import { Cache, Interceptor, RequestPool, Versioning, Validate, Transform } from "@snail-js/api/plugins";

   import { VueRef } from "@snail-js/api/adapter/vue";                    // Vue
   import { ReactState, useMethodState } from "@snail-js/api/adapter/react"; // React

   import { useRequest, usePagination } from "@snail-js/api/strategies"; // 唯一的策略入口，不含框架
   ```

   框架适配器不是一个可安装的插件，而是 `@Server({ stateAdapter })` 上的一个选项：框架只由
   `./adapter/vue` 与 `./adapter/react` 这两个子路径引入，包根、`./plugins` 与 `./strategies`
   都不会触碰它们，于是只想用 `Cache` 的 React 应用不会因为解析不到 `vue` 而失败。默认值是包根
   导出的 `SnailAdapter`（普通 `{ value }` 盒子，值会更新但不会触发渲染）。

## 依赖

运行时依赖只有 `axios`。`vue`、`react`、`zod` 都是**可选**的 peer 依赖，
只有用到对应的适配器、插件或策略时才需要安装。

`reflect-metadata` **不是**依赖，也不需要。TypeScript 7 完整支持旧式装饰器
（`experimentalDecorators: true`）与参数装饰器；而 `emitDecoratorMetadata`
在 TS 7 下不会产出任何内容，本库也从未依赖它 —— 装饰器元数据存放在库内部的
注册表中。

## 开发

```bash
pnpm install
pnpm build        # 构建所有包
pnpm typecheck    # 类型检查所有包
pnpm test         # 运行所有包的测试
pnpm verify       # 通过真实的 exports 映射验证构建产物 @snail-js/api
pnpm docs:check   # 快速检查文档的链接/锚点/代码块围栏（不启动 VitePress 构建）
pnpm docs:dev     # 启动文档站点
```

针对单个包：

```bash
pnpm --filter @snail-js/api   test
pnpm --filter @snail-js/cli   build
pnpm --filter @snail-js/skill test
pnpm --filter @snail-js/docs  docs:build
```

## 许可

MIT
