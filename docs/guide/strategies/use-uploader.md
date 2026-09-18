# 请求策略 `useUploader`

有界并发的文件上传，带逐文件状态与聚合进度。

```ts
function useUploader<TData>(
  method: StrategyMethod<[FormData], TData>,
  options?: UseUploaderOptions<TData>
): UseUploaderResult<TData>;
```

## 选项

```ts
interface UseUploaderOptions<TData> extends SnailStrategyCommonOptions {
  concurrency?: number;      // 默认 3
  multiple?: boolean;        // 默认 true
  fieldName?: string;        // 默认 "file"
  onProgress?: (state: UploaderProgress) => void;
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `concurrency` | `number` | `3` | 同时在飞的文件数；下限被夹到 1（0 个槽位的队列永远不会 drain） |
| `multiple` | `boolean` | `true` | `false` 时只取 `FileList` 的第一个，其余丢弃 |
| `fieldName` | `string` | `"file"` | 文件写进 `FormData` 的字段名 |
| `onProgress` | `(state: UploaderProgress) => void` | 未设置 | 聚合进度或任一文件状态变化时调用 |
| 公共选项 | — | — | `adapter` / `onSuccess` / `onError` / `onFinish` |

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `upload(files)` | `(File \| File[] \| FileList \| null \| undefined) => Promise<void>` | 入队并在队列 drain 后 resolve；**永不 reject** |
| `files` | `SnailStateRef<UploadFileState[]>` | 每个文件的状态，按入队顺序 |
| `progress` | `SnailStateRef<number>` | 聚合进度 `0`–`1`；全部成功时到达 `1` |
| `retry(id)` | `(id: string) => void` | 重新入队一个失败的文件（`success` / `uploading` 的文件是 no-op） |
| 状态句柄 | `StrategyState<TData>` | `data` 是**最近一个完成文件**的载荷 |

```ts
interface UploadFileState {
  readonly id: string;         // 稳定 id，retry(id) 用它
  readonly file: File;
  readonly status: "pending" | "uploading" | "success" | "error";
  readonly progress: number;   // 0–1
  readonly error: unknown;
  readonly response: unknown;  // 该文件成功响应的拆包载荷
}
```

## 示例

```ts
import { useUploader } from "@snail-js/api/strategies";
import { api } from "./service";

const uploader = useUploader(api.upload, {
  concurrency: 2,
  onProgress: ({ progress, files }) => console.log(progress, files.length)
});

await uploader.upload(input.files);
uploader.files.value;          // 逐个文件的状态
uploader.retry(uploader.files.value[0]!.id);
```

## 诚实地说，它的边界

- 单个文件失败**不会**中断整批：`upload()` 永不 reject，失败挂在 `files[i].error` 上 —— 这就是
  「5 个传上去了 3 个」和「什么都没发生」的区别。
- `error`（聚合）镜像文件列表：任一文件处于 `error` 状态时它持有第一个失败的错误，最后一个失败被
  重试成功后它清空自己。一次成功上传**不会**替另一个失败的文件清掉 `error`。
- `abort()` 做两件事：中止在飞的文件、清空尚未开始的队列；未成功的文件回到 `pending`（取消不是
  失败，文件通常还在，可以重试）。
- 每个文件用一个新的 `SnailMethod` 实例（`method(form)`），所以并发的多个文件各有自己的上下文。
- `data` / `code` / `message` 是**整批共享**的：`data` 只保留最近一个完成文件的载荷，逐文件信息请读
  `files[i].response`。
- 每次 `upload()` 调用开始时会清掉上一个批次的聚合失败（逐文件的失败仍然保留在各自条目上）。

::: warning 聚合进度是各文件进度的**平均值**
```text
aggregate = files.reduce((sum, f) => sum + f.progress, 0) / files.length
```

单文件进度来自 axios 的 `onUploadProgress`（hook 在 `send()` **开始之后**挂到**实时** config 上；
早于 `send()` 挂会被核心新建的 config 覆盖）。当传输层什么都不上报时（mock adapter、`fetch`
适配器），**每个已完成的文件按 `1` 计** —— 没有这条规则，进度条会永远停在 `0`。所以平均值在「部分
文件报进度、部分不报」时并不精确，它只是一个诚实的近似。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、适配器与公共选项
- [文件上传与进度](../../examples/upload.md)：完整的模板写法
- [错误处理](../errors.md)：为什么取消要单独区分
