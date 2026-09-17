# 版本插件 `Versioning`

版本插件把「这次请求属于哪个 API 版本」变成一件**逐请求**的事实。它是整份文档里唯一一个
需要把「以前的实现做了什么」讲清楚才能理解的设计。

```ts
import { Api, Get, Params } from "@snail-js/api";
import { Version, Versioning } from "@snail-js/api/plugins";
import { Service } from "./service";

Service.use(Versioning({ type: "url", defaultVersion: "1.0.0" }));

@Api("/user")
@Version("1.2.0")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }
}
// → GET /api/v1.2.0/user/1
```

## 选项

```ts
interface VersioningOptions {
  type: VersioningType;              // "url" | "header" | "query" | "custom"
  defaultVersion: string;            // 必填，非空
  key?: string;                      // 键名或 url 段名，按 type 有默认值
  extractor?: (version: string, ctx: SnailContext) => VersioningPatch | void;
}
```

| `type` | `key` 默认值 | 结果 |
| --- | --- | --- |
| `"url"` | `"v"` | `/user/1` → `/v1.2.0/user/1` |
| `"header"` | `"x-api-version"` | 写入 header，**替换**调用方已设的值 |
| `"query"` | `"v"` | 合并进 params，替换同名键、保留其它键 |
| `"custom"` | `""` | 由 `extractor` 返回一个 patch |

`key: ""` 在 `url` 模式下会得到一个裸段：`/1.2.0/user/1`。

类型上 `type` 是必填的；运行时它缺省为 `"url"`（`options?.type ?? "url"`），所以
`Versioning()` 这种写法类型能过、运行时也会走进 url 模式 —— 但它仍然会因为缺 `defaultVersion`
在注册时抛错，见下表。

`defaultVersion` 是**必填**的，这是刻意的：默认版本是与后端的契约，静默假设 `"1.0.0"` 会产生
看起来像路由 bug 的 404。选项在 `setup` 里校验一次，抛错会让注册回滚，绝不会留下一个装了一半、
静默什么都不做的插件：

| 情形 | 抛出的 `SnailPluginError` |
| --- | --- |
| `type` 不在四个值里 | `[snail] Versioning() received an unknown type "..."` |
| `defaultVersion` 不是非空字符串 | `[snail] Versioning() requires a non-empty \`defaultVersion\`` |
| `type: "custom"` 却没给 `extractor` | `[snail] Versioning({ type: "custom" }) requires an \`extractor\` function` |

## `@Version` 与优先级

```ts
function Version(version: string): ClassDecorator & MethodDecorator;
```

`@Version` 是**纯元数据**：它从不触碰请求，也不触碰 server。因此从一个共享模块里给类加装饰器，
不可能把版本泄漏到另一个 server 实例上。

解析顺序：

```text
方法上的 @Version  >  类上的 @Version  >  Versioning({ defaultVersion })
```

`resolveDeclaredVersion` 先读方法槽、再读类槽，两次都沿原型链查找，所以子类 api 会继承基类的
版本。这条顺序是唯一能让「一个端点偏离、而兄弟端点不必全部重述类版本」的排法。

::: warning 未声明版本的方法**也会**被改写
`defaultVersion` 不是「没声明时的兜底跳过」，而是会被实际写入请求：后端对一个未声明的方法
同样期待 `/v1.0.0`，管线里没有第二个地方知道这件事。只有**日志**区分显式版本与默认版本 ——
当解析出的版本与 `defaultVersion` 不同时，会同时打一条 `info.version.change` 和一条
`warn.version.change` 警告。
:::

## 为什么它不再改写 server 的 `baseURL`

**每一次请求都在 `ctx.request` 上重写，永远不碰共享的 `server.baseURL`，也不碰共享的 axios
实例。**

0.1.x 的实现在「任意一个请求第一次运行时」把版本烧进了 server 的 `baseURL`。这个泄漏是必然
的：**第一个跑起来的方法**决定了那个 server 上**之后每一个请求**的版本。调用一次 `v2` 端点，
整个应用就悄悄搬到了 `v2`。按请求从方法 / 类元数据解析版本，让这种状态不可表示 —— 这也是
[迁移指南](./migration.md)里 `@Version("1.0.0")` 那一行的由来。

它跑在 `beforeRequest` 里（`priority: 50`），所以：

- 排在拦截器（`100`）之后：它看到的是拦截器改写过的 url；
- 排在缓存（`-100`）之前：缓存哈希的是**带版本的** url，而不是一个会在它脚下变化的 url。

## `url` 模式的两个保护

（下面是源码摘录，`applyURLVersion` 不是公开导出，只用来解释行为。）

```ts
function applyURLVersion(url: string, version: string, key: string): string {
  const segment = `${key}${version}`;
  if (isAbsoluteURL(url) || hasSegment(url, segment)) return url;
  if (url.length === 0) return `/${segment}`;
  return `/${segment}${url.startsWith("/") ? "" : "/"}${url}`;
}
```

1. **绝对 url 原样保留**：给 `https://cdn.example.com/a.json` 前面加一段只会毁掉 host。
2. **已经带该段的 url 不再改写**：`hasSegment` 只看 `?` / `#` 之前的 path，按 `/` 切分后比较整
   段。所以在方法路径里硬编码了版本时不会出现 `/v1.0.0/v1.0.0/user`。

请求 url 为空时退回 `ctx.route`，所以 `Versioning({ type: "url" })` 加上一个类级 `@Api("")`
也能工作。

## `custom` 模式

```ts
interface VersioningPatch {
  url?: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
}
```

每个字段都是可选的：一个只想改 header 的提取器不必重述它从 `ctx.request` 读到的 url。

```ts
Service.use(
  Versioning({
    type: "custom",
    defaultVersion: "2.0.0",
    extractor: (version, ctx) => ({
      headers: { accept: `application/vnd.acme.v${version}+json` },
      params: { apiVersion: version }
    })
  })
);
```

`url` 是**整段替换**（`ctx.request.url = patch.url`）；`headers` 逐个 `set`（覆盖同名）；
`params` 浅合并（覆盖同名键、保留其它键）。提取器返回 `undefined` / `null` 时什么都不做。

## 消息与日志

| 消息 key | 用途 |
| --- | --- |
| `info.version.change` | 解析出的版本与默认版本不同时记录 |
| `warn.version.change` | 同上的警告版本 |

本插件不贡献自己的 locale 消息，直接复用核心目录里的这两个键。

## 相关

- [迁移：从 0.1.x](./migration.md)：`@Version` 到 `Versioning` 的变更说明
- [插件生命周期](./plugin-lifecycle.md)：`50` 与保留区间的完整表格
- [拦截器插件](./plugin-interceptor.md)：谁在 `50` 之前改写请求
- [缓存插件](./plugin-cache.md)：为什么必须在它之后计算缓存键
