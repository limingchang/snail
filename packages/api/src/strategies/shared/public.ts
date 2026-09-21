/**
 * `@snail-js/api/strategies` 的公共接口面。
 *
 * 三个入口（Vue 用 `index.ts`，React 用 `react.ts`，其余用 `plain.ts`）只差一条语句——
 * 安装哪个 state adapter——然后重新导出本模块。把导出清单放在一处，正是三个入口不会彼此
 * 漂移的原因；在这里新增的 hook 会出现在三者之中，而它们都不重新实现任何东西。
 *
 * The public surface of `@snail-js/api/strategies`.
 *
 * The three entry points (`index.ts` for Vue, `react.ts` for React and `plain.ts`
 * for everything else) differ in exactly one statement — which state adapter they
 * install — and then re-export this module. Keeping the export list in one place
 * is what stops the three entries from drifting apart; a hook added here appears
 * in all three, and none of them re-implements anything.
 */

// ── shared state contract ───────────────────────────────────────────────────

export { createStrategyState } from "./state";
export type {
  StrategyBoundState,
  StrategyState,
  StrategyStateController,
  StrategyStateOptions,
  StrategyStatePatch
} from "./state";

export type { MethodHolder, SnailRequest, StrategyMethod } from "./method";

// ── hooks ───────────────────────────────────────────────────────────────────

export { useRequest } from "../use-request";
export type { UseRequestOptions, UseRequestResult } from "../use-request";

export { useWatcher } from "../use-watcher";
export type { UseWatcherOptions, UseWatcherResult } from "../use-watcher";

export { useFetcher } from "../use-fetcher";
export type {
  UseFetcherCore,
  UseFetcherOptions,
  UseFetcherResult,
  UseFetcherStateOptions
} from "../use-fetcher";

export { usePagination } from "../use-pagination";
export type { PageRequest, UsePaginationOptions, UsePaginationResult } from "../use-pagination";

export { useAutoRequest } from "../use-auto-request";
export type { UseAutoRequestOptions, UseAutoRequestResult } from "../use-auto-request";

export { useRetriableRequest } from "../use-retriable-request";
export type {
  UseRetriableRequestOptions,
  UseRetriableRequestResult
} from "../use-retriable-request";

export { useUploader } from "../use-uploader";
export type {
  UploaderProgress,
  UploadFileState,
  UploadFileStatus,
  UseUploaderOptions,
  UseUploaderResult
} from "../use-uploader";

export { TOKEN_AUTH_PRIORITY, useTokenAuth } from "../use-token-auth";
export type { TokenAuthHandle, TokenAuthOptions } from "../use-token-auth";

export { useSSE } from "../use-sse";
export type { SseConnectionTap, SseEndpoint, UseSseOptions, UseSseResult } from "../use-sse";

export { useDownload } from "../use-download";
export type {
  DownloadDescriptor,
  UseDownloadOptions,
  UseDownloadResult
} from "../use-download";
