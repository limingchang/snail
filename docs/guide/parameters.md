# 参数装饰器

参数装饰器把方法参数放到请求的正确位置上。它们分成两组，职责不要混：

| 装饰器 | 作用位置 | 用途 |
| --- | --- | --- |
| `@Params(key?)` | 方法参数 | 填充 `:placeholder` 路径占位符 |
| `@Query(key?)` | 方法参数 | 写入查询字符串 |
| `@Data(key?)` | 方法参数 | 构造请求体 |
| `@HeaderValue(key?)` | 方法参数 | 写入**动态**请求头（值来自参数） |
| `@Header(record)` | 类 / 方法 | 写入**静态**请求头（编译期就确定的常量） |

::: warning 别把 `@Header` 和 `@HeaderValue` 搞混
`@Header({ "x-client": "web" })` 是**类/方法级静态装饰器**，参数是一个对象字面量；
`@HeaderValue("authorization")` 是**参数装饰器**，参数是一个 key。前者写在类或方法上，
后者写在方法参数上。旧版把 header 参数装饰器叫 `@Header`，`@HeaderParam` 是保留下来的别名
（等于 `@HeaderValue`）。
:::

## 两种形态：带 key 与不带 key

```ts
@Api("/user")
class UserApi {
  // 带 key：一个值放到一个位置
  @Get("/:id")
  get(@Params("id") id: string): Promise<User> {
    return null!;
  }

  // 不带 key：把整个普通对象展开到该位置
  @Get("/:id/:tab")
  getTab(@Params() params: { id: string; tab: string }): Promise<User> {
    return null!;
  }
}
```

| 形态 | 写法 | 行为 |
| --- | --- | --- |
| 带 key | `@Query("page") page: number` | 只写入 `page` 这一个键 |
| 不带 key | `@Query() filters: { q?: string }` | 把对象的每个键展开写入 |

不带 key 时参数**必须是普通对象**，否则在 `send()` 时抛 `SnailDecoratorError`。
「普通对象」的判定是：`Object.prototype.toString` 得到 `[object Object]`，且原型是
`Object.prototype` 或 `null`。

::: warning class 实例不是普通对象
```ts
class Filters { q = ""; page = 1 }

// ✗ Filters.prototype 不是 Object.prototype → send() 抛 SnailDecoratorError
@Get("/list") list(@Query() filters: Filters): Promise<void> { return null!; }

// ✓ 用对象字面量，或展开成普通对象
@Get("/list") list(@Query() filters: { q: string; page: number }): Promise<void> { return null!; }
// 调用处：list({ ...new Filters() })
```
:::

## `@Params` —— 路径占位符

```ts
@Api("/files")
class FileApi {
  @Get("/:bucket/:name")
  get(
    @Params("bucket") bucket: string,
    @Params("name") name: string
  ): Promise<FileMeta> {
    return null!;
  }
}
```

- 值会被 `encodeURIComponent` 编码：`get("a b", "x/y")` → `/files/a%20b/x%2Fy`。
- 占位符替换发生在**所有参数装饰器应用之后**，所以同一次调用里的 `@Query()` 不影响路径。
- 占位符没有值 → `SnailDecoratorError`，消息里会指出路由名与占位符名。

## `@Query` —— 查询字符串

```ts
@Api("/list")
class ListApi {
  @Get("/")
  list(
    @Query() filters: { page: number; size: number },
    @Query("status") status: string
  ): Promise<{ total: number; items: Item[] }> {
    return null!;
  }
}

// 调用：list({ page: 1, size: 20 }, "active")
// 结果：?page=1&size=20&status=active
```

`@Query` 的写入目标是 `request.params`。同一个位置已经有值时按 key 覆盖，因此
**运行时 `@Query()` 覆盖方法装饰器 `options.params` 覆盖 server 的 `params`**。

## `@Data` —— 请求体

`@Data` 的规则与其它三个略不同，因为非 JSON 的请求体必须能原样上传：

| 形态 | 参数值 | 行为 |
| --- | --- | --- |
| `@Data("name")` | 任意 | 合并进对象体：`{ ...已有对象, name: 值 }` |
| `@Data()` | 普通对象 | 合并进对象体 |
| `@Data()` | **非**普通对象 | **整体替换**请求体 |

第三行是 `FormData`、`Blob`、`URLSearchParams`、原始字符串、数组能够上传的原因：

```ts
@Api("/upload")
class UploadApi {
  @Post("/")
  upload(@Data() form: FormData): Promise<{ url: string }> {
    return null!;
  }
}
```

::: tip 静态请求体
方法装饰器的 `options.data` 可以写死请求体，它作为合并的起点：

```ts
@Post("/search", { data: { scope: "all" } })
search(@Data("keyword") keyword: string): Promise<Result> { return null!; }
// body → { scope: "all", keyword: "..." }
```
:::

## `@HeaderValue` —— 动态请求头

```ts
@Api("/secure")
class SecureApi {
  @Get("/me")
  me(@HeaderValue("authorization") token: string): Promise<Profile> {
    return null!;
  }

  // 不带 key：展开一个普通对象
  @Get("/batch")
  batch(@HeaderValue() headers: { "x-trace-id": string }): Promise<void> {
    return null!;
  }
}
```

## `@Header` —— 静态请求头

```ts
@Api("/user")
@Header({ "x-client": "web" })
class UserApi {
  @Get("/secret")
  @Header({ "x-scope": "admin" })
  secret(): Promise<void> {
    return null!;
  }
}
// 最终请求头包含：x-client: web, x-scope: admin
```

类级与方法级会合并，**方法级优先**。它写在装饰器上，因此是常量而非运行时计算值。

## 优先级总表

请求头（从强到弱）：

```text
@HeaderValue(...) 运行时写入
  > @Header({...}) 方法级
    > @Header({...}) 类级
      > @Server({ headers })   // 仅在该 key 尚未出现时写入
```

查询参数与请求体（从强到弱）：

```text
@Query() / @Data() 运行时写入
  > 方法装饰器 options.params / options.data
    > @Server({ params })   // @Api 选项里没有 params / data
```

超时 / adapter / responseType / withCredentials（从强到弱）：

```text
方法装饰器 options
  > @Api 选项
    > @Server 选项
```

## 应用顺序

参数装饰器在类求值时按**参数下标倒序**执行，所以描述符是追加进列表的；发送前
`applyParamDescriptors` 会按参数**下标升序**重新排序后依次应用：

```ts
@Post("/")
create(@Data("name") name: string, @Data("age") age: number): Promise<void> {
  return null!;
}
// 无论装饰器求值顺序如何，body 都是 { name, age }
```

## 错误信息

| 触发时机 | 错误 | 消息 |
| --- | --- | --- |
| 写 `@Query("")`（空字符串 key） | 类求值时 `SnailDecoratorError` | `参数装饰器 @Query 需要一个字符串 key，或省略 key 以展开整个对象` |
| 参数装饰器用在构造函数 / 静态成员 | 类求值时 `SnailDecoratorError` | `@Query 只能用于类的实例方法参数，不能用于构造函数或静态成员` |
| 不带 key 的值不是普通对象 | `send()` 时 `SnailDecoratorError` | `方法[list.query]的参数标记错误：未传入 key 时该参数必须是普通对象` |
| 占位符缺值 | `send()` 时 `SnailDecoratorError` | `路由[/user/:id]中的占位符[:id]没有对应的参数值，请在方法参数上添加 @Params('id')` |

::: tip 自定义参数来源
插件可以注册自己的参数来源并导出配套装饰器，写法见
[编写插件](/guide/plugin-authoring#注册一个参数来源)。
:::
