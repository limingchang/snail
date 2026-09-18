# 错误处理

本库抛出的每个错误都继承自 `SnailError`，并且带一个**稳定的 `code` 字段** —— 不想 import
类的时候，可以只判断 `error.code`。

```ts
import { SnailError, SnailResponseError } from "@snail-js/api";

try {
  await userApi.getUser("42").send();
} catch (error) {
  if (error instanceof SnailResponseError) {
    toast(error.payload.message ?? "业务失败");
  } else if (error instanceof SnailError) {
    console.error(error.code, error.message);
  } else {
    throw error; // 不是本库的错误
  }
}
```

## 错误层次

```text
Error
└── SnailError                      code: "SNAIL_ERROR"
    ├── SnailDecoratorError         code: "SNAIL_DECORATOR_ERROR"
    ├── SnailOptionsError           code: "SNAIL_OPTIONS_ERROR"
    ├── SnailPluginError            code: "SNAIL_PLUGIN_ERROR"     + pluginName
    ├── SnailHookError              code: "SNAIL_HOOK_ERROR"       + hook
    ├── SnailRequestError           code: "SNAIL_REQUEST_ERROR"
    ├── SnailTimeoutError           code: "SNAIL_TIMEOUT_ERROR"    + timeout
    ├── SnailCancelledError         code: "SNAIL_CANCELLED"
    ├── SnailResponseError          code: "SNAIL_RESPONSE_ERROR"   + businessCode, payload
    └── SnailHttpError              code: "SNAIL_HTTP_ERROR"       + status, statusText, payload
```

插件可以贡献自己的 `SnailError` 子类，它们同样落在这一层里：校验插件贡献的
`SnailValidationError`（`code: "SNAIL_VALIDATION_ERROR"`，额外带 `issues`）从
`@snail-js/api/plugins` 导出，见[校验插件](./plugin-validate.md)。

`SnailError` 本身提供：

| 成员 | 说明 |
| --- | --- |
| `message` | 已经过本地化的可读消息（见[本地化](/guide/localization)） |
| `code` | 机器可读的稳定标识，上表已列出 |
| `cause` | 底层原因，通常是原始的 `AxiosError` |
| `name` | 具体子类名（由 `new.target.name` 赋值） |
| `SnailError.isSnailError(value)` | 类型守卫：`value is SnailError` |

## 各类错误在什么时候出现

| 错误类 | 出现时机 | 额外字段 |
| --- | --- | --- |
| `SnailDecoratorError` | 装饰器用错：一个方法挂两个请求方式装饰器、参数装饰器用在构造函数上、`@Query("")` 空 key；或 `send()` 时无 key 参数不是普通对象、`:placeholder` 缺值；或 `createSse` / `createWebSocket` 的类缺少对应装饰器 | — |
| `SnailOptionsError` | `new BackEnd()` 时缺少 `@Server(...)`、`baseURL` 为空字符串；`@Api` 的 `url` 不是字符串 | — |
| `SnailPluginError` | `use()` 时插件无名、重名、`dependsOn` 未满足；`install` 抛错（注册会回滚）；`remove()` 一个未注册的插件 | `pluginName` |
| `SnailHookError` | 某个链式钩子里 `next()` 被调用多次 | `hook` |
| `SnailRequestError` | 请求没有产出响应；SSE / WebSocket / HTTP 流建立失败 | — |
| `SnailTimeoutError` | axios 报 `ECONNABORTED` / `ETIMEDOUT` | `timeout` |
| `SnailCancelledError` | `method.abort()`、调用方给的 `AbortSignal` 被触发，或插件的 `interrupt()` 没有附带响应 | — |
| `SnailResponseError` | HTTP 成功、但业务码被 `validateCode`（或默认规则）拒绝 | `businessCode`、`payload` |
| `SnailHttpError` | 已导出，但**当前核心不会主动抛出它**；留给插件与调用方复用同一套错误形状 | `status`、`statusText`、`payload` |

::: warning 传输层错误通常是原始 `AxiosError`
只有**超时**与**取消**会被翻译成 `SnailTimeoutError` / `SnailCancelledError`。
其它 axios 失败（HTTP 4xx/5xx、DNS、CORS、断网）会被**原样抛出**，所以
`error instanceof SnailHttpError` 目前为 `false`，你拿到的是 axios 的 `AxiosError`。需要统一
形状时，在 `onError` 或调用处自行收拢。
:::

## 业务码校验：`validateCode`

默认规则接受 `0` 与 `200`（字符串形式也接受，比较前会 `String()` 归一）。要换规则就在
`@Server(...)` 上传函数：

```ts
@Server({
  baseURL: "/api",
  validateCode: (code, envelope) => code === 1 || code === "SUCCESS"
})
class BackEnd extends SnailServer {}
```

规则返回 `false` → 抛 `SnailResponseError`：

```ts
error.businessCode; // 5xx 之外的后端业务码，例如 500
error.payload;      // 完整信封，仍可读 payload.message / payload.data
error.cause;        // undefined —— 这是业务失败，不是传输失败
```

两条边界：

- 信封中**不存在** `codeKey`、或其值为 `undefined` / `null` 时，校验**直接通过**。
- 校验发生在 `afterResponse` 链之后、构建 `SnailResult` 之前，所以插件可以在 `afterResponse`
  里合法地改写响应体（例如解密），校验看到的是改写后的结果。

## `onError` 与 `onCodeError`

两者**互斥**，取决于错误的种类：

```ts
const method = userApi.getUser("42");

// 业务码被拒绝时触发；传输失败、取消、装饰器错误不会走这里
method.onCodeError(({ code, payload, error }) => {
  toast(String(payload && (payload as any).message));
});

// 其它任何失败都走这里
method.onError((error) => console.error(error));
```

| 事件 | 触发条件 | 载荷 |
| --- | --- | --- |
| `codeError` | 错误是 `SnailResponseError` | `{ code, payload, error }` |
| `error` | 其它任何错误（包括取消，因为 `SnailCancelledError` 不是 `SnailResponseError`） | `unknown` |

失败之外的两个事件 —— `success` 与 `finish`（缓存命中时还有 `cache`）—— 以及它们的触发时机
见[方法事件](/guide/events)。

::: warning `onCodeError` 不能恢复
它只是**观察**：所有 `onCodeError` 回调跑完后，`send()` 仍然以 `SnailResponseError` reject。
同理，插件的 `onError` 钩子也只能观察 —— 错误会在所有 `onError` 跑完后重新抛出。想「接住」
一个请求，唯一的位置是 `beforeRequest`（写 `ctx.response` 并 `ctx.interrupt()`）。

这是相对旧版的**故意行为变更**：旧实现的 `onCodeError` 会因为吞掉异常而让调用方以为请求成功。
:::

`onFinish` 与 `onCodeError` 的组合使用：

```ts
const seen: string[] = [];
const method = userApi.getUser("42");

method.onCodeError((event) => seen.push(`code:${event.code}`));
method.onFinish(() => seen.push("finish"));

await method.send().catch(() => undefined);
// seen === ["code:500", "finish"]
```

## 取消

```ts
const method = userApi.getUser("42");
const promise = method.send();

method.abort();                       // 可选：method.abort(new Error("用户离开"))

await promise;                        // reject: SnailCancelledError
```

取消是**预期内的控制流**，不是失败：

- axios 的 `isCancel` / `ERR_CANCELED`、超时之外的 abort 都会归一为 `SnailCancelledError`；
- `code` 是 `"SNAIL_CANCELLED"`；
- 策略（`@snail-js/api/strategies`）会刻意吞掉这一类错误而不当作失败上报；
- `finish` 事件照常触发，`afterRequest` 钩子照常执行。

`ctx.interrupt()` 不带响应时，`send()` 也会以 `SnailCancelledError` reject：

```ts
beforeRequest(ctx) {
  ctx.interrupt();   // 没有 ctx.response → send() reject SnailCancelledError
}
```

## 各错误的中文措辞

这些是 `setLocale` 为 `zh` 时错误消息的实际模板（`%s` 会被依次替换）：

| key | 模板 |
| --- | --- |
| `error.decorator.method.duplicate` | `方法[%s]上只能使用一个请求方式装饰器（@Get/@Post/...）` |
| `error.decorator.method.missing` | `方法[%s]缺少请求方式装饰器（@Get/@Post/...），无法发送请求` |
| `error.decorator.param.context` | `@%s 只能用于类的实例方法参数，不能用于构造函数或静态成员` |
| `error.decorator.param.empty` | `方法[%s]的参数标记错误：未传入 key 时该参数必须是普通对象` |
| `error.decorator.param.untyped` | `参数装饰器 @%s 需要一个字符串 key，或省略 key 以展开整个对象` |
| `error.decorator.class.target` | `@%s 只能用于类` |
| `error.decorator.stream.duplicate` | `类[%s]上只能使用一个连接类装饰器（@Sse/@WebSocket）` |
| `error.options.server.missing` | `服务类[%s]缺少 @Server() 装饰器` |
| `error.options.server.baseURL` | `@Server() 的 baseURL 必须是非空字符串` |
| `error.options.api.url` | `@Api() 的 url 必须是字符串` |
| `error.options.plugin.notFound` | `插件[%s]未在服务[%s]上注册` |
| `error.options.plugin.missing` | `插件[%s]依赖的插件[%s]尚未注册，请先 use() 它` |
| `error.options.plugin.exists` | `插件[%s]已在服务[%s]上注册，请勿重复注册` |
| `error.hook.next.multiple` | `插件[%s]的 %s 钩子多次调用了 next()` |
| `error.hook.unknown` | `未知的插件生命周期钩子[%s]` |
| `error.request.failed` | `[%s] 请求失败：%s` |
| `error.request.timeout` | `[%s] 请求超时（%sms）` |
| `error.request.cancelled` | `[%s] 请求已取消` |
| `error.response.code` | `[%s] 业务状态码校验未通过：code=%s` |
| `error.path.missing` | `路由[%s]中的占位符[:%s]没有对应的参数值，请在方法参数上添加 @Params('%s')` |

::: tip 日志默认是关的
`@Server({ logLevel })` 默认 `"silent"`，所以上面这些消息不会自动打印到控制台。需要排查时
按需打开（`"error"` 只打印失败，`"debug"` 最啰嗦）。级别权重见
[服务端配置](/guide/configuration#loglevel-的判定方式)。
:::

## 与插件协作

插件观察失败的钩子是 `onError(ctx, error)`，它在所有插件里按**反向**顺序执行，并且：

- **不能**恢复错误（错误在其后重新抛出）；
- 抛错会被记录并吞掉，这样一个坏掉的错误处理器不会掩盖原始失败；
- 无论成功、失败、取消，`afterRequest(ctx)` 都会在 `finally` 里执行，用来释放资源。

完整的钩子清单见[插件生命周期](/guide/plugin-lifecycle)。
