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
 * The download descriptor a server is expected to return.
 *
 * The shape is intentionally tiny, because the whole design rests on the server
 * doing the work: it prepares the file out of band and answers with a short-lived
 * URL. The client never receives the bytes.
 */
export interface DownloadDescriptor {
  /** Where to fetch the file from. A relative path, an absolute URL or a `blob:` URL. */
  url: string;

  /** Filename to suggest. Honoured only for a same-origin URL — see `triggerDownload`. */
  filename?: string;
}

/** Options accepted by {@link useDownload}. */
export interface UseDownloadOptions<TPayload> extends SnailStrategyCommonOptions {
  /**
   * Read the descriptor out of the payload your endpoint returned.
   *
   * The default accepts a bare URL string, or an object carrying `url`,
   * `downloadUrl` or `fileUrl` plus an optional `filename`/`name`. Supply this when
   * your backend wraps them differently, so a naming choice never forces you to
   * reshape the response.
   */
  pick?: (payload: TPayload) => DownloadDescriptor;

  /**
   * Trigger the browser download as soon as the URL arrives. Defaults to `true`.
   *
   * Turn it off to inspect the descriptor first — for instance to show a
   * confirmation, or to hand the URL to a different download manager.
   */
  autoTrigger?: boolean;

  /** Open the URL in a new tab rather than downloading it. */
  openInNewTab?: boolean;

  /**
   * Filename override, taking precedence over whatever `pick` produced.
   *
   * Only `useDownload` can do this: a hook knows the local file's intended name,
   * the server does not.
   */
  filename?: string;

  /** Anchor container, for the old Firefox "must be in the document" behaviour. */
  container?: HTMLElement;

  /** `referrerpolicy` for the navigation. */
  referrerPolicy?: string;
}

/** What {@link useDownload} returns. */
export interface UseDownloadResult<TPayload> extends StrategyState<TPayload> {
  /**
   * Ask the server for the download URL, then hand it to the browser.
   *
   * Resolves once the download has been *started* — not completed. There is no
   * completion signal, and that is deliberate: the browser's own download manager
   * owns the transfer, which is exactly what makes a multi-gigabyte file work where
   * a buffered `blob` would exhaust memory.
   */
  download(...args: readonly unknown[]): Promise<TriggerDownloadResult>;

  /** The most recently resolved descriptor. `undefined` until the first success. */
  readonly info: SnailStateRef<DownloadDescriptor | undefined>;

  /** Called with the descriptor once it has been resolved AND triggered. */
  onDownload(callback: (info: DownloadDescriptor) => void): () => void;
}

/** Payload shapes the default `pick` understands. */
type DownloadPayload = string | { url?: string; downloadUrl?: string; fileUrl?: string; filename?: string; name?: string };

/**
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
