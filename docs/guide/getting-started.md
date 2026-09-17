# 快速上手

这一页把「装包 → 配置 TypeScript → 定义 server → 定义 api → 发请求」整条链路走完，
所有代码片段都可以直接粘贴运行。

## 1. 安装

`axios` 是 peer dependency，需要和库一起安装。

::: code-group

```bash [pnpm]
pnpm add @snail-js/api axios
```

```bash [npm]
npm install @snail-js/api axios
```

```bash [yarn]
yarn add @snail-js/api axios
```

:::

::: tip 不需要 reflect-metadata
`@snail-js/api` 的 `dependencies` 里只有 axios。不要再装或 import `reflect-metadata`，
也不要打开 `emitDecoratorMetadata`。理由见 [TypeScript 配置](/guide/typescript)。
:::

## 2. 打开 `experimentalDecorators`

装饰器是本库的使用方式，所以这个开关是必须的：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

完整的配置说明、以及与旧版 `0.1.x` 文档里那份 tsconfig 的差异，见
[TypeScript 配置](/guide/typescript)。

## 3. 定义 server

一个 server 类 = 一个 axios 实例 + 一份解析后的配置 + 一个插件注册表。继承 `SnailServer`，
用 `@Server(...)` 装饰，然后**实例化一次并导出**。

```ts
// src/service.ts
import { Server, SnailServer } from "@snail-js/api";

@Server({
  baseURL: "/api",
  timeout: 10000
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

可选的简写形式 `@Server("/api")` 等价于 `@Server({ baseURL: "/api" })`。

::: warning 三个容易踩的点
1. `@Server(...)` 必须装饰在 `extends SnailServer` 的**子类**上 —— 选项是在
   `SnailServer` 构造函数里通过 `this.constructor` 读出来的。
2. 忘了 `@Server(...)` 会在实例化时直接抛 `SnailOptionsError`：
   `服务类[BackEnd]缺少 @Server() 装饰器`。
3. `baseURL` 不能是空字符串，`@Server({ baseURL: "" })` 会抛
   `@Server() 的 baseURL 必须是非空字符串`。省略该字段时默认是 `"/"`。
:::

## 4. 定义 api

api 类用 `@Api(url)` 装饰，方法用请求方式装饰器标记。被标记的方法体永远不会执行，
它只用来声明参数和返回类型 —— 所以约定写 `return null!;`。

```ts
// src/user.api.ts
import { Api, Data, Get, Params, Post, Query } from "@snail-js/api";
import { Service } from "./service";

export interface User {
  id: number;
  name: string;
}

@Api("/user")
class UserApi {
  /** GET /api/user/:id */
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }

  /** GET /api/user?page=1&size=20 */
  @Get("/")
  list(
    @Query() page: { page: number; size: number }
  ): Promise<{ total: number; items: User[] }> {
    return null!;
  }

  /** POST /api/user */
  @Post("/")
  create(@Data() body: { name: string }): Promise<User> {
    return null!;
  }
}

export const userApi = Service.createApi(UserApi);
```

`Service.createApi(UserApi)` 返回一个代理。代理方法被调用时**只构造请求对象，不发请求**，
所以返回的是 `SnailMethod`。

## 5. 发请求

```ts
const { data, code, message, fromCache } = await userApi.getUser("42").send();
console.log(data.name);
```

`send()` 解析成 `SnailResult`，字段含义见 [响应与类型](/guide/responses)。

如果需要「拿到句柄 → 订阅事件 → 稍后再发」（表单提交、按钮点击等场景）：

```ts
const method = userApi.create({ name: "ada" });

method.onSuccess((result) => console.log("ok", result.data));
method.onError((error) => console.error("failed", error));
method.onFinish(() => console.log("settled"));

await method.send();
```

`send()` 也可以覆盖代理时传入的参数：

```ts
const bound = userApi.getUser("from-proxy");
await bound.send();          // GET /api/user/from-proxy
await bound.send("other");   // GET /api/user/other
```

## 6. 完整的最小可运行文件

把下面这段单独跑起来（需要一个返回 `{ code: 0, message: "ok", data: {...} }` 的后端，
或者把 `adapter` 换成 [测试用适配器](/guide/plugin-authoring#在测试里替换-adapter)）：

```ts
import {
  Api,
  Get,
  Params,
  Query,
  Server,
  SnailServer,
  type SnailResult
} from "@snail-js/api";

@Server({ baseURL: "/api", timeout: 10000 })
class BackEnd extends SnailServer {}

const Service = new BackEnd();

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(
    @Params("id") id: string,
    @Query("withProfile") withProfile?: boolean
  ): Promise<{ id: number; name: string }> {
    return null!;
  }
}

const userApi = Service.createApi(UserApi);

async function main(): Promise<void> {
  const result: SnailResult<
    { code: number; message: string; data: unknown },
    { id: number; name: string }
  > = await userApi.getUser("1", true).send();

  console.log(result.code, result.message, result.data, result.fromCache);
}

void main();
```

## 下一步

- [TypeScript 配置](/guide/typescript) —— 为什么只要一个开关
- [装饰器](/guide/decorators) / [参数装饰器](/guide/parameters) —— 完整清单与优先级
- [响应与类型](/guide/responses) —— 信封、`SnailResult`、自定义 key 与结构
- [错误处理](/guide/errors) —— 业务码失败与网络失败的区别
- [使用插件](/guide/plugins) —— 装上缓存、拦截器等可选能力
