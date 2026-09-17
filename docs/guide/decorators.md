# 装饰器

本页覆盖服务端与请求声明部分的装饰器：`@Server`、`@Api`、七个请求方式装饰器。
参数类装饰器（`@Params` / `@Query` / `@Data` / `@HeaderValue` / `@Header`）在
[参数装饰器](/guide/parameters)；`@Sse` / `@WebSocket` / `@HttpStream` 在
[SSE / WebSocket / HTTP 流](/guide/streaming)。

## 速查表

| 装饰器 | 作用位置 | 用途 |
| --- | --- | --- |
| `@Server(baseURL)` / `@Server(options)` | 类 | 声明 `extends SnailServer` 子类的配置 |
| `@Api(url?)` / `@Api(options)` | 类 | 标记 api 类，声明路径前缀与名称 |
| `@Get(path?, options?)` | 方法 | 声明 `GET` 请求 |
| `@Post(path?, options?)` | 方法 | 声明 `POST` 请求 |
| `@Put(path?, options?)` | 方法 | 声明 `PUT` 请求 |
| `@Delete(path?, options?)` | 方法 | 声明 `DELETE` 请求 |
| `@Patch(path?, options?)` | 方法 | 声明 `PATCH` 请求 |
| `@Head(path?, options?)` | 方法 | 声明 `HEAD` 请求 |
| `@Options(path?, options?)` | 方法 | 声明 `OPTIONS` 请求 |

## `@Server`

```ts
import { Server, SnailServer } from "@snail-js/api";

@Server({
  baseURL: "https://api.example.com",
  timeout: 10000,
  codeKey: "code",
  messageKey: "message",
  dataKey: "data",
  logLevel: "warn"
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

字符串简写 `@Server("/api")` 完全等价于 `@Server({ baseURL: "/api" })`。

- **必须装饰在 `extends SnailServer` 的子类上。** 选项是在 `SnailServer` 构造函数里通过
  `this.constructor` 读出来的，装饰一个普通类不会创建 server。
- 省略 `@Server(...)` 会在 `new BackEnd()` 时抛出
  `SnailOptionsError`：`服务类[BackEnd]缺少 @Server() 装饰器`。
- `baseURL` 必须是非空字符串；`@Server({ baseURL: "" })` 会抛
  `@Server() 的 baseURL 必须是非空字符串`。
- **可叠加**：重复应用 `@Server(...)` 会把对象合并，后应用的那个（写在更上方、离类更远的
  那个）覆盖先应用的字段，因此 `@Server(base)` + `@Server(overrides)` 是可组合的。
- 元数据沿类原型链查找，所以 `class V2 extends V1` 未声明 `@Server` 时会继承 `V1` 的配置。

每个选项的**真实默认值**见 [服务端配置](/guide/configuration)。

## `@Api`

```ts
@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }
}
```

`@Api(url)` 的 url 是**前缀**，拼接顺序固定为：

```text
server.baseURL  +  api.url  +  method.path
"https://api.example.com" + "/user" + "/:id"  →  /user/42
```

三种写法：

```ts
@Api("/user")                    // 字符串路径前缀
@Api()                           // 无前缀，name 默认取类名
@Api({ url: "/user", name: "user", timeout: 3000 })  // 完整选项
```

`@Api` 的完整选项：

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 路径前缀，默认 `""` |
| `name` | `string` | 该 api 的标识，默认取类名；用于日志、缓存命名空间 |
| `timeout` | `number` | 覆盖 server 的 `timeout` |
| `adapter` | `AxiosRequestConfig["adapter"]` | 覆盖 server 的 adapter |
| `responseType` | `AxiosRequestConfig["responseType"]` | 覆盖 server 的 `responseType` |
| `withCredentials` | `boolean` | 覆盖 server 的 `withCredentials` |

::: warning `@Api()` 目前不是运行时强校验
当前的 `resolveApiOptions` 在没有 `@Api` 元数据时会回退为 `{}`（前缀为空、name 取类名），
并不会抛错。但请始终声明它 —— 它是 api 类的标记，也是插件用来命名缓存条目、解析
`@HitSource` 目标的依据。
:::

`@Api` 同样可叠加并合并字段，规则与 `@Server` 一致。

## 请求方式装饰器

七个装饰器的签名完全一致：

```ts
type RequestMethod = (
  path?: string,
  options?: SnailMethodOptions
) => MethodDecorator;
```

```ts
@Api("/user")
class UserApi {
  @Get("/list")                        // 最简：只给路径
  list(): Promise<User[]> {
    return null!;
  }

  @Post("/", { timeout: 30000 })      // 第二个参数是 axios 选项
  create(@Data() body: NewUser): Promise<User> {
    return null!;
  }

  @Get("/export", { responseType: "blob" })   // 任意 axios 字段都可按方法设置
  export(): Promise<Blob> {
    return null!;
  }
}
```

### `path` 的规则

- 省略或传 `""` 表示「就是 api 前缀本身」。
- `:name` 是路径占位符，值来自 `@Params("name")`，写入 url 时会做 `encodeURIComponent`。
- 占位符没有对应值会抛出 `SnailDecoratorError`，消息形如
  `路由[/user/:id]中的占位符[:id]没有对应的参数值，请在方法参数上添加 @Params('id')`。
- `path` 如果是绝对 url（自带 `//` 或协议），会**直接覆盖**拼接结果 —— 与 axios
  `baseURL` 的语义一致。

### `options` 的规则

`options` 继承 `AxiosRequestConfig`，但 `url`、`method` 由装饰器拥有，因此被排除；
`params` 与 `data` 仍然可用，用于写死请求自带的查询参数与静态请求体：

```ts
@Get("/report", { params: { scope: "all" }, timeout: 60000 })
report(): Promise<Report> {
  return null!;
}
```

优先级（从高到低）：**方法装饰器选项 → `@Api` 选项 → `@Server` 选项**，适用于
`timeout` / `adapter` / `responseType` / `withCredentials`。`params` 是 server 级与
method 级合并（method 覆盖同名 key），随后运行时的 `@Query()` 再覆盖同名 key。

::: tip 进度回调也可以写在 options 里
`onUploadProgress` / `onDownloadProgress` 是合法的 axios 字段，写在方法选项里会**优先于**
`@UploadProgress()` / `@DownloadProgress()` 装饰器。见[上传示例](/examples/upload)。
:::

### 一个方法只能有一个请求方式

```ts
@Api("/dup")
class DupApi {
  @Get("/x")
  @Post("/y")   // ✗ 类定义时立刻抛错
  both(): Promise<void> {
    return null!;
  }
}
```

抛出的是 `SnailDecoratorError`，消息为
`方法[both]上只能使用一个请求方式装饰器（@Get/@Post/...）`。这个校验发生在**类被求值时**，
也就是最早可能的时刻。

### 自定义动词：`Request`

`Request` 是内部的请求方式装饰器工厂，被导出来供需要自定义动词的场景使用：

```ts
import { Request } from "@snail-js/api";

const Get = Request("GET");     // 与内置 @Get 等价
const Post = Request("POST");
```

它的类型是 `(method: SnailMethodType) => (path?, options?) => MethodDecorator`，
其中 `SnailMethodType` 为 `"GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"`。

## 装饰器的执行顺序

理解这一点可以解释「为什么参数装饰器写在方法上却先执行」：

```text
1. 参数装饰器           （按参数下标倒序）
2. 方法装饰器
3. 类装饰器
```

因此参数描述符只会**追加**到同一方法上，最终在发送前按参数下标升序统一应用（见
[参数装饰器](/guide/parameters)）。所有元数据写入都是合并/追加，没有任何一处会覆盖已有值。

## 非请求方法会原样保留

```ts
@Api("/mix")
class MixApi {
  @Get("/")
  get(): Promise<void> {
    return null!;
  }

  helper(): string {
    return "plain";   // 未被装饰，代理会原样交给调用方
  }
}
```

`Service.createApi(MixApi).helper()` 返回 `"plain"` —— api 类可以把自己的辅助函数写在
接口旁边。

## 其它装饰器

| 装饰器 | 文档 |
| --- | --- |
| `@Params` `@Query` `@Data` `@HeaderValue` `@Header` | [参数装饰器](/guide/parameters) |
| `@UploadProgress` `@DownloadProgress` | [上传示例](/examples/upload) |
| `@Sse` `@SseEvent` `@OnSseOpen` `@OnSseError` `@WebSocket` `@OnWs*` `@HttpStream` | [SSE / WebSocket / HTTP 流](/guide/streaming) |
| `createClassDecorator` `createMethodDecorator` `createParamDecorator` `createPropertyDecorator` `customMetadataKey` | [编写插件](/guide/plugin-authoring#自定义装饰器) |
| `Cache` `Interceptor` `Versioning` `Validate` `Transform` | 从 `@snail-js/api/plugins` 导入，见[使用插件](/guide/plugins) |
| `VueAdapter` `ReactAdapter` | 从 `@snail-js/api/plugins/vue`、`@snail-js/api/plugins/react` 导入，见[框架适配器](/guide/adapters) |
