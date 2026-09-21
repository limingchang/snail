/**
 * 工具函数的统一导出入口。
 *
 * 这里只做转发，不包含实现：具体代码分散在同目录的 `download.ts`、
 * `emitter.ts`、`is.ts`、`object.ts` 与 `url.ts` 中。
 *
 * Public utility barrel: re-exports only. The implementations live in the sibling
 * `download.ts`, `emitter.ts`, `is.ts`, `object.ts` and `url.ts` modules.
 */
export { Emitter } from "./emitter";
export {
  filenameFromDisposition,
  triggerBlobDownload,
  triggerDownload,
  type TriggerDownloadOptions,
  type TriggerDownloadResult
} from "./download";
export {
  isBinaryBody,
  isBrowser,
  isDefined,
  isFunction,
  isObject,
  isPlainObject,
  isPromise
} from "./is";
export {
  deepMerge,
  deferred,
  noop,
  omit,
  omitUndefined,
  pick,
  resolveValue,
  tryCatch,
  type DeepPartial
} from "./object";
export {
  buildRequestURL,
  capitalize,
  isAbsoluteURL,
  joinURL,
  pathParamNames,
  replacePathParams,
  shortHash,
  stableStringify,
  stripQuery
} from "./url";
