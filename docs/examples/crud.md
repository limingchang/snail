# CRUD 接口类

一个覆盖增删改查的 api 类，加上调用侧的各种用法：列表分页、路径参数、静态与动态请求头、
错误分级、取消。

## 1. server

```ts
// src/service.ts
import { Server, SnailServer } from "@snail-js/api";

@Server({
  baseURL: "/api",
  timeout: 10000,
  codeKey: "code",
  messageKey: "message",
  dataKey: "data",
  validateCode: (code) => code === 0 || code === 200
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

## 2. api 类

```ts
// src/api/article.api.ts
import {
  Api,
  Data,
  Delete,
  Get,
  Header,
  HeaderValue,
  Params,
  Patch,
  Post,
  Put,
  Query
} from "@snail-js/api";
import { Service } from "../service";

export interface Article {
  id: number;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

export interface ArticleQuery {
  page: number;
  size: number;
  keyword?: string;
  tag?: string;
}

export interface Page<T> {
  total: number;
  items: T[];
}

export type ArticleDraft = Pick<Article, "title" | "body" | "tags">;

@Api("/article")
@Header({ "x-client": "web" })                 // 类级静态头
class ArticleApi {
  /** 列表：无 key 的 @Query 展开整个对象 */
  @Get("/")
  list(@Query() query: ArticleQuery): Promise<Page<Article>> {
    return null!;
  }

  /** 详情：路径占位符 */
  @Get("/:id")
  detail(@Params("id") id: number): Promise<Article> {
    return null!;
  }

  /** 新建：静态体之外再补一个字段 */
  @Post("/", { data: { published: false } })
  create(@Data() draft: ArticleDraft): Promise<Article> {
    return null!;
  }

  /** 整体更新 */
  @Put("/:id")
  replace(
    @Params("id") id: number,
    @Data() draft: ArticleDraft,
    @HeaderValue("if-match") etag: string
  ): Promise<Article> {
    return null!;
  }

  /** 局部更新：keyed @Data 只改一个字段 */
  @Patch("/:id")
  rename(@Params("id") id: number, @Data("title") title: string): Promise<Article> {
    return null!;
  }

  /** 删除：后端返回 data: null */
  @Delete("/:id")
  remove(@Params("id") id: number): Promise<null> {
    return null!;
  }

  /** 导出：非 JSON 响应直接穿透 */
  @Get("/export", { responseType: "blob", timeout: 60000 })
  exportAll(@Query() query: Omit<ArticleQuery, "page" | "size">): Promise<Blob> {
    return null!;
  }
}

export const articleApi = Service.createApi(ArticleApi);
```

::: tip 装饰器堆叠的顺序
`@Api` 在最上、`@Header` 紧随其后都是合法的 —— `@Header` 同时支持类与方法。
方法上的 `@Header` 会覆盖类上的同名 key，见[参数装饰器](/guide/parameters)。
:::

## 3. 列表与分页

```ts
import { articleApi } from "./api/article.api";

async function loadPage(page: number, size = 20) {
  const method = articleApi.list({ page, size, keyword: "" });

  // 先订阅，再发送：api.getX() 不会发出任何请求
  method.onSuccess((result) => {
    console.log(`第 ${page} 页，共 ${result.data.total} 条`);
  });
  method.onCodeError(({ code, payload }) => {
    console.warn("业务失败", code, payload);
  });

  return method.send();
}

const { data, code, message } = await loadPage(1);
console.log(data.items, code, message);
```

## 4. 详情、缓存标记与取消

```ts
import { SnailCancelledError } from "@snail-js/api";
import { articleApi } from "./api/article.api";

const method = articleApi.detail(42);
method.onHitCache(() => console.log("来自缓存"));

const promise = method.send();

// 用户快速切换了详情页 → 丢掉旧请求
method.abort();

try {
  const { data } = await promise;
  console.log(data);
} catch (error) {
  if (error instanceof SnailCancelledError) {
    console.log("这次请求不再需要了");
  } else {
    throw error;
  }
}
```

::: warning `fromCache` 需要缓存插件
核心只为 `SnailResult.fromCache` 与 `onHitCache` 提供**机制**（`ctx.markCacheHit()`），
真正决定「什么请求被缓存」的是 `@snail-js/api/plugins` 里的 `Cache` 插件（见
[缓存插件](/guide/plugin-cache)）。没有装插件时，`fromCache` 恒为 `false`，`onHitCache`
永不触发。
:::

## 5. 写操作与错误分级

```ts
import { SnailError, SnailResponseError, type SnailResult } from "@snail-js/api";

async function rename(id: number, title: string): Promise<boolean> {
  try {
    const result: SnailResult<
      { code: number; message: string; data: unknown },
      { id: number; title: string }
    > = await articleApi.rename(id, title).send();
    return result.code === 0;
  } catch (error) {
    if (error instanceof SnailResponseError) {
      // 业务失败：HTTP 是 2xx，但业务码不通过
      console.warn("业务提示：", (error.payload as { message?: string }).message);
      return false;
    }
    if (error instanceof SnailError) {
      // 超时 / 取消 / 装饰器错误等
      console.error(error.code, error.message);
      return false;
    }
    // 其余是 axios 的错误（HTTP 4xx/5xx、断网、CORS）
    throw error;
  }
}
```

## 6. 带上 ETag 的更新

```ts
const article = await articleApi.detail(42).send();

const updated = await articleApi
  .replace(42, { title: "新标题", body: article.data.body, tags: article.data.tags }, "\"v3\"")
  .send();
```

`@HeaderValue("if-match")` 把第三个参数写进请求头。类/方法级的静态头用
`@Header({...})`，动态值一律走 `@HeaderValue`。

## 7. 批量并发

`SnailMethod` 是普通对象，`Promise.all` 直接可用；每个方法都有独立的上下文与 `ctx.state`，
所以并发是安全的（这正是把 `state` 从 `meta` 里拆出来的原因）。

```ts
const ids = [1, 2, 3, 4];

const results = await Promise.all(
  ids.map((id) => articleApi.detail(id).send())
);

const articles = results.map((result) => result.data);
```

::: tip 需要「同一时刻只保留最新一次」时
自己 abort 上一次即可（见 §4），或者使用 `@snail-js/api/strategies` 里的策略 ——
策略内部就是这么做的，并且把 `SnailCancelledError` 当作预期控制流消化掉。
:::

## 8. 非 JSON 响应

```ts
const blob = (await articleApi.exportAll({ tag: "vue" }).send()).data;
//    ^? Blob

const url = URL.createObjectURL(blob);
```

`responseType: "blob"` 时响应体没有 `code`/`message`/`data`，库会整体穿透：`result.data`
与 `result.envelope` 都是那个 `Blob`。详见[响应与类型](/guide/responses)。
