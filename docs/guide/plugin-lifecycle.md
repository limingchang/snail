# 插件生命周期

[English](./plugin-lifecycle_EN.md) | 中文

> `@snail-js/api` 插件的完整契约。如果你在写插件，这份文档就是规范；如果你在读核心实现，它就是那张地图。

---

## 1. 决定一切的那条规则

**核心只负责三件事，其余一概不管：**

1. 装饰器写入的元数据；
2. 请求管线；
3. 下文描述的生命周期。

缓存、版本管理、拦截器、zod 校验、JSON→class 转换、请求池以及 Vue/React 适配器，**通通都是插件**，而且它们用的就是第三方插件能拿到的那套 API。不存在内部特权通道。如果某个内置插件需要一个尚不存在的钩子，那就把这个钩子补进公开契约，而不是在内部偷偷模拟一个。

插件就是一个普通对象：

```ts
interface SnailPluginObject<O = unknown> {
  readonly name: string;          // 每个 server 内唯一
  readonly priority?: number;     // 数值越大，在正向阶段越先执行
  readonly dependsOn?: readonly string[];
  // ……可选钩子，见 §4
}
```

**插件工厂**负责把选项变成上面这个对象：

```ts
type SnailPlugin<O = unknown> = (options?: O) => SnailPluginObject<O>;
```

---

## 2. 请求管线

一次 `send()` 调用会严格按下面的顺序走完。§4 中的每个钩子都归属于其中某一根箭头。

```
                       userApi.getUser("1")
                                │
                                ▼
                  ┌────── SnailMethod 构造完成 ─────┐
                  │  ctx 创建（state、meta、        │
                  │  请求配置、descriptors）        │
                  │  → initMeta（同步，每个方法）   │
                  └─────────────────────────────────┘
                                │
                       method.send(...args)
                                │
                  await pluginManager.ready          ← 异步 `install` 钩子就绪
                                │
                          beforeCreate               ← 副作用钩子，正向
                                │
                    应用 @Params/@Query/@Data/@Header
                     补齐 url（:placeholders）
                                │
              ╔═════════ beforeRequest（链式） ═════════╗
              ║  最高优先级 ────────────────────────▶   ║
              ║  插件可以在这里停止整条链：             ║
              ║  不调用 next()                          ║
              ╚═════════════════════════════════════════╝
                                │
                                │  ┌── 短路：某个插件设置了 ctx.response
                                │  │   并拒绝调用 next()（一次缓存命中）
                                │  │
                                ▼  ▼
                    ┌───────────────────────────┐
                    │ 网络步骤（命中时跳过，     │
                    │ 见 §2.3）：                │
                    │  requestInterceptor        │
                    │  axios.request             │
                    │  JSON 字符串强制转换       │
                    │  responseInterceptor       │
                    └───────────────────────────┘
                                │
              ╔═════════ afterResponse（链式） ═════════╗
              ║  最低优先级 ────────────────────────▶   ║
              ║  既对网络响应执行，                     ║
              ║  也对来自缓存的响应执行                 ║
              ╚═════════════════════════════════════════╝
                                │
                  信封 + 业务状态码校验
                     构建 SnailResult，派发事件
                                │
              ┌─────────────────┴─────────────────┐
        成功路径                            失败路径
              │                                   │
        派发 "success"                      onError（副作用，反向）
              │                            派发 "error" / "codeError"
              └─────────────────┬─────────────────┘
                                ▼
                    afterRequest（副作用，反向）    ← 始终执行，位于 `finally`
                                │
                          派发 "finish"
```

::: tip 收尾阶段的实际顺序
`afterRequest` 与 `finish` 事件都在 `finally` 里，顺序是**先执行 `afterRequest` 钩子，再派发
`finish`**。这个顺序是刻意的：框架适配器正是在 `afterRequest` 里把 `loading` 置回 `false`，
如果先派发 `finish`，调用方的 `onFinish` 就会看到过期的 `loading === true` —— 而它恰恰是 UI
用来关掉加载态的标志。两者都保证会跑（成功、失败、取消皆然）。
:::

### 2.1 优先级与方向

插件按 `priority` **降序**排列；优先级相同时，按注册顺序决定先后。

| 阶段 | 方向 | 原因 |
| --- | --- | --- |
| `configureServer`、`configureApi`、`configureMethod`、`initMeta`、`beforeCreate`、`beforeRequest`、`requestInterceptor` | **正向**——优先级高者先执行 | 拦截器（`100`）必须在缓存（`-100`）计算哈希之前改写请求 |
| `afterResponse`、`responseInterceptor`、`onError`、`afterRequest` | **反向**——优先级低者先执行 | 这样洋葱模型才会闭合：离网络最近的插件最先看到响应 |

因此请求池（`-150`，最低的一档）是**正向链的最后一道闸门**：排在缓存之后，所以一次缓存能回答的请求
永远到不了池，也永远不占用池的槽位。这一条只能靠这个顺序成立，理由见[请求池](./plugin-pool.md)。

下面是预留的优先级区间，第三方插件可以借此插进内置插件之间：

| 优先级 | 区间 |
| --- | --- |
| `100` | 拦截器 |
| `50` | 版本管理 |
| `20 … 1` | 第三方插件 |
| `0` | 框架适配器、用户插件（默认） |
| `-50` | 校验 |
| `-100` | 缓存 |
| `-150` | 请求池 |

#### 谁占用哪个优先级

内置插件与策略贡献的插件，各自落在哪一档、为什么，以及它们的参考手册：

| 优先级 | 插件 `name` | 主要钩子 | 为什么在这一档 | 参考 |
| --- | --- | --- | --- | --- |
| `100` | `interceptor` | `beforeRequest` / `afterResponse` | 正向最先跑，才能让 `@BeforeRequest()` 在缓存哈希之前改写 config；反向最后跑，才能改写最终响应 | [拦截器](./plugin-interceptor.md) |
| `50` | `versioning` | `beforeRequest` | 在拦截器之后（看到已改写的 url）、缓存之前（让缓存哈希带版本的 url） | [版本](./plugin-versioning.md) |
| `20 … 1` | `token-auth`（`useTokenAuth` 返回的插件，`20`） | `beforeRequest`（包住 `await next()`） | 高于默认值，好让它包住 `beforeRequest` 链的其余部分并观察下游抛出的 401 | [`useTokenAuth`](./strategies/use-token-auth.md) |
| `0` | `transform` | `afterResponse` | 在反向链里排在 `validate`（`-50`）之后：先校验原始 JSON，再水合成类实例 | [转换](./plugin-transform.md) |
| `0` | `vue-adapter` / `react-adapter` | `initMeta` / `beforeCreate` / `afterResponse` / `afterRequest` / `onError` | 只镜像状态，不改变请求或响应；`initMeta` 必须早于第一次 `createApi()` 存在 | [框架适配器](./adapters.md) |
| `-50` | `validate` | `beforeRequest` / `afterResponse` | 正向在塑形之后、缓存要键之前；反向在缓存之后、转换之前 | [校验](./plugin-validate.md) |
| `-100` | `cache` | `beforeRequest` / `afterResponse` | 正向最后，url / params / body 已定稿；反向最先，存下原始信封 | [缓存](./plugin-cache.md) |
| `-150` | `pool` | `beforeRequest` | 正向最低一档，紧贴传输：排在缓存之后，所以缓存能回答的请求既不进入池、也不占用槽位；槽位只为网络步骤持有，响应一到就归还 | [请求池](./plugin-pool.md) |

第三方插件请落在 `20 … 1` 区间：它高于所有默认值（`0`），又低于全部内置的请求改写插件，
因此不会意外抢在内置插件前面。

### 2.2 为什么是两种顺序，而不是一种

如果只有一层洋葱，`afterResponse` 也会按正向顺序执行，而这对缓存来说是错的：缓存插件是*最后一个*看到请求的（它只在 url 和 body 都定稿之后才运行），却必须是*第一个*看到响应的（它要在校验和转换动手之前，把原始信封存下来）。两种方向，一条规则：**正向钩子由外向内执行，反向钩子由内向外执行。**

### 2.3 短路不等于绕过

当插件自己提供了响应时——内置插件里只有缓存插件会在命中时这么做——网络步骤会被跳过，但 **`afterResponse` 依然会执行**。

这是刻意为之的，而且这个理由值得说清楚，因为最直觉的那种实现恰恰会做错。载荷类插件就住在 `afterResponse` 里：zod 响应校验和 JSON→class 转换都在那儿。命中时跳过它，会让*同一次调用*第一次返回填充好的 DTO，第二次却返回一个普通对象。链是属于响应的，不是属于传输层的。

命中时真正不会执行的，是网络步骤：`requestInterceptor`、`axios.request` 和 `responseInterceptor`。它们存在的意义就是改写真实的请求和真实的响应。

有两条后果，插件作者必须认账：

- 会对命中做出反应的插件，都应当检查 `ctx.isCacheHit`。缓存插件正是这么做的：命中时它既不入库，也不清理标签，因为那个本该打到服务端的操作根本没发生。少了这道检查，一次 stale-while-revalidate 命中就会把它自己后台刷新刚取回的新值覆盖掉。
- 插件交还给调用方的任何东西，只要它自己也留了一份，就必须**拷贝**。缓存在写入和读取时都会克隆；让缓存和调用方共享同一个对象，就意味着调用方的一次原地修改会悄无声息地改写缓存里的条目。

---

## 3. 注册

```ts
const Service = new BackEnd();

Service.use(Interceptor()).use(Version({ defaultVersion: "1.0.0" }));
```

`use()` 是**同步的，而且可以链式调用**。它会当场做校验——插件没名字、名字重复，或者 `dependsOn` 没被满足，都会在任何东西被改动之前抛出 `SnailPluginError`。

`install` 既可以是同步的，也可以是异步的：

- **同步**的 `install` 在 `use()` 期间执行，这样框架适配器的 `initMeta` 钩子在第一次调用 `createApi()` 之前就已经存在；
- **异步**的 `install` 会被记录下来，并在第一个请求发出之前，通过 `pluginManager.ready` 统一 await 一次。

用 `remove(name)` / `remove(plugin)` 注销插件（会执行 `uninstall`），用 `Service.dispose()` 注销全部插件。

```ts
await Service.remove("cache");
```

---

## 4. 钩子

### 4.1 注册钩子

#### `install(context, options)`

在插件被添加到某个 server 时执行**一次**。

```ts
install?(context: SnailPluginInstallContext, options: O): void | Promise<void>;
```

```ts
interface SnailPluginInstallContext {
  readonly serverName: string;
  readonly serverOptions: ResolvedServerOptions;
  readonly pluginNames: readonly string[];
}
```

用它来注册参数来源、贡献消息、打开资源，或者在闭包里捕获选项。`install` 一旦抛错，整个注册就会回滚，所以绝不会出现半安装状态的插件。

#### `uninstall(context, options)`

在插件被移除时执行一次。定时器、socket 和监听器都在这里释放。

### 4.2 配置钩子

这些钩子**对每个被装饰的目标只执行一次**，而不是每次请求一次。要调整选项就用它们——绝不要拿它们做单次请求的活儿。

#### `configureServer(options)`

在 server 实例构造期间执行。`options` 是解析后的 `ResolvedServerOptions`，可以直接原地修改。

```ts
configureServer(options) {
  options.timeout ??= 30000;
}
```

#### `configureApi(options, apiClass)`

某个类第一次调用 `createApi(apiClass)` 时执行。

#### `configureMethod(options, methodName, apiName)`

某个被装饰的方法第一次被代理时执行。`options` 是合并后的方法选项（axios 配置字段加上 `url`）。

### 4.3 单次请求钩子

#### `initMeta(ctx)` —— 同步，正向

创建调用方可见的响应式值。这就是框架适配器的钩子。

```ts
initMeta(ctx) {
  ctx.meta.data = ref(undefined);
  ctx.meta.loading = ref(false);
  ctx.meta.error = ref(undefined);
}
```

它在 `SnailMethod` 构造时执行一次——**不是**每次 `send()` 一次——这样 UI 拿到手的那些句柄在多次重发之间始终是同一个。`ctx.state` 每次发送都会清空，`ctx.meta` 不会。

#### `beforeCreate(ctx)` —— 同步，正向

在每次 `send()` 开始时执行，位于 `initMeta` 之后、参数装饰器生效之前。这里是重置单次调用簿记的地方：

```ts
beforeCreate(ctx) {
  ctx.meta.loading.value = true;
}
```

#### `beforeRequest(ctx, next)` —— **链式**，正向

请求的闸门。

```ts
async beforeRequest(ctx, next) {
  await next();               // 继续
}
```

- **不调用 `next()`** 就会终止管道。如果此时 `ctx.response` 已被设置，就用这个响应；否则 `send()` 会以 `SnailCancelledError` 拒绝。
- **设置 `ctx.response` 并调用 `ctx.interrupt(response)`**，可以在完全不发起网络请求的情况下返回一个响应——这正是缓存命中：

  ```ts
  beforeRequest(ctx) {
    const cached = cache.get(key);
    if (cached) {
      ctx.markCacheHit();
      ctx.interrupt(makeResponse(cached, ctx.request));
      return;                 // 没有 next() → axios 不会执行
    }
    return next();
  }
  ```

- 多次调用 `next()` 会抛出 `SnailHookError`（§6）。

#### `requestInterceptor(config, ctx)` —— 同步，**reduce**，正向

改写即将发出的 axios 配置的最后机会。每个插件拿到的都是上一个插件返回的配置；返回 `undefined` 表示保持不变。

```ts
requestInterceptor(config, ctx) {
  config.headers.set("x-request-id", crypto.randomUUID());
}
```

和 `beforeRequest` 不同，它拦不住请求——轮到它执行时，发送这个决定早已做出。控制流请交给 `beforeRequest`，纯粹改写才用它。

#### `afterResponse(ctx, next)` —— **链式**，反向

在响应已经存在、信封尚未校验之前执行。`next()` 的规则与 `beforeRequest` 相同；跳过 `next()` 的插件会提前结束响应链，后续插件和信封校验看到的都是 `ctx.response` 当时持有的内容。

因为这是*反向*钩子，所以缓存插件（`-100`）最先执行，拦截器（`100`）最后执行。

#### `responseInterceptor(response, ctx)` —— **reduce**，反向

改写 axios 响应。返回 `undefined` 表示保留上一个值。

#### `onError(ctx, error)` —— 副作用，反向

观察失败。它**无法**从失败中恢复：所有 `onError` 钩子跑完之后，错误仍会被重新抛出。负责恢复的是 `beforeRequest`。

抛错的 `onError` 钩子会被记入日志并吞掉，这样一个坏掉的错误处理器就不会掩盖最初的失败。

#### `afterRequest(ctx)` —— 副作用，反向

在 `finally` 中执行，成功、失败、取消一视同仁。单次请求的资源在这里释放。

```ts
afterRequest(ctx) {
  ctx.meta.loading.value = false;
  clearTimeout(ctx.state.get("timer"));
}
```

---

## 5. 编写插件

`createPlugin` 是官方支持的入口。它校验名称、接好 `install`/`uninstall`，并把一套带作用域的 API 交给你的 `setup`。

```ts
import { createPlugin } from "@snail-js/api";

export interface TraceOptions {
  /** 要写入的请求头，默认为 `x-trace-id`。 */
  header?: string;
}

export const Trace = createPlugin<TraceOptions>({
  name: "trace",
  priority: 20,

  setup(options, api) {
    const header = options?.header ?? "x-trace-id";

    api.addMessages({ "trace.generated": "[%s] trace id %s" });

    return {
      requestInterceptor(config, ctx) {
        config.headers.set(header, ctx.state.get("traceId") ?? crypto.randomUUID());
      },
      afterRequest(ctx) {
        ctx.state.delete(header);
      }
    };
  }
});

Service.use(Trace({ header: "x-trace-id" }));
```

### `setup` API

| 成员 | 用途 |
| --- | --- |
| `serverName` | 该插件所安装到的 server 名称 |
| `serverOptions` | 解析后的 server 选项 |
| `installedPlugins` | 在它之前注册的插件名 |
| `defineParamSource(source, resolver)` | 注册一个 `@Source("key")` 参数来源 |
| `addMessages(messages)` | 贡献已翻译的消息 |
| `onDispose(fn)` | 注册清理函数，由 `uninstall` 执行 |

### 添加装饰器

第三方装饰器用的，就是核心自己也在用的那套工厂函数。

```ts
// 1. 在 setup 中：注册参数来源
api.defineParamSource("tenant", ({ ctx, value, key }) => {
  ctx.request.headers.set(key ?? "x-tenant", String(value));
});

// 2. 导出一个装饰器
import { createParamDecorator } from "@snail-js/api";
export const Tenant = createParamDecorator("tenant");

// 3. 用它
@Get("/orders")
orders(@Tenant("x-org-tenant") tenantId: string) {}
```

只用 `defineParamSource` 就够了——`createParamDecorator("tenant")` 会自己从注册表里把对应的解析器取出来，这样装饰器和插件就彼此解耦了。

此外还有：`createClassDecorator`、`createMethodDecorator`、`createPropertyDecorator`，以及用来给自己的键加命名空间的 `customMetadataKey(name)`（`"acme/tenant"` → `Symbol.for("@snail-js/api:custom:acme/tenant")`）。

细节见[编写插件](/guide/plugin-authoring#自定义装饰器)。

---

## 6. 链式不变量

`composeChain` 强制实施 Koa 那套契约：

1. **每个钩子最多只能调用一次 `next()`。** 第二次调用会抛出 `SnailHookError`，并指名违规的插件。没有这道防线，链的剩余部分会悄无声息地跑两遍——表现出来就是同一个请求被发了两次。
2. **必须 await `next()`，后续部分才会执行完。** 在 `await` resolve 之前就返回，会让 `send()` 带着一个只处理了一半的上下文继续往下走。
3. **从不调用 `next()` 的钩子会终止整条链。** 对 `beforeRequest` 来说，这意味着不发任何 HTTP 请求；结果就是 `ctx.response` 当时持有的东西，或者一个 `SnailCancelledError`。

---

## 7. `ctx` 参考

| 成员 | 说明 |
| --- | --- |
| `ctx.server`、`ctx.serverOptions` | 所属的 server 及其解析后的选项 |
| `ctx.apiClass`、`ctx.api`、`ctx.apiName`、`ctx.apiOptions` | 被装饰的 api |
| `ctx.methodName`、`ctx.methodType`、`ctx.route`、`ctx.fullName` | 请求的身份标识 |
| `ctx.request` | **实时的** `InternalAxiosRequestConfig`；就地修改 |
| `ctx.pathParams` | 由 `@Params()` 收集到的值 |
| `ctx.descriptors` | 每一次参数装饰器应用记录，按索引排序 |
| `ctx.response` / `setResponse` / `getResponse` / `requireResponse` | axios 响应 |
| `ctx.result` / `setResult` | 组装出来的 `SnailResult` |
| `ctx.error` | 在失败路径上被设置 |
| `ctx.meta` | 调用方可见的响应式值（`initMeta` 写在这里） |
| `ctx.state` | 插件的暂存空间（`StateBag`），每次发送都会清空 |
| `ctx.logger` | 受级别控制的 logger，遵循 `@Server({ logLevel })` |
| `ctx.interrupt(response?)` | 中止请求，可选地直接返回一个响应 |
| `ctx.isInterrupted` | 链是否已被中止 |
| `ctx.markCacheHit()` / `ctx.isCacheHit` | 标记结果里的 `fromCache` 字段 |
| `ctx.elapsed` | 自 `send()` 开始以来经过的毫秒数 |
| `ctx.describe()` | 用于日志的浅层快照 |

`ctx.state` 的生命周期是一次 `send()`；`ctx.meta` 则贯穿整个 `SnailMethod`。把簿记塞进 `meta`，等于把内部状态泄漏到 UI 渲染的东西里——请用 `state`。

---

## 8. 测试插件

插件不需要网络也能测：把它装到一个 adapter 是函数的 server 上，然后对记录下来的请求做断言。

```ts
import { Server, SnailServer, Api, Get } from "@snail-js/api";

const requests: unknown[] = [];

@Server({
  baseURL: "/api",
  adapter: async (config) => {
    requests.push(config);
    return {
      data: { code: 0, message: "ok", data: { id: 1 } },
      status: 200,
      statusText: "OK",
      headers: {},
      config
    };
  }
})
class TestServer extends SnailServer {}
const Service = new TestServer();

Service.use(Trace());

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(): Promise<{ id: number }> {
    return null!;
  }
}

await Service.createApi(UserApi).getUser("1").send();
expect(requests).toHaveLength(1);
```

任何插件都建议覆盖这几种情况：相对一个已知优先级的第二个插件，它按预期方向执行；自身条件不满足时它是空操作；它在 `afterRequest` 里释放自己的资源；以及它在失败路径上不抛任何东西。

更多测试写法（包括如何构造一个记录请求的 adapter 并断言请求内容）见
[编写插件](/guide/plugin-authoring#测试一个插件)。

---

## 9. 本地化

消息使用 `%s` 占位符，存放在 `locale/zh.ts` / `locale/en.ts`。插件可以在 `setup` 里用 `api.addMessages({...})` 贡献自己的消息，也可以在任意位置用 `registerMessages({...})`。

```ts
api.addMessages({
  "cache.hit": "[%s] 缓存命中",
  "cache.set": "[%s] 写入缓存"
});
```

缺失的键会返回键本身，而不是空字符串，所以拼错时会直接暴露出来，而不是渲染出一条空白的错误消息。

详见[本地化](/guide/localization)。

---

## 10. 本契约的版本演进

| 变更 | 原因 |
| --- | --- |
| `PluginManager` 改为按 server 隔离 | 过去的全局管理器外加一个可变的 `switchServer()` 指针，会让两个并发的 server 互相读到对方的插件 |
| 两种链式方向（正向 / 反向） | 单层洋葱无法表达「缓存最后进入、最先退出」 |
| `next()` 最多只能调用一次 | 旧的派发器会悄无声息地重跑链的尾部 |
| `state` 从 `meta` 中拆出 | 插件的簿记泄漏进了调用方的响应式状态 |
| `install` 可以是同步的 | 框架适配器的 `initMeta` 必须在第一次 `createApi()` 之前就存在，而延迟安装保证不了这一点 |
| 新增 `createPlugin` | 插件作者不得不手搓对象结构，且得不到任何校验 |
| `afterResponse` 移出传输步骤 | 缓存命中会跳过它，导致响应校验和转换在第二次调用时悄无声息地什么都不做 |
| 缓存在写入和读取时都做克隆 | 缓存与调用方共享同一个对象，任何一方就地修改都会改写另一方（§2.3） |
| 缓存命中时跳过入库和标签清理 | 一次过期命中会把旧 body 重新存回去，覆盖掉它自己后台刷新刚取回的新值 |
| `afterRequest` 在 `finish` 事件之前执行 | 适配器在这里清除 `loading`，而 `onFinish` 之前看到的是过期的 `loading === true` |
