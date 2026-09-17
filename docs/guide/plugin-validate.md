# 校验插件 `Validate`

这个插件只有一个需要记住的东西，而它必须记牢：

::: danger 请求失败**硬失败**，响应失败**只警告**
**请求** schema 不通过时抛 `SnailValidationError`，并且**在任何网络请求发生之前**就中断整个
调用 —— `next()` 根本不会被调用，`axios` 适配器不会被触达。**响应** schema 不通过时**只打一条
警告**，调用方依然拿到数据、`send()` 依然 resolve。

这个不对称是刻意的，不是遗漏。请求体不符合它自己的 schema 是**程序员的错**，它会导致后端报错，
而那个报错指向的层是错的；响应已经在手上、也是调用方要的东西，因为后端新增 / 改名 / 改了某个
字段的类型就把整页搞崩，是把一次装饰性的漂移升级成故障。警告里带着 zod 的 issues，漂移依然在
控制台里可见。
:::

```ts
import { Api, Data, Get, Post } from "@snail-js/api";
import { Validate, ValidateResponse } from "@snail-js/api/plugins";
import { z } from "zod";
import { Service } from "./service";

Service.use(Validate());

@Api("/user")
class UserApi {
  @Post("/")
  @Validate(z.object({ name: z.string().min(1) }))
  @ValidateResponse(z.object({ id: z.number() }))
  create(@Data() body: CreateUser): Promise<User> {
    return null!;
  }

  @Get("/")
  @Validate(z.object({ page: z.number() }))     // 读请求校验的是 query
  list(@Query("page") page: number): Promise<User[]> {
    return null!;
  }
}
```

## 一个名字，两种用法

```ts
function Validate(schema: ZodType): ClassDecorator & MethodDecorator;
function Validate(options?: ValidateOptions): SnailPluginObject<ValidateOptions>;
```

工厂（`Service.use(Validate())`）与装饰器（`@Validate(schema)`）共用 `Validate` 这个名字，
靠**参数形状**区分：zod schema 是带 `safeParse` 的对象，选项永远不会带。于是两种调用风格
都不必改名：

```ts
Service.use(Validate());                        // 插件
Service.use(Validate({ strict: false }));       // 插件 + 选项
@Validate(z.object({ name: z.string() }))       // 装饰器
```

## 选项

```ts
interface ValidateOptions {
  request?: ZodType;    // 没有 @Validate() 装饰器时使用的请求 schema
  response?: ZodType;   // 没有 @ValidateResponse() 装饰器时使用的响应 schema
  strict?: boolean;     // 默认 true
}
```

| 选项 | 默认 | 行为 |
| --- | --- | --- |
| `request` | 未设置 | 装饰器未声明时的兜底请求 schema |
| `response` | 未设置 | 装饰器未声明时的兜底响应 schema |
| `strict` | `true` | `false` 把**请求**失败降级为警告并放行。响应**永远**不严格校验 |

`strict: false` 适合「后端契约还在变」的开发期，任何时候都不该带进生产 —— 请求已经确定是错的，
发出去只会换来一个误导性的后端错误。

## 校验的是哪个载荷

```ts
function requestTarget(ctx: SnailContext): unknown {
  return ctx.request.data !== undefined ? ctx.request.data : ctx.request.params;
}
```

| 请求形态 | 校验对象 |
| --- | --- |
| 带 body 的写请求（`@Data()`） | `ctx.request.data` |
| 读请求（`@Query()`） | `ctx.request.params` |
| 两者都没有（`undefined`） | **跳过**，交给后端判断，而不是拿一个空对象去失败 |

响应侧校验的是**拆包后的 data**：`unwrapEnvelope(response.data, ctx.serverOptions.dataKey)`。
所以 schema 描述的是业务载荷，不是 `{ code, message, data }` 信封本身。

::: warning 响应校验不会在缓存命中时运行
`afterResponse` 链在缓存命中时被整体跳过，所以 `@ValidateResponse()` 只校验**真实网络往返**回来
的响应。命中回放的是当初存下的原始信封，不经过校验，也不经过转换。见
[缓存插件](./plugin-cache.md)。
:::

## 优先级：`-50`

`-50` 是保留的校验区间。

| 相位 | 相对位置 | 原因 |
| --- | --- | --- |
| 正向 | 在版本（`50`）与适配器（`0`）之后、缓存（`-100`）之前 | 请求已被塑形完毕才校验；而且不必为一个注定失败的请求去问缓存要键 |
| 反向 | 在缓存（`-100`）之后、转换（`0`）之前 | 校验在**转换把载荷换成类实例之前**发生。schema 描述的是后端发来的 JSON，如果先转换，就会拿 DTO 实例去比 JSON schema，每一个 `Date` 都会失败 |

## 声明位置与方法 / 类继承

`@Validate` 与 `@ValidateResponse` 都同时支持类与方法，解析时**方法优先、类兜底**；两者都没有
时用工厂选项里的 schema。

```ts
@Api("/user")
@Validate(z.object({ page: z.number() }))       // 类级：作用于每个方法
class UserApi {
  @Get("/")
  list(@Query("page") page: number): Promise<User[]> { return null!; }

  @Get("/search")
  @Validate(z.object({ q: z.string().min(1) }))  // 方法级覆盖类级
  search(@Query("q") q: string): Promise<User[]> { return null!; }
}
```

装饰器在**装饰阶段**就校验参数：传进去的东西没有 `safeParse` 方法会立刻抛 `SnailDecoratorError`
（`@Validate() expects a zod schema with a safeParse() method`）。否则一个 `@Validate({})` 的笔误
会沉默到某个请求运行时才爆发，并且表现为「载荷不合法」而不是「装饰器写错了」。

## `SnailValidationError`

```ts
class SnailValidationError extends SnailError {
  readonly code: "SNAIL_VALIDATION_ERROR";
  readonly issues: readonly SnailValidationIssue[];   // zod 的 issues，原样保留
  readonly cause: unknown;
}
```

`issues` 就是 zod 自己的列表，保留原貌，所以应用可以直接渲染字段路径与消息，而不必解析字符串。
消息里带着完整方法名（`t("error.plugin.validate.request", ctx.fullName)`，例如
`UserApi.create`），因此日志里能一眼看出是哪个端点。

```ts
import { SnailValidationError } from "@snail-js/api/plugins";

try {
  await Service.createApi(UserApi).create({ name: 42 }).send();
} catch (error) {
  if (error instanceof SnailValidationError) {
    for (const issue of error.issues) {
      console.warn(issue.path.join("."), issue.message);
    }
  }
}
```

`SnailValidationIssue` 是 `zod` 的 `core.$ZodIssue` 的重导出，用库自己的名字导出，是为了让
应用不必为了给错误处理器标类型而 import zod 的内部 `core` 命名空间。

::: tip zod 是可选 peer 依赖
`zod` 在 `package.json` 里是 `optional` peer。`src/plugins/validate/` 是库里唯一允许引用它的
目录，而且全部是**类型**引用 —— 导入这个插件永远不会把 zod 的运行时拖进 bundle，schema 由
已经装了 zod 的应用提供。
:::

## 失败路径上的防御

响应校验整段包在 `try/catch` 里：一个会抛错的 logger 或一个畸形的 schema 都不能让请求失败。
调用方**无论如何**都会收到载荷 —— 这是「响应只警告」的另一半含义。

同样地，请求校验失败时不调用 `next()`，而是直接从钩子里抛出，所以 `send()` 以一个
`SnailValidationError` reject —— **不是** `SnailCancelledError`。「没调用 `next()` 且没有
响应」那条路径才会被报成取消，而校验走的是抛错路径：`SnailError` 在 `fail()` 里原样穿过，
于是它会照常触发 `onError` 与策略的 `error` 状态。

## 相关

- [错误处理](./errors.md)：错误层次与各自的 `code`
- [转换插件](./plugin-transform.md)：为什么校验必须排在转换之前
- [缓存插件](./plugin-cache.md)：为什么命中路径完全绕开了校验
