# 请求策略 `useDownload`

驱动一次**服务端准备、浏览器执行**的下载。它 `await` 的只有「签发下载 URL」的那一次请求 —— 文件
一个字节都不经过 JavaScript。

```ts
function useDownload<TArgs extends readonly unknown[], TPayload>(
  method: StrategyMethod<TArgs, TPayload>,
  options?: UseDownloadOptions<TPayload>
): UseDownloadResult<TPayload>;
```

## 为什么它是策略，不是插件

这是一个直接回答过的设计问题，值得写在最前面。

**插件**处理的是横切关注点：应用没有特意为它写过什么，它却要作用于**每一个**请求 —— 缓存、拦截器、
校验。**下载**恰好相反：它是一次显式的用户动作，有自己的可见状态（`loading` / `error`）和特有的失败
模式，从 click 处理器里发起，只作用于它自己那一次调用。这就是请求策略的定义。

于是可复用的那一半被拆出来，放在一个**与响应式无关**的位置：

| 形式 | 导入 | 用途 |
| --- | --- | --- |
| `useDownload(method, options?)` | `@snail-js/api/strategies`（或 `/plain`、`/react`） | 需要状态、事件、`info` 的调用方 |
| `triggerDownload(url, options?)` | 包根 `@snail-js/api` | 已经拿到 URL 的非 hook 调用方（脚本、插件、`useFetcher` 旁边的一段命令式代码） |

`triggerDownload` 的全部工作就是「点一个临时 anchor」，所以它不需要 adapter、不需要 `SnailStateRef`，
也因此能从包根导出而不把策略层拖给每个使用者。

## 库为什么不下载字节

直觉上最自然的设计 —— `responseType: "blob"`、`await`、再造一个 object URL —— 对稍大的文件就是错的：

- 整个载荷**必须经过 JavaScript 内存**，一个大导出会把标签页的内存吃光；
- 而且是**两份**：body 一份，`URL.createObjectURL(blob)` 又一份；
- **没有进度**，用户不知道有没有在动；
- **不能续传**，断线就得从头再来。

可扩展的设计是所有大型站点早就在用的那个：**服务端签发一个短期 URL，把 URL 交给浏览器**。于是你得到
浏览器原生下载管理器里的进度、Streaming 落盘而不是内存、断点续传，以及**导航之后仍然继续**的下载。
`useDownload` 只 `await` 那次**签发**请求，剩下的交给浏览器。

```ts
@Api("/report")
class ReportApi {
  /** 让服务端准备好导出，它回答一个临时 URL。 */
  @Post("/export")
  create(@Data() query: ReportQuery): Promise<{ url: string; filename: string }> {
    return null!;
  }
}
```

## 选项

```ts
interface UseDownloadOptions<TPayload> extends SnailStrategyCommonOptions {
  pick?: (payload: TPayload) => DownloadDescriptor;
  autoTrigger?: boolean;        // 默认 true
  openInNewTab?: boolean;       // 默认 false
  filename?: string;
  container?: HTMLElement;
  referrerPolicy?: string;
}

interface DownloadDescriptor {
  url: string;                  // 相对路径、绝对 URL 或 blob: URL
  filename?: string;            // 只有同源 URL 才被尊重
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `pick` | `(payload) => DownloadDescriptor` | 见下 | 从载荷里读出描述符；返回的 `url` 必须是非空字符串，否则抛 `TypeError` |
| `autoTrigger` | `boolean` | `true` | URL 一到就触发浏览器下载。关掉它先检查描述符（比如弹一次确认，或交给别的下载管理器） |
| `openInNewTab` | `boolean` | `false` | 在新标签页打开而不是下载（会加 `rel="noopener noreferrer"`） |
| `filename` | `string` | 未设置 | 文件名覆盖，**优先于** `pick` 产出的名字。这件事只有 hook 做得到：本地知道想要什么名字，服务器不知道 |
| `container` | `HTMLElement` | `document.body` | 挂临时 anchor 的容器，只为兼容旧 Firefox「不在文档里的 anchor 不响应 `click()`」 |
| `referrerPolicy` | `string` | 未设置 | 导航的 `referrerpolicy` |
| 公共选项 | — | — | `adapter` / `onSuccess` / `onError` / `onFinish` |

**默认的 `pick`** 接受两种载荷：一个裸 URL 字符串，或一个对象 —— 对象的 URL 依次取
`url` / `downloadUrl` / `fileUrl`，名字依次取 `filename` / `name`。接受多种拼写不是偷懒：它把
「后端把这个字段叫什么」从每一次集成里去掉。

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `download(...args)` | `(...args) => Promise<TriggerDownloadResult>` | 先请求签发 URL，再把它交给浏览器。**resolve 表示下载已经「开始」，不是完成** |
| `info` | `SnailStateRef<DownloadDescriptor \| undefined>` | 最近一次解析出的描述符；第一次成功之前是 `undefined`。注意它报告的是**服务端说的**描述符，`filename` 覆盖只影响表现层 |
| `onDownload(callback)` | `(cb: (info: DownloadDescriptor) => void) => () => void` | 描述符被解析**且已触发**之后调用；返回取消订阅函数 |
| 状态句柄 | `StrategyState<TPayload>` | 与 `useRequest` 相同，`data` 是签发接口的载荷 |

## 示例

```ts
import { useDownload } from "@snail-js/api/strategies";
import { reportApi } from "./service";

const report = useDownload(reportApi.create);
const off = report.onDownload(({ url }) => console.log("started", url));

await report.download({ from: "2026-01-01" });   // 只等签发那一次请求
report.info.value;                               // { url: "/tmp/abc", filename: "r.pdf" }
report.loading.value;                            // false
report.error.value;                              // undefined

off();
```

```ts
// 后端把字段叫成别的名字：一个 pick 就好，不必改响应结构。
// 前提是方法声明了真实的返回类型，例如
//   create(): Promise<{ payload: { link: string; fileName: string } }>
const report = useDownload(reportApi.create, {
  pick: (payload) => ({ url: payload.payload.link, filename: payload.payload.fileName })
});
```

```ts
// 已经拿到 URL 的非 hook 调用方：直接用包根的工具函数
import { triggerDownload } from "@snail-js/api";

triggerDownload("/files/report.pdf", { filename: "report.pdf" });
```

## 诚实地说，它的边界

- **没有完成信号**，这是刻意的：传输由浏览器自己的下载管理器负责。`download()` resolve 意味着 URL
  已经交给浏览器，不意味着文件已经落盘。
- **跨域 `href` 会忽略 `download` 属性**。浏览器改为尊重服务端的 `Content-Disposition`，而且是故意
  的 —— 允许一个页面给跨域下载改名是安全问题。跨域文件请让服务端发这个 header：

  ```ts
  import { filenameFromDisposition } from "@snail-js/api";

  // 解析 Content-Disposition：filename*（RFC 5987，百分号编码 UTF-8）优先于 filename
  filenameFromDisposition('attachment; filename="report.pdf"');            // "report.pdf"
  filenameFromDisposition("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf");  // "报告.pdf"
  ```

  `filenameFromDisposition()` 在 header 缺失或没命名文件时返回 `undefined`，所以调用方可以回落到自己
  的默认名，而不是往磁盘上写一个字面量 `"undefined"`。
- `pick` 抛错、或返回的 `url` 不是非空字符串时，抛 `TypeError`，并写进 `error`；**不会**静默下载一个
  空 URL。默认 `pick` 认不出载荷时抛的是那条提示你传 `pick` 的 `TypeError`。
- `autoTrigger: false` 时 DOM **完全不被触碰**：`info` 被写入、`download()` resolve 描述符，但
  `onDownload` 监听器**不会**被调用（它们描述的是「已触发」）。
- `triggerDownload()` 在没有 DOM 的运行时**抛 `ReferenceError`**，而不是安静地什么都不做 —— 对一个
  职责就是副作用的函数来说，静默是最坏的结果。因此 `download()` 在服务端会 reject 并把该错误写进
  `error`；服务端请把 URL 返回给客户端，或用 `node:fs` 写字节，见[在服务端运行](../server-side.md)。

## 需要 blob 的时候

如果响应必须经过转换，或者后端发不出 URL，就用 `responseType: "blob"` 请求它（按方法设置，见
[响应与类型](../responses.md)），再用 **`triggerBlobDownload(blob, options?)`**（包根导出）：

```ts
import { triggerBlobDownload } from "@snail-js/api";

@Api("/report")
class ReportApi {
  @Post("/raw", { responseType: "blob" })
  raw(@Data() query: ReportQuery): Promise<Blob> {
    return null!;
  }
}

const blob = await reportApi.raw(query).send();
triggerBlobDownload(blob, { filename: "report.pdf" });
```

它接受一个**已经物化**的 `Blob`，负责创建 object URL 并在**下一个宏任务**里
`URL.revokeObjectURL()`：

- 为什么不在同一个 tick 里撤销：那会和 Safari / Firefox 的导航抢时序，下载会**静默地永不开始**；
- 代价是内存里短暂多出一份副本，这正是 `triggerDownload()` 仍然是推荐路径的原因；
- 运行时没有 `URL.createObjectURL` 时它同样抛 `ReferenceError`。

## 相关

- [策略概览](../strategies.md)：状态形状、适配器与公共选项
- [`useRequest`](./use-request.md)：签发接口本身也是普通请求
- [在服务端运行](../server-side.md)：服务端没有 DOM，下载要在哪里发生
- [文件上传与进度](../../examples/upload.md)：上传侧的对称能力
