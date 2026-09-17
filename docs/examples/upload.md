# 文件上传与进度

`FormData` 上传的关键只有一条：**不带 key 的 `@Data()` 遇到非普通对象会整体替换请求体**，
所以 `FormData` 会被原样交给 axios。进度用 `@UploadProgress` / `@DownloadProgress`。

## 1. api 类

```ts
// src/api/file.api.ts
import {
  Api,
  Data,
  DownloadProgress,
  Get,
  Params,
  Post,
  UploadProgress
} from "@snail-js/api";
import { ref } from "vue";
import { Service } from "../service";

export interface UploadResult {
  url: string;
  size: number;
}

/** 供 UI 直接渲染的上传进度（0 ~ 100）。 */
export const uploadPercent = ref(0);

@Api("/file")
class FileApi {
  @Post("/upload")
  @UploadProgress((event) => {
    if (!event.total) return;
    uploadPercent.value = Math.round((event.loaded / event.total) * 100);
  })
  upload(@Data() form: FormData): Promise<UploadResult> {
    return null!;
  }

  @Get("/download/:id", { responseType: "blob" })
  @DownloadProgress((event) => {
    if (!event.total) return;
    console.log(`下载 ${Math.round((event.loaded / event.total) * 100)}%`);
  })
  download(@Params("id") id: string): Promise<Blob> {
    return null!;
  }
}

export const fileApi = Service.createApi(FileApi);
```

## 2. 进度需要 `xhr` adapter

::: warning 浏览器里必须用 `xhr`
axios 的 `fetch` adapter **无法上报进度事件**。要在浏览器里拿到上传/下载进度，请把 adapter
设为 `xhr` —— 可以放在 server 上，也可以只放在需要进度的那个方法上：

```ts
@Server({ baseURL: "/api", adapter: "xhr" })
class BackEnd extends SnailServer {}
```

```ts
@Post("/upload", { adapter: "xhr" })
upload(@Data() form: FormData): Promise<UploadResult> { return null!; }
```
:::

下载进度（`onDownloadProgress`）在 `fetch` adapter 下同样拿不到，规则一致。

## 3. 组装并发送 FormData

```ts
import { fileApi, uploadPercent, type UploadResult } from "./api/file.api";

async function uploadAvatar(file: File, userId: string): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);            // 文件
  form.append("userId", userId);        // 普通字段
  form.append("scene", "avatar");

  uploadPercent.value = 0;

  const method = fileApi.upload(form);
  method.onError((error) => console.error("上传失败", error));

  try {
    const { data } = await method.send();
    return data;
  } finally {
    uploadPercent.value = 0;
  }
}
```

::: warning 不要手动设置 `content-type`
`FormData` 的 `content-type` 必须由浏览器/axios 生成，因为它要带上 `boundary` 参数。
自己写 `headers: { "content-type": "multipart/form-data" }` 会让 boundary 丢失，后端直接
解析失败。库和 axios 都不会覆盖你已经设好的 header，所以这条只能靠自己注意。
:::

## 4. 为什么 `@Data()` 能直接吃 `FormData`

看 `@Data()` 的两条分支：

| 参数值 | 行为 |
| --- | --- |
| 普通对象（原型是 `Object.prototype`） | 合并进对象体：`{ ...已有, ...值 }` |
| **非**普通对象（`FormData`、`Blob`、`URLSearchParams`、字符串、数组…） | **整体替换**请求体 |

```ts
@Post("/upload")
upload(@Data() form: FormData): Promise<UploadResult> {
  return null!;
}
// 调用：fileApi.upload(formData) → 请求体就是那个 FormData 实例
```

`@Post("/upload", { data: { scene: "avatar" } })` 这类静态体与 `@Data() form: FormData`
**不能混用**：`FormData` 是「整体替换」，静态对象体会被丢掉。需要额外字段就
`form.append("scene", "avatar")`。

## 5. 一次上传多个文件与校验

```ts
function buildForm(files: File[], extra: Record<string, string>): FormData {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}

const form = buildForm(pickedFiles, { scene: "gallery", compress: "true" });
const result = await fileApi.upload(form).send();
```

轴上的 **请求体大小限制、类型校验** 不属于核心：它们要么在后端，要么交给
`@snail-js/api/plugins` 里的校验插件，或者在最外层用一小段业务代码判断。

## 6. 多个上传各自显示进度

::: warning 进度回调是「方法级」的
`@UploadProgress(cb)` 把回调写进方法的元数据，一个方法只有一份，所以上面的
`uploadPercent` 是共享状态。而且没有 per-call 的注入点：每次 `send()` 都会从方法选项
（`@Post(path, { onUploadProgress })`）重新构建请求配置，调用方在发送前改
`method.request` 是无效的。

同样地，方法装饰器里的 `onUploadProgress` 会**覆盖** `@UploadProgress()` 装饰器 ——
这条规则来自 `methodOptions.onUploadProgress ?? progress.onUploadProgress`。

并发上传各自显示进度的可行做法：

1. **给每种上传定义一个方法**（`uploadAvatar` / `uploadDocument`），每个方法配自己的装饰器
   与自己的进度状态 —— 这也是最常见、最好维护的写法；
2. 或者让进度回调只把事件写进一个队列，由 UI 侧按当前活跃的任务分派；
3. 需要更灵活的控制时，直接在 `beforeRequest` 钩子里改写 `ctx.request.onUploadProgress`
   （`ctx.request` 是实时的请求配置），把「本次请求」与「哪个 UI 任务」对应起来；
4. 或者直接用 `useUploader` 策略：它给每个文件一个独立的 `SnailMethod`，按文件跟踪
   `status` / `progress` / `error`，并在有界并发下上传。见
   [`useUploader`](/guide/strategies/use-uploader)。
:::

## 7. 下载并保存

```ts
async function download(id: string): Promise<void> {
  const { data } = await fileApi.download(id).send();
  //      ^? Blob

  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${id}.bin`;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

`responseType: "blob"` 时响应体没有信封，`result.data` 与 `result.envelope` 都是那个
`Blob`，`result.code` / `result.message` 为 `undefined`（业务码缺失时校验直接通过）。
详见[响应与类型](/guide/responses)。

::: tip 上面这段手写代码就是 `triggerBlobDownload()`
`triggerBlobDownload(blob, { filename })` 做的就是这件事，而且把 object URL 的撤销放在**下一个宏任务**
里 —— 在同一个 tick 里撤销会与 Safari / Firefox 的导航抢时序，下载会静默地永不开始。

更大的导出不要走 `Blob`：让服务端签发一个短期 URL，用
[`useDownload`](/guide/strategies/use-download) 把它交给浏览器，这样才有进度、续传与「导航后继续」。
:::

## 8. 取消上传

```ts
const method = fileApi.upload(form);
const promise = method.send();

// 用户点了「取消」
method.abort();

try {
  await promise;
} catch (error) {
  // SnailCancelledError：预期控制流，不是失败
  console.log("已取消");
}
```

`abort()` 会触发底层 `AbortController`，axios 随即中断请求；`send()` 以
`SnailCancelledError` reject，`onFinish` 照常触发（所以 loading 一定会被关掉）。
