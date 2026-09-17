# 编写插件

一个插件就是「一个有 `name` 的对象」，但请用 `createPlugin` 来创建它：它校验名字、接好
`install`/`uninstall`、给你一个受作用域的 `setup` API，并让钩子对象保持完整类型。

```ts
import { createPlugin } from "@snail-js/api";

export interface TraceOptions {
  /** 要写入的 header 名。默认 `x-trace-id`。 */
  header?: string;
}

export const Trace = createPlugin<TraceOptions>({
  name: "trace",
  priority: 20,
  setup(options, api) {
    const header = options?.header ?? "x-trace-id";
    return {
      requestInterceptor(config) {
        config.headers.set(header, crypto.randomUUID());
      }
    };
  }
});

Service.use(Trace({ header: "x-trace-id" }));
```

## 定义对象

```ts
interface PluginDefinition<O, Hooks extends object> {
  /** 唯一插件名（必填，不能是空字符串）。 */
  readonly name: string;
  /** 链内执行顺序，越大越先；默认 0。 */
  readonly priority?: number;
  /** 必须先注册的插件名。 */
  readonly dependsOn?: readonly string[];
  /** 每个 server 安装一次；返回生命周期钩子。 */
  readonly setup?: (options: O, api: PluginSetupApi) => Hooks | void;
}
```

- `name` 为空会直接抛 `TypeError`：`[snail] createPlugin() requires a non-empty \`name\``。
- 重名与 `dependsOn` 由 `use()` 在注册时校验，抛 `SnailPluginError`。
- `setup` 只跑一次（在 `install` 时）；它返回的钩子对象挂在插件实例上。
- `definePlugin(factory)` 是纯类型辅助：保留工厂的选项类型，运行时什么都不做。

### `setup` 的 API

| 成员 | 说明 |
| --- | --- |
| `serverName` | 安装该插件的 server 名 |
| `serverOptions` | 解析后的 `ResolvedServerOptions` |
| `installedPlugins` | 在此插件之前注册的插件名（正向链顺序） |
| `defineParamSource(source, resolver)` | 注册参数来源（等价于 `registerParamResolver`） |
| `addMessages(messages)` | 贡献译文（等价于 `registerMessages`） |
| `onDispose(fn)` | 注册清理函数，卸载时按**后进先出**依次执行 |

```ts
export const Polling = createPlugin<{ intervalMs?: number }>({
  name: "polling",
  setup(options, api) {
    let timer: ReturnType<typeof setInterval> | undefined;

    api.onDispose(() => clearInterval(timer));

    return {
      beforeRequest(ctx) {
        timer ??= setInterval(() => ctx.logger.debug("polling"), options?.intervalMs ?? 5000);
      }
    };
  }
});
```

`install` 抛错会让注册**回滚**并抛 `SnailPluginError`，因此不会留下装了一半的插件。

## 注册一个参数来源

| 步骤 | 代码 |
| --- | --- |
| 1. 在 `setup` 里注册 | `api.defineParamSource("tenant", resolver)` |
| 2. 导出装饰器 | `export const Tenant = createParamDecorator("tenant")` |
| 3. 使用 | `@Tenant("x-org-tenant") tenantId: string` |

解析器的输入是一个 `SnailParamResolverInput`：

```ts
interface SnailParamResolverInput {
  ctx: SnailContext;     // 实时上下文，改 ctx.request 就能影响请求
  value: unknown;        // 该参数下标的运行时值
  key: string | undefined;  // 装饰器收到的 key（没写就是 undefined）
  options: unknown;      // 除 key 之外的额外选项
  index: number;         // 参数位置
  methodName: string;    // 所属方法名
}
```

完整的例子（含 `key` 缺省值、消息贡献与测试）：

```ts
// tenant.plugin.ts
import { createParamDecorator, createPlugin } from "@snail-js/api";

export interface TenantOptions {
  /** 未显式传 key 时使用的 header 名。 */
  defaultHeader?: string;
}

export const TenantPlugin = createPlugin<TenantOptions>({
  name: "tenant",
  priority: 10,

  setup(options, api) {
    const fallbackHeader = options?.defaultHeader ?? "x-tenant";

    api.defineParamSource("tenant", ({ ctx, value, key }) => {
      ctx.request.headers.set(key ?? fallbackHeader, String(value));
    });

    api.addMessages({
      "tenant.missing": "[%s] 缺少租户标识"
    });
  }
});

/** 参数装饰器：值来自调用参数。 */
export const Tenant = createParamDecorator<string>("tenant");
```

```ts
// 在 server 上安装一次
Service.use(TenantPlugin({ defaultHeader: "x-tenant" }));

@Api("/orders")
class OrderApi {
  @Get("/")
  list(@Tenant() tenantId: string): Promise<Order[]> {
    return null!;
  }
}
```

::: warning 来源未注册时在「类定义」阶段抛错
`createParamDecorator("tenant")` 本身不抛错；抛错发生在装饰器被**应用**时
（也就是类被求值的时候），消息里会提示用 `defineParamSource` 注册，或者直接给
`createParamDecorator` 传第二个参数：

```ts
export const Tenant = createParamDecorator("tenant", ({ ctx, value }) => {
  ctx.request.headers.set("x-tenant", String(value));
});
```
:::

`createParamDecoratorFor(source)` 是核心内置装饰器（`@Query` 等）使用的变体，
它会在解析器缺失时抛 `SnailDecoratorError`，并在 key 为空字符串时抛出
`参数装饰器 @Query 需要一个字符串 key，或省略 key 以展开整个对象`。

## 自定义装饰器

四个工厂 + 一个键命名空间函数：

```ts
import {
  createClassDecorator,
  createMethodDecorator,
  createParamDecorator,
  createPropertyDecorator,
  customMetadataKey,
  getClassMetadata,
  getMethodMetadata,
  getOwnMethodMetadata
} from "@snail-js/api";
```

```ts
// class 装饰器（默认 merge = true：多次应用会累积成数组）
export const Entity = createClassDecorator<string>("acme/entity");
@Entity("orders")
class OrderApi {}

getClassMetadata<string[]>("acme/entity", OrderApi); // ["orders"]（默认 merge = true → 数组）

// method 装饰器
export const Retry = createMethodDecorator<number>("acme/retry");
class FlakyApi {
  @Get("/flaky")
  @Retry(3)
  flaky(): Promise<void> {
    return null!;
  }
}
getMethodMetadata<number[]>("acme/retry", FlakyApi, "flaky"); // [3]

// property 装饰器
export const Alias = createPropertyDecorator<string>("acme/alias");
class UserDto {
  @Alias("user_name")
  userName!: string;
}

// 自建元数据键（保留前缀是 @snail-js/api:）
const TENANT = customMetadataKey("acme/tenant");
// → Symbol.for("@snail-js/api:custom:acme/tenant")
```

::: tip 给你的键加前缀
`customMetadataKey("acme/tenant")` 会生成 `Symbol.for("@snail-js/api:custom:acme/tenant")`。
用包名/组织名做前缀，两个插件就永远不会撞键。`@snail-js/api:` 这个前缀属于核心。
:::

## 元数据仓库

核心没有用 `reflect-metadata`，而是自带一个仓库。这些函数是公开的，插件可以直接用：

| 函数 | 说明 |
| --- | --- |
| `defineMetadata(key, value, target, propertyKey?)` | 写入（覆盖同一 `owner/slot/key` 的旧值） |
| `getOwnMetadata(key, target, propertyKey?)` | 只读当前 owner，不查原型链 |
| `getMetadata(key, target, propertyKey?)` | 沿类原型链查找（基类 api/server 能把配置传给子类） |
| `hasMetadata(...)` / `deleteMetadata(...)` | 存在性 / 删除 |
| `appendMetadata(key, value, target, propertyKey?)` | 追加到数组型元数据（写时复制，绝不共享数组） |
| `mergeMetadata(key, record, target, propertyKey?)` | 合并到对象型元数据（`@Header` 用这个） |
| `collectMethodKeys(key, target)` | 收集某个键下所有方法名，基类在前 |
| `resolveOwner(target)` | 把装饰器收到的 prototype/constructor 归一成类 |
| `clearMetadataRegistry()` | 测试用逃生口：换一个全新的 `WeakMap` |

存储模型：

```text
WeakMap<owner, Map<slot, Map<key, value>>>
                │       └── 装饰器的 symbol 键
                └── CLASS_SLOT（类级元数据）或方法名
```

核心自己的键也都是公开导出的（`SNAIL_SERVER_OPTIONS`、`SNAIL_API_OPTIONS`、
`SNAIL_REQUEST_METHOD`、`SNAIL_PARAMS`、`SNAIL_HEADERS`、`SNAIL_SSE_OPTIONS`、
`SNAIL_WS_HANDLERS`、`SNAIL_HTTP_STREAM`、`SNAIL_CUSTOM_KEY_PREFIX` 等），
所以插件可以像核心一样读取它们。

::: warning 装饰器求值顺序
`@Api("/u") class U { @Get() list(@Query("a") a: string) {} }` 的运行时顺序是：

```text
1. 参数装饰器   （按参数下标倒序）
2. 方法装饰器
3. 类装饰器
```

因此所有写入函数都是**合并/追加**语义，任何一处都不会清掉已有值。
:::

## `composeChain`

如果插件需要在自己的链上跑一组钩子（例如「多个插件的请求改写链」），可以复用核心的
组合器：

```ts
import { composeChain, type BoundHook } from "@snail-js/api";

const hooks: BoundHook[] = [
  { pluginName: "a", hook: async (value, next) => { /* … */ await next(); } },
  { pluginName: "b", hook: async (value, next) => { await next(); } }
];

const run = composeChain("myHook", hooks);
await run(ctx, () => doTheRealWork(ctx));
```

规则与核心钩子完全一致：`next()` 最多一次（否则抛 `SnailHookError`），必须 `await`，
不调用 `next()` 就结束整条链。`hookName` 只用于错误消息。

## 测试一个插件

插件不需要网络就能测：把 adapter 换成一个函数，记录它收到的请求并返回伪造响应。

```ts
// trace.spec.ts
import { Api, Get, Server, SnailServer } from "@snail-js/api";
import { describe, expect, it } from "vitest";
import { Trace } from "./tenant.plugin";

function buildServer(): {
  Service: SnailServer;
  requests: Array<{ headers: Record<string, unknown>; url: string }>;
} {
  const requests: Array<{ headers: Record<string, unknown>; url: string }> = [];

  @Server({
    baseURL: "/api",
    adapter: async (config) => {
      requests.push({
        url: config.url ?? "",
        headers: config.headers.toJSON() as Record<string, unknown>
      });
      return {
        data: { code: 0, message: "ok", data: null },
        status: 200,
        statusText: "OK",
        headers: {},
        config
      };
    }
  })
  class TestServer extends SnailServer {}

  return { Service: new TestServer(), requests };
}

describe("trace plugin", () => {
  it("writes the trace header on every request", async () => {
    const { Service, requests } = buildServer();
    Service.use(Trace({ header: "x-trace-id" }));

    @Api("/user")
    class UserApi {
      @Get("/:id")
      getUser(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).getUser("1").send();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers["x-trace-id"]).toBeTypeOf("string");
  });
});
```

### 建议覆盖的用例

1. **方向正确**：装两个已知优先级的插件，断言正向钩子里高优先级先跑、反向钩子里低优先级先跑
   （用往数组里 push 名字的钩子即可）。
2. **条件不满足时是 no-op**：自身开关关闭时不改请求、不写状态。
3. **资源释放**：在 `afterRequest` 清理计时器/控制器；失败与取消路径也要覆盖。
4. **失败路径不抛错**：`onError` 里抛错会被记录并吞掉，但这不该成为常态。
5. **`uninstall` 干净**：`remove()` 之后 `Service.plugins` 里不再有它，且 `onDispose`
   注册的清理函数确实执行了。

### 在测试里替换 adapter

`@Server({ adapter })` 接受任意 axios adapter：一个 `(config) => Promise<AxiosResponse>` 的
函数。用真 adapter 而不是 stub 掉 axios，能让 header 归一化、`params` 处理、
`transformRequest`/`transformResponse` 这一整条 axios 路径留在测试内 —— 于是「这个库怎么构造
请求配置」的 bug 才是可观测的。核心测试就用了这种方式（见 `tests/helpers/test-adapter.ts`）。
