# 服务端配置

`@Server(...)` 的每个字段都是可选的；未指定的字段使用下面的默认值。解析后的结果类型是
`ResolvedServerOptions`，可以在 `Service.options` 上读到。

```ts
@Server({
  baseURL: "https://api.example.com",
  timeout: 10000,
  logLevel: "warn"
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();

Service.options.baseURL; // "https://api.example.com"
Service.name;            // "BackEnd"
```

## `@Server(...)` 全部选项与真实默认值

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | **被装饰类的类名** | 唯一标识。用于命名插件注册表、缓存条目与日志行，同一应用里的两个 server 不能重名 |
| `baseURL` | `string` | `"/"` | 每个请求 url 的解析前缀。**不能是空字符串**，否则抛 `SnailOptionsError` |
| `timeout` | `number` | `10000` | 请求超时毫秒数 |
| `adapter` | `AxiosRequestConfig["adapter"]` | 未设置 | 交给 axios 自行探测：浏览器用 `xhr`/`fetch`，Node 用 `http` |
| `headers` | `AxiosRequestConfig["headers"]` | 未设置 | 合并进该 server 的每个请求，但**仅在该 header 尚未存在时**写入 |
| `params` | `AxiosRequestConfig["params"]` | 未设置 | 合并进每个请求的查询参数；被方法级 `params` 与运行时 `@Query()` 覆盖同名 key |
| `responseType` | `AxiosRequestConfig["responseType"]` | 未设置 | 三级（方法 → api → server）都未设置时，实际请求回落为 `"json"` |
| `withCredentials` | `boolean` | 未设置（`undefined`） | 跨站请求是否携带 cookie / 认证头，未设置时完全交给 axios |
| `codeKey` | `string` | `"code"` | 业务状态码所在的键名 |
| `messageKey` | `string` | `"message"` | 业务消息所在的键名 |
| `dataKey` | `string` | `"data"` | 业务数据所在的键名 |
| `validateCode` | `(code, envelope) => boolean` | 未设置 | 未设置时接受 `0` 与 `200`；`code` 为 `undefined`/`null` 时直接通过 |
| `logLevel` | `"silent" \| "error" \| "warn" \| "info" \| "debug"` | `"silent"` | 日志级别。**默认不打印任何东西** |
| `coerceJSONString` | `boolean` | `true` | 响应体是 JSON 字符串（含 content-type 写错的情况）时尝试解析 |

::: warning 关于 `name` 的默认值
`DEFAULT_SERVER_OPTIONS.name` 的值是 `"SNAIL_SERVER"`，但这只是一个兜底常量：实际解析时
`resolveServerOptions(serverClass, serverClass.name)` 传入的 fallback 是**类名**，
`declared.name ?? fallbackName` 让类名永远优先。所以默认名字是 `BackEnd` 这种类名，
而不是 `"SNAIL_SERVER"`。日志与 `method.name` 里的 `server.api.method` 用的就是它。
:::

::: warning 默认不打印日志
默认 `logLevel` 是 `"silent"`。这是刻意的：请求库不应在应用没要求时往控制台写东西。
需要排查时显式打开。
:::

## `logLevel` 的判定方式

级别之间有权重（`LOG_LEVEL_WEIGHT`），一条消息在「阈值 ≥ 该消息级别权重」时才会输出：

| 级别 | 权重 | 输出的内容 |
| --- | --- | --- |
| `silent` | `0` | 什么都不输出 |
| `error` | `1` | 请求失败、`afterRequest` / `onError` 钩子抛错 |
| `warn` | `2` | 业务码异常；SSE / WebSocket 重连告警 |
| `info` | `3` | 请求开始/成功、SSE/WebSocket 建连与关闭 |
| `debug` | `4` | 全部，包括流关闭等细节 |

因此 `logLevel: "warn"` 会输出 warn 与 error，`logLevel: "debug"` 输出全部。日志经由
`createLogger(level)` 生成，映射到 `console.error` / `console.warn` / `console.info` /
`console.debug`。插件拿到的是同一个 logger（`ctx.logger`），所以它们也遵守这个级别。

## `@Api(...)` 选项与默认值

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `url` | `string` | `""` | 路径前缀，与 server `baseURL`、方法 path 依次拼接 |
| `name` | `string` | api 类名 | 标识，用于日志与缓存命名空间 |
| `timeout` | `number` | 未设置 | 覆盖 server 的 `timeout` |
| `adapter` | `AxiosRequestConfig["adapter"]` | 未设置 | 覆盖 server 的 `adapter` |
| `responseType` | `AxiosRequestConfig["responseType"]` | 未设置 | 覆盖 server 的 `responseType` |
| `withCredentials` | `boolean` | 未设置 | 覆盖 server 的 `withCredentials` |

## 方法装饰器选项与默认值

请求方式装饰器的第二个参数继承 `AxiosRequestConfig`，但排除 `url`、`method`（由装饰器拥有），
`params`、`data` 仍然可用：

| 字段 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `params` | `Record<string, any>` | 未设置 | 写死的查询参数，与 server `params` 合并（方法优先） |
| `data` | `unknown` | 未设置 | 写死的请求体，作为 `@Data()` 合并的起点 |
| `timeout` | `number` | 未设置 | 覆盖 `@Api` 与 server |
| `adapter` | `AxiosRequestConfig["adapter"]` | 未设置 | 覆盖 `@Api` 与 server |
| `responseType` | `AxiosRequestConfig["responseType"]` | 未设置 | 覆盖 `@Api` 与 server |
| `withCredentials` | `boolean` | 未设置 | 覆盖 `@Api` 与 server |
| `onUploadProgress` / `onDownloadProgress` | `(event) => void` | 未设置 | 覆盖 `@UploadProgress()` / `@DownloadProgress()` 装饰器 |
| 其余 axios 字段 | — | 未设置 | `headers`、`signal`、`transformRequest` …… 均可按方法设置 |

## 解析优先级

`timeout` / `adapter` / `responseType` / `withCredentials` 都是「方法 → api → server」取第一个
有值的；`params` 是 server 与 method 合并后再被运行时 `@Query()` 覆盖；`headers` 的优先级
见[参数装饰器](/guide/parameters#优先级总表)。

```ts
@Server({ baseURL: "/api", timeout: 10000, responseType: "json" })
class BackEnd extends SnailServer {}

@Api({ url: "/slow", timeout: 30000 })
class SlowApi {
  @Get("/report", { timeout: 120000, responseType: "blob" })
  report(): Promise<Blob> {
    return null!;
  }
}
// 实际请求：timeout = 120000，responseType = "blob"
```

## 导出的默认值常量

配置默认值是公开导出的，插件和测试可以直接引用，不要自己硬编码：

```ts
import {
  DEFAULT_ACCEPTED_CODES,
  DEFAULT_API_OPTIONS,
  DEFAULT_RESPONSE_KEYS,
  DEFAULT_SERVER_OPTIONS,
  LOG_LEVEL_WEIGHT
} from "@snail-js/api";

DEFAULT_RESPONSE_KEYS;  // { code: "code", message: "message", data: "data" }
DEFAULT_ACCEPTED_CODES; // [0, 200]
DEFAULT_API_OPTIONS;    // { url: "", name: "" }
DEFAULT_SERVER_OPTIONS; // { name, baseURL, timeout, codeKey, messageKey, dataKey, logLevel, coerceJSONString }
LOG_LEVEL_WEIGHT;       // { silent: 0, error: 1, warn: 2, info: 3, debug: 4 }
```

## 服务实例上的其它成员

| 成员 | 说明 |
| --- | --- |
| `Service.axios` | 该 server 独占的 axios 实例（裸实例：默认值只在请求配置里应用一次） |
| `Service.pluginManager` | 该 server 的插件注册表 |
| `Service.options` | 解析后的 `ResolvedServerOptions` |
| `Service.name` | 解析后的 server 名 |
| `Service.plugins` | 已注册插件名，按正向链顺序 |
| `Service.describe()` | 元数据快照，便于排查与测试 |

```ts
Service.describe();
// {
//   name: "BackEnd",
//   baseURL: "/api",
//   timeout: 10000,
//   codeKey: "code", messageKey: "message", dataKey: "data",
//   logLevel: "silent",
//   plugins: [{ name: "cache", priority: -100 }]
// }
```
