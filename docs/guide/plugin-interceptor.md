# 拦截器插件 `Interceptor`

拦截器让你在最靠近「请求即将发出」的位置改写 config、在最靠近「响应刚刚回来」的位置改写
响应，并且这一切**可装饰、可排序、可恢复**。

```ts
import { Api, Get, Params } from "@snail-js/api";
import { BeforeRequest, Interceptor } from "@snail-js/api/plugins";
import { Service } from "./service";

const interceptors = Interceptor();
Service.use(interceptors);

interceptors.request.use({
  onFulfilled: (config) => {
    config.timeout = 5000;
  }
});

@Api("/user")
@BeforeRequest((config, ctx) => {
  config.headers.set("x-trace", ctx.fullName);
})
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }
}
```

## 为什么不是 `axios.interceptors`

这是一个刻意的实现选择，不是重复造轮子：

| | `axios.interceptors` | 本插件 |
| --- | --- | --- |
| 作用域 | **实例级**：只能表达「这个 axios 实例的每个请求」 | **类级 / 方法级 / 服务级**，三档 |
| 排序 | 只在 axios 自己的队列内有序 | 与**所有插件**一起按 `priority` 排序 |
| 能否只拦一个方法 | 不能 | `@BeforeRequest()` 挂在方法上即可 |
| 能否与缓存 / 校验排序 | 不能 | `priority: 100` 保证它先于缓存（`-100`）看到请求 |

一个 axios 实例上的拦截器既**无法针对单个方法**，也**无法与其它插件排序** —— 而
`@BeforeRequest()` 需要的恰恰是这两件事。所以拦截器跑在插件生命周期上，用的是第三方作者
拿到的同一套钩子。

## 优先级：`100`

`100` 是保留的拦截器区间。正向链里它**最先**看到请求，反向链里它**最后**看到响应。前者是
关键：`@BeforeRequest()` 改完的 config 才是缓存插件（`-100`）拿去哈希的最终 config。

## 两种注册方式

### 装饰器

```ts
function BeforeRequest<T = InternalAxiosRequestConfig>(
  onFulfilled: (value: T, ctx: SnailContext) => T | void | Promise<T | void>,
  onRejected?: (error: unknown, ctx: SnailContext) => unknown
): ClassDecorator & MethodDecorator;

function AfterResponse<T = AxiosResponse>(
  onFulfilled: (value: T, ctx: SnailContext) => T | void | Promise<T | void>,
  onRejected?: (error: unknown, ctx: SnailContext) => unknown
): ClassDecorator & MethodDecorator;
```

两个装饰器都同时支持类与方法。回调**不是**链式钩子：它们拿到的是 config / response，而不是
`next`，所以拦截器内部既不能推进也不能停止整条链 —— 链的推进永远由插件自己的
`beforeRequest` / `afterResponse` 钩子负责。

```ts
@Api("/user")
@BeforeRequest<UserConfig>((config) => {
  config.headers.set("x-trace", "1");
})
class UserApi {
  @Get("/")
  @BeforeRequest((config) => {
    config.timeout = 5000;      // 方法级可以在类级的基础上继续细化
  })
  list(): Promise<User[]> {
    return null!;
  }
}
```

### 运行时注册表

装饰器覆盖「类定义时就知道」的拦截器；`InterceptorManager` 覆盖另一半 —— 「运行期决定，
从现在起给每个请求签名」。真实应用往往在 server 模块求值很久之后才拿到 token 或租户。

```ts
const interceptors = Interceptor({
  request: [{ onFulfilled: (config) => { config.headers.set("x-app", "web"); } }]
});
Service.use(interceptors);

const id = interceptors.request.use({
  onFulfilled: (config, ctx) => ctx.logger.debug(ctx.fullName)
});

interceptors.request.eject(id);   // 移除，返回 boolean
interceptors.request.clear();     // 清空
interceptors.request.entries;     // 执行顺序下的条目数组
interceptors.request.size;        // 条目数
```

```ts
interface InterceptorManager<T = unknown> {
  use(entry: InterceptorEntry<T>): number;
  eject(id: number): boolean;
  clear(): void;
  readonly entries: InterceptorEntry<T>[];
  readonly size: number;
}
```

`use()` 的 id **永不复用**：一次 `eject` 与一次迟到的 `use` 竞争时，绝不能删错条目 —— 这正是
旧实现用数组下标当 id 时会发生的事。`use()` 收到既没有 `onFulfilled` 也没有 `onRejected` 的
条目会抛 `SnailPluginError`。

## 执行顺序

```text
类级 @BeforeRequest  →  方法级 @BeforeRequest  →  Interceptor({ request }) / .request.use()
```

每一档内部按**注册顺序**执行，三档依次串行。响应侧完全对称：类级 `@AfterResponse` → 方法级
`@AfterResponse` → 服务级 `interceptors.response`。

拦截器契约是**顺序**的，不是优先级制的 —— 这不一样于插件本身：排序发生在插件之间（按
`priority`），插件内部则老老实实按注册顺序跑。

## `onRejected`：唯一的恢复点

`InterceptorEntry` 的 `onRejected` 运行在**请求仍然可救**的时刻，这与 `onError` 有本质区别
（后者只能观察一个已经落定的失败）。

```ts
interface InterceptorEntry<T = unknown> {
  onFulfilled?: (value: T, ctx: SnailContext) => T | void | Promise<T | void>;
  onRejected?: (error: unknown, ctx: SnailContext) => unknown;
}
```

| `onRejected` 的行为 | 结果 |
| --- | --- |
| 返回一个**非 `undefined` 的值** | 该值被采纳为当前 config / response，请求继续 |
| 返回 `undefined` | 原错误被重新抛出（「我收到了通知，但没有可继续的东西」） |
| 抛错 | 新错误向上传播 |

源码里这条规则的表述很直白：**只有「值」能恢复**。如果 `undefined` 也算恢复，`ctx` 会拿到
一个 undefined config，错误会以「下游症状」的形式出现在离原因很远的地方。`onFulfilled`
返回 `undefined` 则只是「保持原值」—— 大多数拦截器都是就地改写，强迫每个人都 `return config`
只会让常见写法变吵。

```ts
@Get("/")
@BeforeRequest(
  (config) => {
    config.headers.set("x-tenant", readTenant());
  },
  (error, ctx) => {
    ctx.logger.warn("tenant interceptor failed", error);
    return ctx.request;          // 返回非 undefined → 恢复，请求照常发出
  }
)
list(): Promise<User[]> {
  return null!;
}
```

::: tip 恢复只发生在同一条拦截器上
`recover()` 只把失败交给**抛错的那一条** `onRejected`。一条拦截器的 `onRejected` 不会替另一条
背锅，也不会重跑已经跑过的那些。
:::

## 请求侧与响应侧的方向差异

### `beforeRequest`：先跑拦截器，再 `next()`

```ts
async function runRequestInterceptors(manager, ctx, next) {
  for (const entry of entries) {
    try {
      const replaced = await entry.onFulfilled(ctx.request, ctx);
      if (replaced !== undefined) ctx.setRequest(replaced);
    } catch (error) {
      ctx.setRequest(await recover(entry, error, ctx));
    }
  }
  await next();          // 拦截器全部跑完，链才继续
}
```

因此一条**无法恢复**的拦截器失败会抛在 `next()` 之前：请求根本到不了网络。

### `afterResponse`：先跑拦截器，再 `next()`

`afterResponse` 是**反向**钩子，但它内部的顺序依然是「拦截器 → `next()`」。因为响应此刻已经
存在，先 `next()` 会让后续插件观察到一个**尚未被拦截器改写**的响应；先跑拦截器能保证校验、
转换看到的是最终值。`afterResponse` 是链式钩子，所以响应拦截器改写完，链还会继续往下走。

## 谁在什么时候被调用

| 阶段 | 钩子 | 拿到什么 | 能否阻止请求 |
| --- | --- | --- | --- |
| 正向 | 插件 `beforeRequest` | `ctx` + `next` | **能**（不调用 `next()`） |
| 正向 | `@BeforeRequest` / `.request` 条目 | `ctx.request` + `ctx` | 不能直接阻止，但抛出的错误若无法恢复会让请求失败 |
| 反向 | 插件 `afterResponse` | `ctx` + `next` | 能提前结束响应链（不调用 `next()`） |
| 反向 | `@AfterResponse` / `.response` 条目 | `ctx.requireResponse()` + `ctx` | 不能 |

## 常见陷阱

::: warning 不要在拦截器里再发同一个请求
`onFulfilled` 拿到的是**实时**的 `ctx.request`，在里面调用 `send()` 会复用同一个上下文的
config。需要「401 后重放」这类能力，请用 `useTokenAuth`（它在 `beforeRequest` 里围绕
`await next()` 实现恢复），而不是在拦截器里递归。
:::

::: danger 抛错与返回 `undefined` 的区别
`onFulfilled` 抛错且**没有** `onRejected`（或 `onRejected` 返回 `undefined`）时，原始错误会
向上传播、请求不会发出。当你想「尽力改写，失败就算了」时，必须显式返回一个值 —— 返回
`undefined` 是放弃恢复，不是放弃报错。
:::

## 相关

- [插件生命周期](./plugin-lifecycle.md)：`beforeRequest` / `afterResponse` 的链式不变量
- [缓存插件](./plugin-cache.md)：为什么拦截器必须排在 `-100` 之前
- [版本插件](./plugin-versioning.md)：`50` 排在 `100` 之后、`-100` 之前
