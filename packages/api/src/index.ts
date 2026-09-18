/**
 * `@snail-js/api` — a decorator-driven, plugin-first HTTP client built on axios.
 *
 * ## The two rules
 *
 * 1. **The core is always imported from the package root.**
 *    ```ts
 *    import { SnailServer, Server, Api, Get, Post, Query, Data, Params } from "@snail-js/api";
 *    ```
 * 2. **Optional behaviour is imported on demand.**
 *    ```ts
 *    import { Cache, Interceptor, Version } from "@snail-js/api/plugins";
 *    import { useRequest, usePagination } from "@snail-js/api/strategies";
 *    import { VueRef } from "@snail-js/api/adapter/vue";
 *    ```
 *
 * Keeping the plugin, strategy and adapter entry points separate is what lets a
 * bundler drop the cache, the validators and the framework glue from an application
 * that does not use them.
 *
 * ## Everything is a plugin
 *
 * The core owns three things and nothing else: the metadata decorators write, the
 * request pipeline, and the plugin lifecycle. Caching, versioning, interceptors,
 * validation and transformation are all built on the same public API a third party
 * gets — see `createPlugin` and `docs/guide/plugin-lifecycle.md`.
 *
 * The framework integration is *not* a plugin. It is the `stateAdapter` server
 * option, so one declaration drives both the handles on `method.meta` and the state
 * every `use*` strategy returns — see {@link SnailAdapter}.
 *
 * @packageDocumentation
 */

// ── core ────────────────────────────────────────────────────────────────────

export { SnailServer } from "./core/server";
export { SnailMethod } from "./core/method";
export type { SnailCodeErrorEvent, SnailMethodEventMap, SnailMethodInit } from "./core/method";
export { SnailContext } from "./core/context";
export type { SnailContextInit } from "./core/context";
export { PluginManager } from "./core/plugin-manager";
export type { RegisteredPlugin } from "./core/plugin-manager";
export { StateBag } from "./core/state-bag";
export { createLogger } from "./core/logger";
export type { SnailLogger } from "./core/logger";

// ── state adapters ──────────────────────────────────────────────────────────

/**
 * The default, framework-free state adapter.
 *
 * A server that declares nothing gets this one. It is also *how* a framework is
 * chosen: the same server option drives both projections of a request — the handles
 * on `method.meta` and the state every `use*` strategy returns:
 *
 * ```ts
 * @Server({ baseURL: "/api" })                             // SnailAdapter, implicitly
 * @Server({ baseURL: "/api", stateAdapter: VueRef })        // or a framework's adapter
 * class BackEnd extends SnailServer {}
 * ```
 *
 * The Vue and React adapters are **not** exported here on purpose: this is the root
 * entry, and re-exporting them would make it statically import both frameworks.
 * Import them from their own subpaths instead:
 *
 * ```ts
 * import { VueRef } from "@snail-js/api/adapter/vue";
 * import { ReactState, useMethodState } from "@snail-js/api/adapter/react";
 * ```
 */
export { SnailAdapter } from "./adapter/plain";

// ── plugin authoring ────────────────────────────────────────────────────────

export { composeChain, createPlugin, definePlugin } from "./core/plugin";
export type {
  BoundHook,
  PluginDefinition,
  PluginHooks,
  PluginSetupApi
} from "./core/plugin";

// ── metadata (for decorator authors) ────────────────────────────────────────

export {
  appendMetadata,
  clearMetadataRegistry,
  collectMethodKeys,
  defineMetadata,
  deleteMetadata,
  getMetadata,
  getOwnMetadata,
  hasMetadata,
  mergeMetadata,
  resolveOwner
} from "./core/metadata";
export * from "./core/metadata.keys";

// ── decorators ──────────────────────────────────────────────────────────────

export * from "./decorators";

// ── errors ──────────────────────────────────────────────────────────────────

export {
  SnailCancelledError,
  SnailDecoratorError,
  SnailError,
  SnailHookError,
  SnailHttpError,
  SnailOptionsError,
  SnailPluginError,
  SnailRequestError,
  SnailResponseError,
  SnailTimeoutError
} from "./error";

// ── localization ────────────────────────────────────────────────────────────

export {
  Localization,
  en,
  getLocale,
  languages,
  localization,
  registerMessages,
  setLocale,
  t,
  zh
} from "./locale";

// ── configuration defaults ──────────────────────────────────────────────────

export {
  DEFAULT_ACCEPTED_CODES,
  DEFAULT_API_OPTIONS,
  DEFAULT_RESPONSE_KEYS,
  DEFAULT_SERVER_OPTIONS,
  LOG_LEVEL_WEIGHT
} from "./default/options";

// ── utilities worth exposing ────────────────────────────────────────────────

export { Emitter } from "./utils/emitter";
export type { DeepPartial } from "./utils";
export {
  filenameFromDisposition,
  triggerBlobDownload,
  triggerDownload
} from "./utils/download";
export type {
  TriggerDownloadOptions,
  TriggerDownloadResult
} from "./utils/download";
export {
  buildRequestURL,
  capitalize,
  deepMerge,
  deferred,
  isAbsoluteURL,
  isBinaryBody,
  isBrowser,
  isDefined,
  isFunction,
  isObject,
  isPlainObject,
  isPromise,
  joinURL,
  omit,
  omitUndefined,
  pathParamNames,
  pick,
  replacePathParams,
  shortHash,
  stableStringify,
  stripQuery,
  tryCatch
} from "./utils";

// ── parameter sources (for plugins) ─────────────────────────────────────────

export {
  hasParamResolver,
  paramResolvers,
  paramSources,
  registerParamResolver
} from "./core/args";

// ── types ───────────────────────────────────────────────────────────────────

export type {
  IsRawPayload,
  ResolvedServerOptions,
  SnailApiOptions,
  SnailApiProxy,
  SnailBuiltinParamSource,
  SnailCacheHitCallback,
  SnailCodeErrorCallback,
  SnailCodeOf,
  SnailCodeValidator,
  SnailEnvelope,
  SnailEnvelopeSchema,
  SnailErrorCallback,
  SnailFinishCallback,
  SnailHookKind,
  SnailHookName,
  SnailLogLevel,
  SnailMessageOf,
  SnailMeta,
  SnailMethodDecoratorOptions,
  SnailMethodMeta,
  SnailMethodOptions,
  SnailMethodType,
  SnailMethodTypeLower,
  SnailNext,
  SnailParamDescriptor,
  SnailParamRecord,
  SnailParamResolver,
  SnailParamResolverInput,
  SnailParamSource,
  SnailPayloadOf,
  SnailPlugin,
  SnailPluginInstallContext,
  SnailPluginObject,
  SnailRawPayload,
  SnailResponseKeys,
  SnailResult,
  SnailSendOptions,
  SnailServerOptions,
  SnailStateAdapter,
  SnailStateRef,
  SnailStrategyCommonOptions,
  SnailSuccessCallback
} from "./typings";

export type {
  SnailConnection,
  SnailHttpStreamConnection,
  SnailHttpStreamOptions,
  SnailReconnectPolicy,
  SnailSocketConnection,
  SnailSseConnection,
  SnailSseEndpoint,
  SnailSseMessage,
  SnailSseOptions,
  SnailWsEndpoint,
  SnailWsOptions
} from "./typings/stream";

export type { SnailLanguage, SnailLocaleInput, SnailMessages } from "./locale";
