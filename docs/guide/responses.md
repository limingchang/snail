# 响应与类型

`send()` 解析成一个 `SnailResult`：后端返回数据载荷、拆包后的 `data`、业务码、业务消息、原始 axios
响应、最终请求配置，都在里面。

```ts
const result = await userApi.getUser("42").send();

result.data;      // 已拆包的业务数据
result.code;      // 业务状态码
result.message;   // 业务消息
result.envelope;  // 完整后端返回数据 { code, message, data }
result.response;  // axios 的 AxiosResponse
result.config;    // 最终请求配置
result.fromCache; // 是否来自缓存
```

## 默认后端返回的标准数据载荷

库假设每个 JSON 接口都返回标准数据载荷：

```json
{ "code": 0, "message": "ok", "data": {} }
```

对应的类型是 `SnailEnvelopeSchema`：

```ts
interface SnailEnvelopeSchema {
  code: number;
  message: string;
  data: unknown;
}
```

**类型**和**键名**都可以自定义。

## 自定义键名

`@Server(...)` 上有三个键名选项：

```ts
@Server({
  baseURL: "/api",
  codeKey: "status",
  messageKey: "msg",
  dataKey: "result"
})
class BackEnd extends SnailServer {}
```

于是 `{ "status": 1, "msg": "fine", "result": { "ok": true } }` 会被正确解析，
`result.code === 1`、`result.message === "fine"`、`result.data === { ok: true }`。

`SnailResult` 上的 `code` / `message` / `data` 是**位置**，不是字面键名：键名变了，字段名不变。

## 自定义结构（module augmentation）

用 `declare module` 给 `SnailEnvelopeSchema` 补字段，类型系统会在整个应用范围内生效：

```ts
// app/env.d.ts
declare module "@snail-js/api" {
  interface SnailEnvelopeSchema {
    status: number;
    msg: string;
    result: unknown;
  }
}
```

然后把它和键名一起接到 `SnailServer` 的泛型参数上（顺序是
`<ServerResponse, DataKey, CodeKey, MessageKey>`）：

```ts
import { Server, SnailServer, type SnailEnvelopeSchema } from "@snail-js/api";

@Server({
  baseURL: "/api",
  codeKey: "status",
  messageKey: "msg",
  dataKey: "result"
})
class BackEnd extends SnailServer<SnailEnvelopeSchema, "result", "status", "msg"> {}
```

::: tip 只改结构、不改键名时
`@Server({ baseURL: "/api" })` 就够了 —— `SnailResult` 的 `envelope` 字段会自动带上
augmentation 后的类型，因为 `SnailServer` 的第一个泛型参数默认就是 `SnailEnvelopeSchema`。
:::

::: warning augmentation 是全局的
`declare module "@snail-js/api"` 会给整个工程里的 `SnailEnvelopeSchema` 加字段。如果同一个
应用要对接两套不同结构的后端，请用 `SnailServer` 的泛型参数分别指定各自的数据载荷类型，
而不是只做一次 augmentation。
:::

## `SnailResult` 的全部字段

```ts
interface SnailResult<S, T, D extends string, C extends string, M extends string> {
  /** 原始 axios 响应（含 status / headers / request）。 */
  response: AxiosResponse<SnailEnvelope<S, T, D>>;
  /** 解析后的完整数据。 */
  envelope: SnailEnvelope<S, T, D>;
  /** 已拆包的业务数据 —— envelope[dataKey]。 */
  data: T;
  /** 业务状态码 —— envelope[codeKey]。 */
  code: SnailCodeOf<S, C>;
  /** 业务消息 —— envelope[messageKey]。 */
  message: SnailMessageOf<S, M>;
  /** 是否由缓存提供（而不是网络）。 */
  fromCache: boolean;
  /** 所有插件与策略跑完之后的最终请求配置。 */
  config: InternalAxiosRequestConfig;
}
```

| 字段 | 说明 |
| --- | --- |
| `response` | axios 的完整响应。需要 `status`、`headers`、原始 `request` 时用它 |
| `envelope` | 后端返回的完整数据载荷。业务码失败时不会拿到 `SnailResult`，而是 `SnailResponseError.payload` |
| `data` | 已拆包的业务数据。绝大多数场景只需要它 |
| `code` | 业务码。后端数据载荷里没有该键、或值为 `undefined`/`null` 时，校验直接通过 |
| `message` | 业务消息，同样可能为 `undefined` |
| `fromCache` | 默认 `false`；只有插件调用 `ctx.markCacheHit()` 服务缓存命中时才为 `true` |
| `config` | 最终 `InternalAxiosRequestConfig`，可用于排查实际发出的 url / headers |

::: tip 有意比旧版更丰富
旧版的 `send()` 只把信封交回调用方，想拿 `data` 得自己再拆一层。现在 `data` 已经拆好，
而 `envelope` 与 `response` 依然保留 —— 常见需求走最短路径，罕见需求也不缺信息。
:::

## 载荷类型从哪来

### 从方法声明的返回类型推断

```ts
interface User {
  id: number;
  name: string;
}

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }
}

const { data } = await Service.createApi(UserApi).getUser("42").send();
//      ^? User
```

`SnailApiProxy` 会读取方法声明的返回类型 `R`，做 `Awaited<R>` 后作为 `SnailMethod` 的载荷类型。
所以**声明 `Promise<User>` 就是全部工作**，不需要在调用处写泛型。

### 从调用处的显式泛型覆盖

```ts
const method = Service.createApi(UserApi).getUser<{ nickname: string }>("42");
const { data } = await method.send();
//      ^? { nickname: string }
```

方法声明成 `Promise<void>`（或什么都不声明）时推断结果是 `unknown`，这时显式泛型就是出路。

::: warning 方法体是 `return null!;`
因为代理方法返回的是 `SnailMethod` 而不是 `Promise`，方法体永远不会执行。写
`return null!;` 是为了满足 `Promise<T>` 的返回类型约束，同时也是这个库的约定写法。
:::

## 业务码校验

默认规则：**接受 `0` 和 `200`**。规则本身可以被替换：

```ts
@Server({
  baseURL: "/api",
  validateCode: (code, envelope) => code === 0 || code === 200 || code === 304
})
class BackEnd extends SnailServer {}
```

`validateCode` 的签名是 `(code: number | string, envelope: unknown) => boolean`。
返回 `false` 时，`send()` **以 `SnailResponseError` reject**：

```ts
try {
  await userApi.getUser("42").send();
} catch (error) {
  if (error instanceof SnailResponseError) {
    error.businessCode; // 被拒绝的业务码
    error.payload;      // 完整信封，仍可读 payload.message / payload.data
  }
}
```

两条补充规则：

- 信封里**没有** `codeKey` 对应的键，或该值是 `undefined`/`null` 时，校验直接通过 ——
  纯文件下载类接口不会被业务码规则误伤。
- `error.response.code` 这条本地化消息形如
  `[BackEnd.UserApi.getUser] 业务状态码校验未通过：code=500`。详见[错误处理](/guide/errors)。

::: warning `onCodeError` 只能观察，不能恢复
`method.onCodeError(cb)` 是事件订阅：回调跑完之后，`send()` 仍然会以 `SnailResponseError`
reject。想「拦住」失败只能靠插件的 `beforeRequest`（例如缓存命中）。五个方法事件的完整清单、
触发时机与取消订阅语义见[方法事件](/guide/events)，与错误层次的关系见
[错误处理](/guide/errors#onerror-与-oncodeerror)。
:::

## 非信封响应（除 blob / text 之外）

axios 的 `responseType` 为 `blob` / `arraybuffer` / `stream` / `document`，或后端直接返回
纯文本时，响应体里根本没有 `code`/`message`/`data`。这类载荷会**整体穿过**，`data` 就是
响应体本身：

```ts
@Api("/file")
class FileApi {
  @Get("/report.pdf", { responseType: "blob" })
  download(): Promise<Blob> {
    return null!;
  }

  @Get("/readme", { responseType: "text" })
  readme(): Promise<string> {
    return null!;
  }
}

const { data } = await fileApi.download().send();
//      ^? Blob —— result.envelope 也是同一个 Blob
```

对应的类型工具是：

```ts
type SnailRawPayload = Blob | ArrayBuffer | ReadableStream<Uint8Array> | FormData | Document;

type IsRawPayload<T> = T extends SnailRawPayload ? true : false;

type SnailEnvelope<S, T, D extends string = "data"> =
  IsRawPayload<T> extends true ? T : S extends Record<string, any> ? S & Record<D, T> : Record<D, T>;
```

| 声明的返回类型 | `data` 运行时值 | 说明 |
| --- | --- | --- |
| `Promise<Blob>`（`responseType: "blob"`） | `Blob` | 二进制下载 |
| `Promise<ArrayBuffer>`（`responseType: "arraybuffer"`） | `ArrayBuffer` | 同上 |
| `Promise<string>`（`responseType: "text"`） | `string` | 纯文本 |
| `Promise<FormData>` | `FormData` | 少见，但类型上被支持 |
| `Promise<T>`（默认 `responseType: "json"`） | `envelope.dataKey` | 标准信封 |

::: tip JSON 装了错的 content-type 也能救回来
有些网关用 `Content-Type: text/plain`（或干脆不带该头）返回 JSON 信封。
`@Server({ coerceJSONString: true })`（**默认开启**）会在响应体是字符串且以 `{` 或 `[` 开头时
尝试 `JSON.parse`，避免「类型说是对象、运行时却是字符串」这种静默 bug。解析失败则原样返回，
所以真正的文本响应不受影响。
:::

## 重复发送同一个请求对象

`SnailMethod` 可以多次 `send()`。每次发送都会重置上下文（清空 `ctx.state`、`response`、
`result`、`error` 与路径参数，重建 AbortController 与请求配置），因此上一次发送里插件的改动
不会泄漏到下一次；`result` / `error` / `request` 这三个 getter 反映的都是**最近一次**的结果。

```ts
const method = userApi.getUser("42");

await method.send();
console.log(method.result?.data);   // 最近一次成功的结果

await method.send("43");            // 用新参数重发
console.log(method.request.url);    // /user/43
```
