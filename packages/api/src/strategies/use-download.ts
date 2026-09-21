import type { SnailStateRef, SnailStrategyCommonOptions } from "../typings/adapter";
import {
  triggerDownload,
  type TriggerDownloadOptions,
  type TriggerDownloadResult
} from "../utils/download";
import { isCancellation } from "./shared/error";
import { createMethodHolder, type StrategyMethod } from "./shared/method";
import { createStrategyState, type StrategyState } from "./shared/state";

/**
 * 服务端应返回的下载描述符。
 *
 * 这个形状刻意做得很小，因为整个设计依赖服务端做事：它在带外准备好文件，并回以一个短期
 * URL。客户端从不接收字节。
 *
 * The download descriptor a server is expected to return.
 *
 * The shape is intentionally tiny, because the whole design rests on the server
 * doing the work: it prepares the file out of band and answers with a short-lived
 * URL. The client never receives the bytes.
 */
export interface DownloadDescriptor {
  /**
   * 从哪里取文件。可以是相对路径、绝对 URL 或 `blob:` URL。
   *
   * Where to fetch the file from. A relative path, an absolute URL or a `blob:` URL.
   */
  url: string;

  /**
   * 建议的文件名。仅对同源 URL 生效——见 `triggerDownload`。
   *
   * Filename to suggest. Honoured only for a same-origin URL — see `triggerDownload`.
   */
  filename?: string;
}

/**
 * {@link useDownload} 接受的选项。
 *
 * Options accepted by {@link useDownload}.
 */
export interface UseDownloadOptions<TPayload> extends SnailStrategyCommonOptions {
  /**
   * 从你的端点返回的载荷中读出描述符。
   *
   * 默认接受一个裸 URL 字符串，或带 `url`、`downloadUrl`、`fileUrl` 并可选带
   * `filename`/`name` 的对象。当后端以别的形式包装它们时传入本项，命名方式就永远不会
   * 迫使你重塑响应。
   *
   * Read the descriptor out of the payload your endpoint returned.
   *
   * The default accepts a bare URL string, or an object carrying `url`,
   * `downloadUrl` or `fileUrl` plus an optional `filename`/`name`. Supply this when
   * your backend wraps them differently, so a naming choice never forces you to
   * reshape the response.
   */
  pick?: (payload: TPayload) => DownloadDescriptor;

  /**
   * URL 一到就触发浏览器下载。默认 `true`。
   *
   * 设为关闭可以先检查描述符——例如先弹确认框，或把 URL 交给别的下载管理器。
   *
   * Trigger the browser download as soon as the URL arrives. Defaults to `true`.
   *
   * Turn it off to inspect the descriptor first — for instance to show a
   * confirmation, or to hand the URL to a different download manager.
   */
  autoTrigger?: boolean;

  /**
   * 在新标签页打开 URL，而不是下载它。
   *
   * Open the URL in a new tab rather than downloading it.
   */
  openInNewTab?: boolean;

  /**
   * 文件名覆盖，优先于 `pick` 产出的名字。
   *
   * 只有 `useDownload` 能做到：hook 知道本地文件想叫什么，服务端不知道。
   *
   * Filename override, taking precedence over whatever `pick` produced.
   *
   * Only `useDownload` can do this: a hook knows the local file's intended name,
   * the server does not.
   */
  filename?: string;

  /**
   * 锚点容器，用于旧版 Firefox「必须在文档中」的行为。
   *
   * Anchor container, for the old Firefox "must be in the document" behaviour.
   */
  container?: HTMLElement;

  /**
   * 导航使用的 `referrerpolicy`。
   *
   * `referrerpolicy` for the navigation.
   */
  referrerPolicy?: string;
}

/**
 * {@link useDownload} 的返回值。
 *
 * What {@link useDownload} returns.
 */
export interface UseDownloadResult<TPayload> extends StrategyState<TPayload> {
  /**
   * 向服务端索取下载 URL，然后交给浏览器。
   *
   * 在下载被*启动*（而非完成）后兑现。没有完成信号，这是刻意的：传输由浏览器自己的下载
   * 管理器负责，这正是多 GB 文件能工作的原因，而缓冲成 `blob` 会耗尽内存。
   *
   * Ask the server for the download URL, then hand it to the browser.
   *
   * Resolves once the download has been *started* — not completed. There is no
   * completion signal, and that is deliberate: the browser's own download manager
   * owns the transfer, which is exactly what makes a multi-gigabyte file work where
   * a buffered `blob` would exhaust memory.
   */
  download(...args: readonly unknown[]): Promise<TriggerDownloadResult>;

  /**
   * 最近一次解析出的描述符。第一次成功之前为 `undefined`。
   *
   * The most recently resolved descriptor. `undefined` until the first success.
   */
  readonly info: SnailStateRef<DownloadDescriptor | undefined>;

  /**
   * 描述符被解析**并且**已触发后，用它调用；返回取消订阅函数。
   *
   * Called with the descriptor once it has been resolved AND triggered.
   */
  onDownload(callback: (info: DownloadDescriptor) => void): () => void;
}

/** Payload shapes the default `pick` understands. */
type DownloadPayload = string | { url?: string; downloadUrl?: string; fileUrl?: string; filename?: string; name?: string };

/**
 * 驱动一次由服务端准备的下载。
 *
 * ## 为什么它不自己取文件
 *
 * `useDownload` 只等待那个*铸出*下载 URL 的请求，也仅止于此。它从不自己取文件。把响应
 * 缓冲成 `Blob` 会让整个文件占用 JavaScript 内存——而且是两份，一份是响应体、一份是对象
 * URL——还没有进度、不能续传。改为让浏览器去取这个 URL，你得到的是原生下载管理器：流式
 * 写盘、支持续传，并且下载能在页面跳转后继续。
 *
 * ## 为什么这是策略而不是插件
 *
 * 插件用于应用没有专门编写的请求上的横切关注点：缓存、拦截器、校验。下载恰好相反——一次
 * 明确的用户操作，有自己的可见状态和失败模式，从点击处理器里调用。这就是请求策略的定义。
 * 其中与响应式无关的可复用部分——点击一个临时锚点——位于 `triggerDownload()`，它从包根
 * 导出，因此非 hook 的调用方也能直接用。
 *
 * Drive a server-prepared download.
 *
 * ```ts
 * @Api("/report")
 * class ReportApi {
 *   /** Prepares the export server-side and answers with a temp url. *\/
 *   @Post("/export")
 *   create(@Data() query: ReportQuery): Promise<{ url: string; filename: string }> {
 *     return null!;
 *   }
 * }
 *
 * const { download, loading, error } = useDownload(reportApi.create);
 * await download({ from: "2026-01-01" });
 * ```
 *
 * ## Why it does not fetch the file
 *
 * `useDownload` awaits the request that *mints* a download URL, and only that. It
 * never fetches the file itself. Buffering a response into a `Blob` costs the whole
 * file in JavaScript memory — twice, once for the body and once for the object URL
 * — with no progress and no resume. Letting the browser fetch the URL instead gives
 * you the native download manager, streaming to disk, resume support and a download
 * that survives navigation.
 *
 * ## Why this is a strategy and not a plugin
 *
 * A plugin is for a cross-cutting concern that applies to requests an application
 * did not write specially: caching, interceptors, validation. A download is the
 * opposite — one explicit user action, with its own visible state and its own
 * failure modes, invoked from a click handler. That is the definition of a request
 * strategy. The reusable half that is *not* about reactivity — clicking a temporary
 * anchor — lives in `triggerDownload()`, which is exported from the package root so
 * a non-hook caller can use it directly.
 *
 * @param method 代理后的 api 方法，返回下载描述符 /
 *   The proxied api method, returning the download descriptor.
 * @param options 下载选项 / The download options.
 * @returns 带 state 句柄、`download`、`info` 与 `onDownload` 的结果 /
 *   The result with state handles, `download`, `info` and `onDownload`.
 */
export function useDownload<TArgs extends readonly unknown[], TPayload>(
  method: StrategyMethod<TArgs, TPayload>,
  options: UseDownloadOptions<TPayload> = {}
): UseDownloadResult<TPayload> {
  const holder = createMethodHolder<TArgs, TPayload>(method);

  const controller = createStrategyState<TPayload>({
    adapter: options.adapter,
    method,

    onAbort: () => holder.abort()
  });

  const { state, adapter } = controller;
  const info = adapter.create<DownloadDescriptor | undefined>(undefined);
  const downloadListeners = new Set<(descriptor: DownloadDescriptor) => void>();

  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  const triggerOptions: TriggerDownloadOptions = {
    openInNewTab: options.openInNewTab,
    container: options.container,
    referrerPolicy: options.referrerPolicy
  };

  /** Fire the browser download, surfacing a throwing callback as a state error. */
  function dispatch(descriptor: DownloadDescriptor): TriggerDownloadResult {
    const result = triggerDownload(descriptor.url, {
      ...triggerOptions,
      filename: options.filename ?? descriptor.filename
    });

    adapter.write(info, descriptor);
    for (const listener of [...downloadListeners]) {
      try {
        listener(descriptor);
      } catch {
        // One bad listener must not turn a started download into a failed request.
      }
    }

    return result;
  }

  async function download(...args: readonly unknown[]): Promise<TriggerDownloadResult> {
    controller.resetForSend();
    controller.setLoading(true);

    try {
      const result = await holder
        .resolve(args as unknown as TArgs)
        .send(...(args as unknown as TArgs));
      const descriptor = resolveDescriptor(result.data, options);

      // The transport is finished; what remains is browser navigation. A failure
      // here — most often `triggerDownload` throwing because there is no DOM, i.e.
      // `useDownload` called on a server — deliberately *does* fail the call rather
      // than resolving quietly. The caller asked for a download and none started;
      // reporting success would bury a real mistake. It surfaces as a rejected
      // promise plus the usual `error` state, and a subscribing `onDownload`
      // listener never fires because the download never began.
      let triggered: TriggerDownloadResult;
      if (options.autoTrigger === false) {
        adapter.write(info, descriptor);
        triggered = { url: descriptor.url, filename: descriptor.filename };
      } else {
        triggered = dispatch(descriptor);
      }

      controller.applySuccess(result);
      controller.emitSuccess(result.data);
      return triggered;
    } catch (error) {
      if (!isCancellation(error)) {
        controller.applyFailure(error);
        controller.emitError(error);
      }
      throw error;
    } finally {
      controller.setLoading(false);
      controller.emitFinish();
    }
  }

  return {
    ...state,
    download,
    info,
    onDownload(callback: (descriptor: DownloadDescriptor) => void): () => void {
      downloadListeners.add(callback);
      return () => {
        downloadListeners.delete(callback);
      };
    }
  };
}

/**
 * Turn a payload into a descriptor.
 *
 * Accepting several spellings is not sloppiness — it removes a naming argument from
 * every integration. A backend that answers `{ fileUrl }` should not force a `pick`
 * implementation for the sake of one word.
 */
function resolveDescriptor<TPayload>(
  payload: TPayload,
  options: UseDownloadOptions<TPayload>
): DownloadDescriptor {
  if (options.pick) {
    const descriptor = options.pick(payload);
    if (!descriptor || typeof descriptor.url !== "string" || descriptor.url.length === 0) {
      throw new TypeError(
        "[snail] useDownload: `pick` must return a descriptor with a non-empty `url`"
      );
    }
    return descriptor;
  }

  if (typeof payload === "string" && payload.length > 0) {
    return { url: payload };
  }

  const candidate = payload as DownloadPayload | null;
  if (candidate && typeof candidate === "object") {
    const url = candidate.url ?? candidate.downloadUrl ?? candidate.fileUrl;
    if (typeof url === "string" && url.length > 0) {
      const filename = candidate.filename ?? candidate.name;
      return filename ? { url, filename } : { url };
    }
  }

  throw new TypeError(
    "[snail] useDownload: the response carried no download url. Expected a string, or an " +
      "object with `url` / `downloadUrl` / `fileUrl`. Pass `pick` if your server names it " +
      "differently."
  );
}
