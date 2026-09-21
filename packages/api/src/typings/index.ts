/**
 * 公开类型入口（桶文件）。
 *
 * 这里只做再导出，因此不逐个说明成员；每个类型的完整文档都写在它的源文件里。
 * 本模块只包含类型，不会给运行时产物增加任何东西。
 *
 * Public type barrel.
 *
 * Re-exports only, so individual members are documented at their source files
 * rather than here. This module is types-only and contributes nothing to the
 * runtime bundle.
 */
export type {
  SnailApiOptions,
  SnailApiProxy,
  SnailAxiosMethod,
  SnailMethodDecoratorOptions,
  SnailMethodMeta,
  SnailMethodOptions,
  SnailMethodType,
  SnailMethodTypeLower,
  SnailPayloadOf,
  SnailSendOptions
} from "./api";

export type {
  SnailBuiltinParamSource,
  SnailParamDescriptor,
  SnailParamRecord,
  SnailParamResolver,
  SnailParamResolverInput,
  SnailParamSource
} from "./args";

export type {
  SnailStateAdapter,
  SnailStateRef,
  SnailStrategyCommonOptions
} from "./adapter";

export type { SnailMeta } from "./meta";

export type {
  SnailHookKind,
  SnailHookName,
  SnailNext,
  SnailPlugin,
  SnailPluginInstallContext,
  SnailPluginObject
} from "./plugin";

export type {
  IsRawPayload,
  SnailCacheHitCallback,
  SnailCodeErrorCallback,
  SnailCodeOf,
  SnailCodeValidator,
  SnailEnvelope,
  SnailEnvelopeSchema,
  SnailErrorCallback,
  SnailFinishCallback,
  SnailMessageOf,
  SnailRawPayload,
  SnailResponseKeys,
  SnailResult,
  SnailSuccessCallback
} from "./response";

export type {
  ResolvedServerOptions,
  SnailLogLevel,
  SnailServerEnvelope,
  SnailServerOptions
} from "./server";
