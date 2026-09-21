import type { SnailStateRef, SnailStrategyCommonOptions } from "../typings/adapter";
import { isCancellation } from "./shared/error";
import { attachUploadProgress } from "./shared/method";
import type { SnailRequest, StrategyMethod } from "./shared/method";
import { createTaskQueue } from "./shared/queue";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/**
 * 一个排队文件的生命周期。
 *
 * Lifecycle of one queued file.
 */
export type UploadFileStatus = "pending" | "uploading" | "success" | "error";

/**
 * hook 跟踪的单个文件的全部信息。
 *
 * Everything the hook tracks about one file.
 */
export interface UploadFileState {
  /**
   * 稳定 id，供 `retry(id)` 使用。
   *
   * Stable id, used by `retry(id)`.
   */
  readonly id: string;

  /**
   * 文件本身。
   *
   * The file itself.
   */
  readonly file: File;

  /**
   * 该文件当前的生命周期状态。
   *
   * The file's current lifecycle status.
   */
  readonly status: UploadFileStatus;

  /**
   * `0`–`1`；传输层报告进度时取报告值，否则取「完成或未完成」。
   *
   * `0`–`1`, from the transport when it reports progress, otherwise completed-or-not.
   */
  readonly progress: number;

  /**
   * 该文件的失败对象。取消时不会写入。
   *
   * Failure of this file. Untouched for a cancellation.
   */
  readonly error: unknown;

  /**
   * 该文件成功响应的解包后载荷。
   *
   * Unwrapped payload of this file's successful response.
   */
  readonly response: unknown;
}

/**
 * 交给 `onProgress` 的快照。
 *
 * Snapshot handed to `onProgress`.
 */
export interface UploaderProgress {
  /**
   * 所有排队文件的平均进度，`0`–`1`。
   *
   * Average progress across every queued file, `0`–`1`.
   */
  progress: number;
  /**
   * 当前的全部文件状态，按入队顺序。
   *
   * All current file states, in queue order.
   */
  files: readonly UploadFileState[];
}

/**
 * {@link useUploader} 接受的选项。
 *
 * Options accepted by {@link useUploader}.
 */
export interface UseUploaderOptions<TData> extends SnailStrategyCommonOptions {
  /**
   * 同时在途的文件数。默认 `3`。
   *
   * Files in flight at once. Defaults to `3`.
   */
  concurrency?: number;

  /**
   * 允许一次 `upload()` 接受多个文件。
   *
   * 默认 `true`。为 `false` 时只把 `FileList` 的第一项入队，其余被丢弃——单文件头像上传
   * 不该因为用户多选就悄悄上传 40 张度假照片。
   *
   * Accept more than one file per `upload()` call.
   *
   * Defaults to `true`. When `false`, only the first entry of a `FileList` is
   * queued and the rest are dropped — a single-file avatar input should not
   * silently upload 40 holiday photos because a user multi-selected.
   */
  multiple?: boolean;

  /**
   * 聚合进度或单文件进度变化时调用。
   *
   * Called whenever aggregate or per-file progress changes.
   */
  onProgress?: (state: UploaderProgress) => void;

  /**
   * 文件写入的 FormData 字段名。默认 `"file"`。
   *
   * FormData field the file is written to. Defaults to `"file"`.
   */
  fieldName?: string;
}

/**
 * {@link useUploader} 的返回值。
 *
 * What {@link useUploader} returns.
 */
export interface UseUploaderResult<TData> extends StrategyState<TData> {
  /**
   * 把文件入队，并在队列排空后兑现。
   *
   * 绝不拒绝：单文件失败体现在 `files[i].error` 上，一个坏文件不该中断整批——这正是
   * 「5 个里成功了 3 个」与「什么都没发生」的区别。
   *
   * Queue files and resolve once the queue drains.
   *
   * Never rejects: per-file failures live on `files[i].error`, and one bad file
   * must not abort the batch — that is the difference between "3 of 5 uploaded"
   * and "nothing happened".
   */
  upload(files: File | File[] | FileList | null | undefined): Promise<void>;

  /**
   * 所有已入队的文件，按入队顺序。
   *
   * Every queued file, in queue order.
   */
  readonly files: SnailStateRef<UploadFileState[]>;

  /**
   * 聚合进度，`0`–`1`。所有文件都成功时达到 `1`。
   *
   * Aggregate progress, `0`–`1`. Reaches `1` when every file succeeded.
   */
  readonly progress: SnailStateRef<number>;

  /**
   * 重新入队一个失败的文件。
   *
   * Re-queue one failed file.
   */
  retry(id: string): void;
}

/** Normalise the several shapes a file input hands out. */
function normalizeFiles(input: File | File[] | FileList | null | undefined): File[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  // A `FileList` is array-like and carries `length`; a single `File` does not.
  if (typeof (input as FileList).length === "number") {
    return Array.from(input as ArrayLike<File>);
  }
  return [input as File];
}

/** Keep a fraction inside `0`–`1`; a transport can report `loaded > total`. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 以有界的并行数上传文件。
 *
 * ## 进度
 *
 * 单文件进度来自传输层，通过 axios 的 `onUploadProgress`；hook 会把它挂到每个文件**当前
 * 生效的**请求 config 上（为什么必须在 `send()` 开始后立刻做，见 `shared/method.ts`）。
 * 聚合值是各文件值的平均，而已完成的文件无论传输层报了多少都计为 `1`——被 mock 或基于
 * `fetch` 的 adapter 根本不上报，没有这条规则进度条会停在 `0`。
 *
 * ## `data` 与 `code`
 *
 * state 句柄由整批共享，因此 `data` 保存的是最近一个完成文件的载荷。需要按文件的信息请用
 * `files[i].response`。`error` 与文件列表保持一致：只要有文件处于 `error` 状态，它就保存
 * 第一个失败文件的错误；最后一个失败被成功重试后它会自行清空。
 *
 * Upload files with a bounded number of parallel requests.
 *
 * ```ts
 * const uploader = useUploader(api.upload, { concurrency: 2 });
 * await uploader.upload(input.files);
 * uploader.files.value;      // per-file status, progress, error, response
 * uploader.retry(id);        // re-queue one failure
 * ```
 *
 * ## Progress
 *
 * Per-file progress comes from the transport via axios' `onUploadProgress`, which
 * the hook attaches to the **live** request config of each file (see
 * `shared/method.ts` for why that has to happen right after `send()` starts). The
 * aggregate is the mean of the per-file values, and a finished file counts as `1`
 * regardless of what the transport reported — a mocked or `fetch`-based adapter
 * reports nothing at all, and without that rule the bar would stop at `0`.
 *
 * ## `data` and `code`
 *
 * The state handles are shared by the whole batch, so `data` holds the payload of
 * the most recently finished file. Use `files[i].response` for anything
 * per-file. `error` mirrors the file list: it holds the first failed file's error
 * while any file is in the `error` state, and clears itself once the last failure
 * has been retried successfully.
 *
 * @param method 代理后的上传方法，接收 `FormData` / The proxied upload method, taking `FormData`.
 * @param options 上传选项 / The upload options.
 * @returns 带 state 句柄、`files`、`progress` 与 `retry` 的结果 /
 *   The result with state handles, `files`, `progress` and `retry`.
 */
export function useUploader<TData>(
  method: StrategyMethod<[FormData], TData>,
  options: UseUploaderOptions<TData> = {}
): UseUploaderResult<TData> {
  const fieldName = options.fieldName ?? "file";
  const queue = createTaskQueue(options.concurrency ?? 3);
  const inFlight = new Set<SnailRequest<TData>>();
  let states: UploadFileState[] = [];
  let sequence = 0;

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    method,

    onAbort: () => {
      // Two halves: abort what is on the wire, drop what has not started. Leaving
      // either half alive means `abort()` appears not to work.
      for (const snail of [...inFlight]) snail.abort();
      inFlight.clear();
      queue.clear();

      // An aborted file goes back to `pending` rather than `error`: cancelling is
      // not a failure, and the file is usually still there to retry.
      for (const entry of states) {
        if (entry.status === "success") continue;
        patch(entry.id, { status: "pending", progress: 0, error: undefined });
      }
    }
  });

  const { state } = controller;
  const adapter = controller.adapter;
  const files = adapter.create<UploadFileState[]>([]);
  const progress = adapter.create<number>(0);

  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  function writeStates(): void {
    // A fresh array (and fresh entries) per change: React compares snapshots by
    // identity, so mutating in place would not re-render.
    adapter.write(files, states.slice());
  }

  function recalc(): void {
    const aggregate =
      states.length === 0
        ? 0
        : states.reduce((sum, entry) => sum + entry.progress, 0) / states.length;
    adapter.write(progress, aggregate);

    // The aggregate failure mirrors the file list rather than the last event: a
    // batch with no failed file is not failing, which is exactly what makes a
    // successful `retry()` clear the error again.
    const failure = states.find((entry) => entry.status === "error");
    controller.setError(failure ? failure.error : undefined);

    options.onProgress?.({ progress: aggregate, files: states.slice() });
  }

  function patch(id: string, changes: Partial<UploadFileState>): void {
    states = states.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry));
    writeStates();
    recalc();
  }

  async function runFile(id: string): Promise<void> {
    const entry = states.find((candidate) => candidate.id === id);
    if (!entry || entry.status === "success" || entry.status === "uploading") return;

    patch(id, { status: "uploading", error: undefined });

    const form = new FormData();
    form.append(fieldName, entry.file, entry.file.name);

    const snail = method(form);
    inFlight.add(snail);

    try {
      const sending = snail.send(form);
      // Must follow `send()`: the core builds a fresh config synchronously at the
      // start of `send()`, so a callback attached earlier would be discarded.
      attachUploadProgress(snail, (event) => {
        if (!event.total || event.total <= 0) return;
        patch(id, { progress: clamp01(event.loaded / event.total) });
      });

      const result = await sending;
      patch(id, { status: "success", progress: 1, response: result.data, error: undefined });
      // Deliberately *not* `applySuccess`: that clears `error`, and one failed file
      // must stay visible even after another file in the same batch succeeds.
      controller.setData(result.data);
      controller.setCode(result.code);
      controller.setMessage(result.message);
      controller.emitSuccess(result.data);
    } catch (error) {
      if (isCancellation(error)) {
        patch(id, { status: "pending", progress: 0, error: undefined });
        return;
      }
      patch(id, { status: "error", error });
      controller.applyFailure(error);
      controller.emitError(error);
    } finally {
      inFlight.delete(snail);
      recalc();
    }
  }

  async function upload(input: File | File[] | FileList | null | undefined): Promise<void> {
    const incoming = normalizeFiles(input);
    const accepted = options.multiple === false ? incoming.slice(0, 1) : incoming;
    if (accepted.length === 0) return;

    const queued = accepted.map((file) => {
      sequence += 1;
      return {
        id: `upload-${sequence}`,
        file,
        status: "pending" as const,
        progress: 0,
        error: undefined,
        response: undefined
      };
    });

    // A new selection starts a new batch: the previous batch's aggregate failure
    // must not colour it. Per-file failures are still on their own entries.
    controller.resetForSend();

    states = [...states, ...queued];
    writeStates();
    recalc();

    for (const entry of queued) {
      queue.add(() => runFile(entry.id));
    }

    await queue.drain();
  }

  function retry(id: string): void {
    const entry = states.find((candidate) => candidate.id === id);
    if (!entry || entry.status === "success" || entry.status === "uploading") return;

    patch(id, { status: "pending", progress: 0, error: undefined });
    queue.add(() => runFile(id));
  }

  return { ...state, upload, files, progress, retry };
}
