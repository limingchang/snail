# 简介与设计原则

`@snail-js/api` 是一个 TypeScript 优先的 HTTP 客户端：用装饰器描述请求，用声明表达类型，
用插件承载可选能力，而传输层完全交给 [axios](https://axios-http.com/)。

```ts
import { Api, Get, Params, Server, SnailServer } from "@snail-js/api";

@Server({ baseURL: "/api", timeout: 10000 })
class BackEnd extends SnailServer {}
export const Service = new BackEnd();

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<{ id: number; name: string }> {
    return null!;
  }
}

export const userApi = Service.createApi(UserApi);
```

```ts
const { data } = await userApi.getUser("42").send();
//      ^? { id: number; name: string }
```

## 五条设计原则

### 1. 核心只拥有三样东西

核心拥有：**装饰器写入的元数据**、**请求管线**、**插件生命周期**。除此之外什么都没有。
缓存、版本管理、拦截器、zod 校验、JSON→class 转换全部是插件，构建在
第三方作者拿到的同一套公开 API 之上。内置插件没有特权通道：如果某个内置插件需要一个
还不存在的钩子，那个钩子会被加进公开契约，而不是在内部偷偷实现。

框架适配器是这条原则唯一的例外：它不是插件，而是 `@Server({ stateAdapter })` 选项 ——
一次声明同时决定 `method.meta` 上的句柄与每个 `use*` 策略返回的状态，见
[框架适配器](/guide/adapters)。

### 2. 装饰器只写元数据，方法体永不执行

```ts
@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!; // 永远不会运行
  }
}
```

被请求方式装饰器标记的方法不会被调用。`createApi` 把它换成一个返回请求对象的工厂，方法体
只剩两个职责：声明**参数类型**和**返回类型**。因此 `return null!;` 是约定写法（只写
`return null!` 也可以，什么都不声明则返回类型视为 `unknown`）。

### 3. 可选能力皆插件，注册即校验

```ts
Service.use(Interceptor()).use(Versioning({ defaultVersion: "1.0.0" }));
```

`use()` 是同步且可链式的。它在**当场**校验插件名、重复注册和 `dependsOn`，失败时立刻抛出
`SnailPluginError` —— 而不是等到第一个请求才崩。插件的 `install` 可以是异步的，那样它会在
第一次请求前被 `pluginManager.ready` 统一等待。

### 4. 一个方向不够，所以有两个

链式钩子分两个方向执行：

| 阶段 | 方向 | 原因 |
| --- | --- | --- |
| `beforeRequest`、`requestInterceptor` 等 | 正向（优先级高者先） | 拦截器（`100`）必须在缓存（`-100`）计算缓存键**之前**改写请求 |
| `afterResponse`、`responseInterceptor` 等 | 反向（优先级低者先） | 收拢洋葱：离网络最近的插件先看到响应 |

一条规则概括：**正向钩子从最外层进，反向钩子从最内层出**。

### 5. 没有 `reflect-metadata`

类型元数据不是这个库的输入：装饰器只读写**自己**写入的元数据，从来不需要推断构造参数类型。
因此内置的元数据仓库（`WeakMap<owner, Map<slot, Map<key, value>>>`）完全够用，而
`reflect-metadata` 带来的只有一个必须在应用入口 import 的 polyfill。

在 TypeScript 7 里 `emitDecoratorMetadata` 已经不再真的产出 `design:*` 元数据，这个取舍
只是把一件本来就没在用的事说清楚。详见 [TypeScript 配置](/guide/typescript)。

## 与「自己封装一层 axios」的对比

| 关注点 | 手写 axios 封装 | `@snail-js/api` |
| --- | --- | --- |
| 请求声明 | 手写函数 + 拼字符串 | 装饰器声明路径与参数，`:id` 占位符自动 URL 编码 |
| 参数归位 | 每个函数自己组 params / data / headers | `@Params()` / `@Query()` / `@Data()` / `@HeaderValue()` 统一归位，顺序与优先级固定 |
| 响应解包 | 每处 `res.data.data` | `send()` 解析 `{ code, message, data }`，`data` 已拆包 |
| 业务码校验 | 每个调用点 if 判断 | 一条 `validateCode` 规则，拒绝即抛 `SnailResponseError` |
| 类型 | 手动标注泛型 | 由方法声明的返回类型推断 `data` 类型 |
| 横切能力 | 层层手写函数包装 | 插件 + 两条方向的链式钩子，注册顺序可预测 |
| 错误 | 直接抛 `AxiosError` | 稳定 `code` 的错误层次，取消被单独区分为 `SnailCancelledError` |
| 实时通信 | 自己写 SSE / WebSocket 重连 | `@Sse` / `@WebSocket` / `@HttpStream` + 退避重连 |
| 打包体积 | 取决于你写了多少 | 核心从包根导入，可选能力从子路径按需导入 |

::: tip 它不试图取代 axios
axios 的 `AxiosRequestConfig` 是请求方式装饰器第二个参数的基类型：超时、`responseType`、
`adapter`、`withCredentials`、`signal` …… 任何 axios 支持的字段都能按方法设置。
这个库只负责「怎么描述、怎么编排、怎么解包」。
:::

## 适合什么、不适合什么

**适合**：中大型前端应用；后端统一返回 `{ code, message, data }` 类信封；需要缓存、版本、
拦截等横切能力并且希望它们可插拔；团队已经用装饰器（NestJS 风格）思考问题。

**不适合**：只发一两个请求的脚本（直接用 axios 更省事）；后端返回结构完全无规律的接口；
需要在同一处混用多种 HTTP 库的场景。

## 接下来

- [快速上手](/guide/getting-started)：安装到发出第一个请求的完整链路
- [TypeScript 配置](/guide/typescript)：`experimentalDecorators` 与「为什么不需要 reflect-metadata」
- [装饰器](/guide/decorators)：每个装饰器的签名与语义
- [插件生命周期](/guide/plugin-lifecycle)：完整的插件契约
