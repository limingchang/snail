# API 参考

包根 `@snail-js/api` 的完整公开导出，按用途分组。可选插件与请求策略从子路径导入，导出清单见
文末的[插件与策略导出](#插件与策略导出)。

```ts
import { SnailServer, Server, Api, Get, Query } from "@snail-js/api";
```

## 核心类

### `SnailServer`

```ts
class SnailServer<
  ServerResponse = SnailEnvelopeSchema,
  DataKey extends string = "data",
  CodeKey extends string = "code",
  MessageKey extends string = "message"
> {
  readonly name: string;
  readonly options: ResolvedServerOptions;
  readonly axios: AxiosInstance;
  readonly pluginManager: PluginManager;

  constructor();

  use(plugin: SnailPluginObject<any> | SnailPlugin<any>): this;
  remove(plugin: SnailPluginObject<any> | string): Promise<boolean>;
  hasPlugin(name: string): boolean;
  get plugins(): readonly string[];

  createApi<TClass extends new (...args: any[]) => object>(
    apiClass: TClass
  ): SnailApiProxy<InstanceType<TClass>, ServerResponse, DataKey, CodeKey, MessageKey>;

  createSse<TClass extends new (...args: any[]) => object>(sseClass: TClass): SnailSseEndpoint;
  createWebSocket<TClass extends new (...args: any[]) => object>(wsClass: TClass): SnailWsEndpoint;

  request<T = unknown, R = AxiosResponse<T>>(config: AxiosRequestConfig): Promise<R>;
  dispose(): Promise<void>;
  describe(): Record<string, unknown>;
}
```

- `use()` 同步且可链式，注册即校验；`remove()` 返回是否真的移除了插件。
- `createApi()` 的结果按 api 类缓存（`WeakMap`），同一个类反复调用返回同一个代理。
- `createSse()` / `createWebSocket()` 在目标类缺少对应装饰器时抛 `SnailDecoratorError`。

::: warning `request()` 不走插件管线
`server.request(config)` 会 `await pluginManager.ready`，然后把 `{ baseURL, timeout, ...config }`
直接交给该 server 的 axios 实例。它**不会**经过 `beforeRequest` / `afterResponse` 链，也不会做
信封拆包与业务码校验 —— 缓存、校验、拦截器等插件对它不生效，返回的是原始 `AxiosResponse`。
需要这些能力时请用 `createApi()` 声明式的 api。
:::

### `SnailMethod`

```ts
class SnailMethod<
  S = unknown,
  T = unknown,
  D extends string = "data",
  C extends string = "code",
  M extends string = "message"
> {
  readonly name: string;             // server.api.method
  readonly methodName: string;
  readonly methodType: SnailMethodType;
  readonly route: string;            // 替换 :placeholder 之前的 url
  readonly args: readonly unknown[];
  readonly context: SnailContext;

  get meta(): Record<string, unknown>;
  get pending(): boolean;
  get result(): SnailResult<S, T, D, C, M> | undefined;
  get error(): unknown;
  get request(): InternalAxiosRequestConfig;

  constructor(init: SnailMethodInit, args?: readonly unknown[]);

  send(...args: unknown[]): Promise<SnailResult<S, T, D, C, M>>;
  abort(reason?: unknown): void;

  onSuccess(listener: (result: SnailResult<S, T, D, C, M>) => void): () => void;
  onError(listener: (error: unknown) => void): () => void;
  onCodeError(listener: (event: SnailCodeErrorEvent) => void): () => void;
  onFinish(listener: () => void): () => void;
  onHitCache(listener: () => void): () => void;
}
```

所有 `on*` 订阅都返回取消订阅函数。`send(...args)` 传入参数时会覆盖代理时捕获的参数。五个事件
各自观察什么、按什么顺序触发、以及取消订阅语义见[方法事件](/guide/events)。

### `SnailContext`

每个 `send()` 一个上下文，是插件钩子收到的唯一对象。

```ts
class SnailContext {
  readonly server: SnailServer<any, any, any, any>;
  readonly serverOptions: ResolvedServerOptions;
  readonly apiClass: new () => unknown;
  readonly api: unknown;
  readonly apiName: string;
  readonly apiOptions: Required<SnailApiOptions>;
  readonly methodName: string;
  readonly methodType: SnailMethodType;
  readonly route: string;
  readonly fullName: string;             // server.api.method
  readonly logger: SnailLogger;
  readonly descriptors: readonly SnailParamDescriptor[];
  readonly state: StateBag;              // 每次 send 清空
  meta: Record<string, unknown>;         // 核心按 stateAdapter 创建五个句柄，跨多次 send 保留；initMeta 只追加插件自己的
  request: InternalAxiosRequestConfig;
  pathParams: Record<string, unknown>;
  response: AxiosResponse | undefined;
  error: unknown;
  result: SnailResult<any, any, any, any, any> | undefined;
  startedAt: number;
  finishedAt: number | undefined;

  get elapsed(): number;
  get isInterrupted(): boolean;
  get isCacheHit(): boolean;

  interrupt(response?: AxiosResponse): void;
  markCacheHit(): void;
  setResponse(response: AxiosResponse | undefined): void;
  getResponse(): AxiosResponse | undefined;
  requireResponse(): AxiosResponse;
  setRequest(request: InternalAxiosRequestConfig): void;
  getRequest(): InternalAxiosRequestConfig;
  setResult(result: SnailResult<any, any, any, any, any>): void;
  reset(request: InternalAxiosRequestConfig): void;
  describe(): Record<string, unknown>;
}
```

### `PluginManager`

```ts
class PluginManager {
  constructor(serverName: string, serverOptions: ResolvedServerOptions);

  get size(): number;
  get ready(): Promise<void>;

  has(name: string): boolean;
  get(name: string): RegisteredPlugin | undefined;
  names(): string[];
  list(): RegisteredPlugin[];
  sorted(direction: "forward" | "unwind"): RegisteredPlugin[];
  hooks(hookName: string): BoundHook[];
  hasHook(hookName: string): boolean;

  register(plugin: SnailPluginObject<any>): void;
  remove(name: string): Promise<void>;
  clear(): Promise<void>;

  runChain(hookName: string, ctx: unknown, downstream?: () => Promise<void> | void): Promise<void>;
  runEffects(hookName: string, ...args: unknown[]): Promise<void>;
  runEffectsSync(hookName: string, ...args: unknown[]): void;
  reduce<T>(hookName: string, initial: T, ...args: unknown[]): T;
}
```

### `StateBag`

```ts
class StateBag {
  get<T = unknown>(key: string): T | undefined;
  get<T = unknown>(key: string, fallback: T): T;
  require<T = unknown>(key: string): T;   // 缺失时抛 ReferenceError
  set<T = unknown>(key: string, value: T): this;
  setDefault<T = unknown>(key: string, value: T): T;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  keys(): string[];
  snapshot(): Record<string, unknown>;
}
```

### `createLogger`

```ts
function createLogger(level?: SnailLogLevel): SnailLogger;

interface SnailLogger {
  readonly level: SnailLogLevel;
  enabled(level: Exclude<SnailLogLevel, "silent">): boolean;
  error(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  debug(message: string, ...rest: unknown[]): void;
}
```

## 插件编写

```ts
function createPlugin<O = void, Hooks extends object = PluginHooks>(
  definition: PluginDefinition<O, Hooks>
): SnailPlugin<O>;

function definePlugin<O = unknown>(factory: SnailPlugin<O>): SnailPlugin<O>;

function composeChain(
  hookName: string,
  entries: readonly BoundHook[]
): (ctx: unknown, downstream?: () => Promise<void> | void) => Promise<void>;

interface PluginDefinition<O, Hooks extends object> {
  readonly name: string;
  readonly priority?: number;
  readonly dependsOn?: readonly string[];
  readonly setup?: (options: O, api: PluginSetupApi) => Hooks | void;
}

interface SnailPluginObject<O = unknown> {
  readonly name: string;
  readonly priority?: number;          // 默认 0；无上界的数字，参考档位见下文「优先级常量」
  readonly dependsOn?: readonly string[];
  readonly options?: O;

  install?(ctx: SnailPluginInstallContext, options: O): void | Promise<void>;
  uninstall?(ctx: SnailPluginInstallContext, options: O): void | Promise<void>;

  configureServer?(options: ResolvedServerOptions): void;
  configureApi?(options: SnailApiOptions, apiClass: new () => unknown): void;
  configureMethod?(options: SnailMethodOptions, methodName: string): void;

  initMeta?(ctx: SnailContext): void;
  beforeCreate?(ctx: SnailContext): void;
  beforeRequest?(ctx: SnailContext, next: SnailNext): Promise<void> | void;
  requestInterceptor?(
    config: InternalAxiosRequestConfig,
    ctx: SnailContext
  ): AxiosRequestConfig | void;
  afterResponse?(ctx: SnailContext, next: SnailNext): Promise<void> | void;
  responseInterceptor?(response: AxiosResponse, ctx: SnailContext): AxiosResponse | void;
  onError?(ctx: SnailContext, error: unknown): void;
  afterRequest?(ctx: SnailContext): void;
}

type SnailPlugin<O = unknown> = (options?: O) => SnailPluginObject<O>;

interface SnailPluginInstallContext {
  readonly serverName: string;
  readonly serverOptions: ResolvedServerOptions;
  readonly pluginNames: readonly string[];
}

interface PluginSetupApi {
  readonly serverName: string;
  readonly serverOptions: ResolvedServerOptions;
  readonly installedPlugins: readonly string[];
  defineParamSource(source: string, resolver: SnailParamResolver): void;
  addMessages(messages: SnailMessages): void;
  onDispose(dispose: () => void | Promise<void>): void;
}

interface BoundHook {
  readonly pluginName: string;
  readonly hook: (...args: any[]) => any;
}
```

`PluginHooks` 是 `SnailPluginObject` 去掉 `name` / `priority` / `dependsOn` / `install` /
`uninstall` 之后的部分。详见[编写插件](/guide/plugin-authoring)。

## 元数据仓库

```ts
function defineMetadata(key: symbol, value: unknown, target: unknown, propertyKey?: PropertyKey): void;
function getMetadata<T = unknown>(key: symbol, target: unknown, propertyKey?: PropertyKey): T | undefined;
function getOwnMetadata<T = unknown>(key: symbol, target: unknown, propertyKey?: PropertyKey): T | undefined;
function hasMetadata(key: symbol, target: unknown, propertyKey?: PropertyKey): boolean;
function deleteMetadata(key: symbol, target: unknown, propertyKey?: PropertyKey): boolean;
function appendMetadata<T>(key: symbol, value: T, target: unknown, propertyKey?: PropertyKey): void;
function mergeMetadata<T extends object>(key: symbol, value: T, target: unknown, propertyKey?: PropertyKey): void;
function collectMethodKeys(key: symbol, target: unknown): string[];
function resolveOwner(target: unknown): object;
function clearMetadataRegistry(): void;
```

### 元数据键

```ts
const SNAIL_SERVER_OPTIONS: symbol;   // Symbol.for("@snail-js/api:server-options")
const SNAIL_API_OPTIONS: symbol;      // Symbol.for("@snail-js/api:api-options")
const SNAIL_REQUEST_METHOD: symbol;   // Symbol.for("@snail-js/api:request-method")
const SNAIL_PARAMS: symbol;           // Symbol.for("@snail-js/api:params")
const SNAIL_HEADERS: symbol;          // Symbol.for("@snail-js/api:headers")
const SNAIL_UPLOAD_PROGRESS: symbol;  // Symbol.for("@snail-js/api:upload-progress")
const SNAIL_DOWNLOAD_PROGRESS: symbol;// Symbol.for("@snail-js/api:download-progress")
const SNAIL_SSE_OPTIONS: symbol;      // Symbol.for("@snail-js/api:sse-options")
const SNAIL_SSE_HANDLERS: symbol;     // Symbol.for("@snail-js/api:sse-handlers")
const SNAIL_WS_OPTIONS: symbol;       // Symbol.for("@snail-js/api:ws-options")
const SNAIL_WS_HANDLERS: symbol;      // Symbol.for("@snail-js/api:ws-handlers")
const SNAIL_HTTP_STREAM: symbol;      // Symbol.for("@snail-js/api:http-stream")
const SNAIL_CUSTOM_KEY_PREFIX: string;// "@snail-js/api:custom:"
```

## 装饰器

### 类装饰器

```ts
function Server(baseURL: string): ClassDecorator;
function Server(options: SnailServerOptions): ClassDecorator;

function Api(url?: string): ClassDecorator;
function Api(options: SnailApiOptions): ClassDecorator;

function Header(record: Record<string, unknown>): ClassDecorator & MethodDecorator;

function Sse(path: string, options?: SnailSseOptions): ClassDecorator;
function WebSocket(path: string, options?: SnailWsOptions): ClassDecorator;
const Ws: typeof WebSocket;
```

### 请求方式装饰器

```ts
type RequestMethodDecorator = (
  path?: string,
  options?: SnailMethodOptions
) => MethodDecorator;

const Get: RequestMethodDecorator;
const Post: RequestMethodDecorator;
const Put: RequestMethodDecorator;
const Delete: RequestMethodDecorator;
const Patch: RequestMethodDecorator;
const Head: RequestMethodDecorator;
const Options: RequestMethodDecorator;

/** 工厂本身：Request("GET") 得到一个与 @Get 等价的装饰器工厂。 */
const Request: (method: SnailMethodType) => RequestMethodDecorator;
```

### 参数装饰器

```ts
type ParamDecoratorInput<O = void> = string | (O & { key?: string });

const Params: (input?: ParamDecoratorInput) => ParameterDecorator;
const Query: (input?: ParamDecoratorInput) => ParameterDecorator;
const Data: (input?: ParamDecoratorInput) => ParameterDecorator;
const HeaderValue: (input?: ParamDecoratorInput) => ParameterDecorator;
/** @deprecated 旧名，等于 @HeaderValue。 */
const HeaderParam: typeof HeaderValue;

function createParamDecoratorFor<O = void>(
  source: string
): (input?: ParamDecoratorInput<O>) => ParameterDecorator;

function normalizeParamInput<O>(
  input: ParamDecoratorInput<O> | undefined
): { key: string | undefined; options: O | undefined };

function defineParamDescriptor(
  source: string,
  resolver: SnailParamResolver,
  input: ParamDecoratorInput<any> | undefined,
  target: unknown,
  propertyKey: string | symbol | undefined,
  index: number
): void;
```

### 进度与流装饰器

```ts
type SnailProgressCallback = (event: AxiosProgressEvent) => void;

function UploadProgress(callback: SnailProgressCallback): MethodDecorator;
function DownloadProgress(callback: SnailProgressCallback): MethodDecorator;

function HttpStream(
  path?: string,
  options?: SnailHttpStreamOptions & { method?: SnailMethodType }
): MethodDecorator;

function OnSseOpen(): MethodDecorator;
function OnSseError(): MethodDecorator;
function SseEvent(event?: string): MethodDecorator;      // 默认 "message"

function OnWsOpen(): MethodDecorator;
function OnWsMessage(): MethodDecorator;
function OnWsClose(): MethodDecorator;
function OnWsError(): MethodDecorator;

interface SnailSseHandlers {
  open: Array<(event: Event) => void>;
  error: Array<(event: Event) => void>;
  events: Array<{ event: string; handler: (message: unknown) => void }>;
}

interface SnailWsHandlers {
  open: Array<(event: Event) => void>;
  message: Array<(event: MessageEvent) => void>;
  close: Array<(event: CloseEvent) => void>;
  error: Array<(event: Event) => void>;
}
```

### 自定义装饰器工厂

```ts
function createParamDecorator<O = void>(
  source: string,
  resolver?: SnailParamResolver
): (input?: ParamDecoratorInput<O>) => ParameterDecorator;

function createClassDecorator<T = unknown>(name: string, merge?: boolean): (value: T) => ClassDecorator;
function createMethodDecorator<T = unknown>(name: string, merge?: boolean): (value: T) => MethodDecorator;
function createPropertyDecorator<T = unknown>(name: string): (value: T) => PropertyDecorator;

function customMetadataKey(name: string): symbol;
function getClassMetadata<T>(name: string, target: unknown): T | undefined;
function getMethodMetadata<T>(name: string, target: unknown, methodName: string): T | undefined;
function getOwnMethodMetadata<T>(name: string, target: unknown, methodName: string): T | undefined;
```

## 错误类

```ts
class SnailError extends Error {
  readonly code: string;
  override readonly cause: unknown;
  static isSnailError(value: unknown): value is SnailError;
}

class SnailDecoratorError extends SnailError {}   // "SNAIL_DECORATOR_ERROR"
class SnailOptionsError extends SnailError {}     // "SNAIL_OPTIONS_ERROR"
class SnailHookError extends SnailError {         // "SNAIL_HOOK_ERROR"
  readonly hook: string;
}
class SnailPluginError extends SnailError {       // "SNAIL_PLUGIN_ERROR"
  readonly pluginName: string | undefined;
}
class SnailRequestError extends SnailError {}     // "SNAIL_REQUEST_ERROR"
class SnailTimeoutError extends SnailError {      // "SNAIL_TIMEOUT_ERROR"
  readonly timeout: number | undefined;
}
class SnailCancelledError extends SnailError {}   // "SNAIL_CANCELLED"
class SnailResponseError<T = unknown> extends SnailError {  // "SNAIL_RESPONSE_ERROR"
  readonly businessCode: number | string | undefined;
  readonly payload: T;
}
class SnailHttpError<T = unknown> extends SnailError {      // "SNAIL_HTTP_ERROR"
  readonly status: number | undefined;
  readonly statusText: string | undefined;
  readonly payload: T | undefined;
}
```

`SnailHttpError` 已导出但核心不会主动抛出（超时与取消会被翻译成各自的错误，其余 axios 错误
原样抛出）。详见[错误处理](/guide/errors)。

## 本地化

```ts
class Localization {
  constructor(language?: SnailLocaleInput);
  get locale(): SnailLanguage;
  setLocale(input: SnailLocaleInput): this;
  registerMessages(messages: SnailMessages): this;
  get messages(): SnailMessages;
  t(key: string, ...args: Array<string | number>): string;
}

const localization: Localization;

function t(key: string, ...args: Array<string | number>): string;
function setLocale(input: SnailLocaleInput): void;
function getLocale(): SnailLanguage;
function registerMessages(messages: SnailMessages): void;

const zh: SnailMessages;
const en: SnailMessages;
const languages: string[];                  // ["zh", "en"]

type SnailLanguage = "zh" | "en" | (string & {});
type SnailMessages = Record<string, string>;
type SnailLocaleInput = SnailLanguage | SnailMessages;
```

## 配置默认值

```ts
const DEFAULT_RESPONSE_KEYS: { code: "code"; message: "message"; data: "data" };
const DEFAULT_ACCEPTED_CODES: readonly number[];              // [0, 200]
const DEFAULT_API_OPTIONS: { url: ""; name: "" };
const DEFAULT_SERVER_OPTIONS: {
  name: "SNAIL_SERVER";    // 兜底常量；实际默认取被装饰的类名
  baseURL: "/";
  timeout: 10000;
  codeKey: "code";
  messageKey: "message";
  dataKey: "data";
  logLevel: "silent";
  coerceJSONString: true;
  stateAdapter: SnailStateAdapter;   // 默认 SnailAdapter
};
const LOG_LEVEL_WEIGHT: Record<SnailLogLevel, number>;        // silent 0 / error 1 / warn 2 / info 3 / debug 4
```

逐项说明见[服务端配置](/guide/configuration)。

## 工具函数

```ts
function buildRequestURL(baseURL: string, url: string): string;
function joinURL(...segments: Array<string | undefined | null>): string;
function isPlainObject(value: unknown): value is Record<string, any>;
function deepMerge<T extends Record<string, any>>(...sources: Array<Partial<T> | undefined | null>): T;
function shortHash(input: string): string;             // 32 位 FNV-1a，base36
function stableStringify(value: unknown): string;      // 键排序的确定性 JSON
```

从包根导出的下载工具（[策略 `useDownload`](/guide/strategies/use-download) 的底层一半）：

```ts
function triggerDownload(url: string, options?: TriggerDownloadOptions): TriggerDownloadResult;
function triggerBlobDownload(blob: Blob, options?: TriggerDownloadOptions): TriggerDownloadResult;
function filenameFromDisposition(header: string | undefined): string | undefined;

interface TriggerDownloadOptions {
  filename?: string;          // 跨域 href 会忽略它，请让服务端发 Content-Disposition
  openInNewTab?: boolean;     // 默认 false；打开时补 rel="noopener noreferrer"
  container?: HTMLElement;    // 默认 document.body
  referrerPolicy?: string;
}

interface TriggerDownloadResult {
  url: string;
  filename: string | undefined;
}
```

`triggerDownload()` 在没有 DOM 的运行时抛 `ReferenceError`（不是静默 no-op）；
`triggerBlobDownload()` 还会要求 `URL.createObjectURL`，并在**下一个宏任务**里撤销 object URL。详见
[在服务端运行](/guide/server-side)与 [`useDownload`](/guide/strategies/use-download)。

## 参数来源注册表

```ts
const paramResolvers: Record<string, SnailParamResolver>;

function registerParamResolver(source: string, resolver: SnailParamResolver): void;
function hasParamResolver(source: string): boolean;
function paramSources(): string[];                    // ["params", "query", "data", "header", ...]
```

## 类型

### 核心

```ts
interface SnailCodeErrorEvent {
  code: number | string | undefined;
  payload: unknown;
  error: unknown;
}

interface SnailMethodEventMap<S, T, D extends string, C extends string, M extends string> {
  success: SnailResult<S, T, D, C, M>;
  error: unknown;
  codeError: SnailCodeErrorEvent;
  finish: undefined;
  cache: undefined;
}

interface SnailMethodInit { /* server、pluginManager、axios、方法身份、描述符、requestConfig 工厂 */ }
interface SnailContextInit { /* 构造 SnailContext 所需的全部字段 */ }
interface RegisteredPlugin { name: string; priority: number; index: number; instance: SnailPluginObject<any>; }
type SnailHookKind = "config" | "chain" | "effect";
type SnailHookName = "install" | "uninstall" | "configureServer" | "configureApi" | "configureMethod"
  | "initMeta" | "beforeCreate" | "beforeRequest" | "requestInterceptor"
  | "afterResponse" | "responseInterceptor" | "onError" | "afterRequest";
type SnailNext = () => Promise<void>;
```

### 服务与请求

```ts
type SnailLogLevel = "silent" | "error" | "warn" | "info" | "debug";

interface SnailServerOptions { /* 见服务端配置 */ }
interface ResolvedServerOptions extends SnailServerOptions {
  name: string; baseURL: string; timeout: number;
  codeKey: string; messageKey: string; dataKey: string;
  logLevel: SnailLogLevel; coerceJSONString: boolean;
  stateAdapter: SnailStateAdapter;      // 默认 SnailAdapter
}

interface SnailApiOptions {
  url?: string; name?: string; timeout?: number;
  adapter?: AxiosRequestConfig["adapter"];
  responseType?: AxiosRequestConfig["responseType"];
  withCredentials?: boolean;
}

type SnailMethodType = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
type SnailMethodTypeLower = Lowercase<SnailMethodType>;

interface SnailMethodOptions extends Omit<AxiosRequestConfig, "url" | "method" | "params" | "data"> {
  params?: Record<string, any>;
  data?: unknown;
}
type SnailMethodDecoratorOptions = SnailMethodOptions;

interface SnailMethodMeta {
  serverName: string; apiName: string; methodName: string;
  fullName: string; method: SnailMethodType; url: string;
}

interface SnailSendOptions<TData = unknown> {
  data?: TData;
  query?: Record<string, any>;
  pathParams?: Record<string, any>;
  headers?: Record<string, any>;
  signal?: AbortSignal;
}
```

### 参数

```ts
type SnailBuiltinParamSource = "params" | "query" | "data" | "header";
type SnailParamSource = SnailBuiltinParamSource | (string & {});
type SnailParamRecord = Record<string, unknown>;

interface SnailParamResolverInput {
  ctx: SnailContext;
  value: unknown;
  key: string | undefined;
  options: unknown;
  index: number;
  methodName: string;
}
type SnailParamResolver = (input: SnailParamResolverInput) => void;

interface SnailParamDescriptor {
  readonly source: SnailParamSource;
  readonly index: number;
  readonly key?: string;
  readonly options?: unknown;
  readonly resolve: SnailParamResolver;
}
```

### 响应

```ts
interface SnailEnvelopeSchema { code: number; message: string; data: unknown; }
interface SnailResponseKeys { code: string; message: string; data: string; }

type SnailRawPayload = Blob | ArrayBuffer | ReadableStream<Uint8Array> | FormData | Document;
type IsRawPayload<T> = T extends SnailRawPayload ? true : false;
type SnailEnvelope<S, T, D extends string = "data"> =
  IsRawPayload<T> extends true ? T
  : S extends Record<string, any> ? S & Record<D, T>
  : Record<D, T>;

type SnailCodeOf<S, C extends string = "code"> = C extends keyof S ? S[C] : number | string | undefined;
type SnailMessageOf<S, M extends string = "message"> = M extends keyof S ? S[M] : string | undefined;

interface SnailResult<S = SnailEnvelopeSchema, T = unknown, D extends string = "data",
                     C extends string = "code", M extends string = "message"> {
  response: AxiosResponse<SnailEnvelope<S, T, D>>;
  envelope: SnailEnvelope<S, T, D>;
  data: T;
  code: SnailCodeOf<S, C>;
  message: SnailMessageOf<S, M>;
  fromCache: boolean;
  config: InternalAxiosRequestConfig;
}

type SnailCodeValidator = (code: number | string, envelope: unknown) => boolean;
type SnailSuccessCallback<S, T, D extends string = "data"> = (result: SnailResult<S, T, D, any, any>) => void;
type SnailErrorCallback = (error: unknown) => void;
type SnailCodeErrorCallback<T = unknown> = (code: number | string, payload: T, error: unknown) => void;
type SnailFinishCallback = () => void;
type SnailCacheHitCallback = () => void;

type SnailPayloadOf<R> = Awaited<R> extends void ? unknown : Awaited<R> extends undefined ? unknown : Awaited<R>;

type SnailApiProxy<TClass, S = SnailEnvelopeSchema, D extends string = "data",
                   C extends string = "code", M extends string = "message"> = {
  [K in keyof TClass]: TClass[K] extends (...args: infer A) => infer R
    ? <TData = SnailPayloadOf<R>>(...args: A) => SnailMethod<S, TData, D, C, M>
    : TClass[K];
};
```

### 流式传输

```ts
interface SnailReconnectPolicy {
  retries?: number;     // 默认 3
  delayMs?: number;     // 默认 1000
  maxDelayMs?: number;  // 默认 30000
  factor?: number;      // 默认 2
  jitter?: boolean;     // 默认 true
}

interface SnailSseOptions {
  method?: "GET" | "POST";
  withCredentials?: boolean;
  headers?: Record<string, string>;
  data?: unknown;
  reconnect?: false | SnailReconnectPolicy;
  events?: string[];
}

interface SnailSseMessage { event: string; data: string; id: string; retry: number | undefined; }

interface SnailWsOptions {
  protocols?: string | string[];
  reconnect?: false | SnailReconnectPolicy;
  serializer?: "json" | "text" | {
    serialize?: (value: unknown) => string | ArrayBufferLike | Blob | ArrayBufferView;
    deserialize?: (raw: string) => unknown;
  };
  queueWhileConnecting?: boolean;
}

interface SnailHttpStreamOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  decodeText?: boolean;      // 默认 true
  lineDelimited?: boolean;   // 默认 false
}

interface SnailConnection {
  close(): void;
  connected: boolean;
  readonly opened: Promise<void>;
  readonly closed: Promise<void>;
}

interface SnailSocketConnection extends SnailConnection {
  send(data: unknown): void;
}

interface SnailHttpStreamConnection extends SnailConnection {
  [Symbol.asyncIterator](): AsyncIterator<string>;
  text(): Promise<string>;
}

interface SnailSseEndpoint { open(): SnailConnection; }
interface SnailWsEndpoint { open(): SnailSocketConnection; }
```

### 状态适配器（供策略使用）

```ts
interface SnailStateRef<T = unknown> {
  value: T;                        // Vue 的 Ref<T> 在结构上就满足它
}

interface SnailStateAdapter {
  readonly name: string;           // 错误消息里用的标识，如 "vue"
  create<T>(initial: T): SnailStateRef<T>;
  read<T>(ref: SnailStateRef<T>): T;
  write<T>(ref: SnailStateRef<T>, value: T): void;
  subscribe?<T>(ref: SnailStateRef<T>, listener: (value: T) => void): () => void;
  useBind?<T>(ref: SnailStateRef<T>): T;
  isState?(value: unknown): boolean;
  dispose?<T>(ref: SnailStateRef<T>): void;
}

interface SnailStrategyCommonOptions {
  immediate?: boolean;             // 默认 false
  adapter?: SnailStateAdapter;     // 默认取所属 server 的 stateAdapter
  onSuccess?: (data: unknown) => void;
  onError?: (error: unknown) => void;
  onFinish?: () => void;
}
```

`SnailStateAdapter` 由 `@Server({ stateAdapter })` 选择，默认是 `SnailAdapter` —— 它从包根
`@snail-js/api` 导出，返回普通的 `{ value }` 盒子。`VueRef` / `ReactState` 分别在
`@snail-js/api/adapter/vue` 与 `@snail-js/api/adapter/react` 下，也是这两个子路径唯一会 import
框架的原因。详见[框架适配器](/guide/adapters)。

## 插件与策略导出

包根不导出任何插件或策略。它们在下面这些子路径下，映射来自 `packages/api/package.json` 的
`exports`。因为入口用 `import` 条件发布，它们都是 ESM-only。

| 子路径 | 内容 | 可选 peer |
| --- | --- | --- |
| `@snail-js/api` | 核心 + 装饰器 + `SnailAdapter` | `axios` |
| `@snail-js/api/plugins` | cache、interceptor、pool、transform、validate、version（含六个优先级常量） | `zod`（仅 validate） |
| `@snail-js/api/strategies` | 全部策略，不 import 任何框架 | — |
| `@snail-js/api/adapter/vue` | `VueRef` | `vue` |
| `@snail-js/api/adapter/react` | `ReactState`、`useMethodState`、`ReactMethodState` | `react` |
| `@snail-js/api/package.json` | `package.json` | — |

### `@snail-js/api/plugins` —— 缓存

```ts
function Cache(options?: CacheOptions): CachePlugin;

function Cacheable(options?: CacheableOptions): ClassDecorator & MethodDecorator;
function NoCache(): ClassDecorator & MethodDecorator;
function Invalidates(...tags: string[]): ClassDecorator & MethodDecorator;
/** @deprecated 旧名，等于 @Invalidates(name)。 */
function HitSource(name: string): ClassDecorator & MethodDecorator;

function readCacheable(target: unknown, methodName?: string): CacheableOptions | undefined;
function readNoCache(target: unknown, methodName?: string): boolean;
function readInvalidates(target: unknown, methodName?: string): string[];

function buildCacheKey(input: CacheKeyInput): string;
function makeCachedResponse<T>(body: T, config: InternalAxiosRequestConfig): AxiosResponse<T>;

const CACHE_PLUGIN_NAME: string;   // "cache"
const CACHE_PRIORITY: number;      // -100
const DEFAULT_L1_MAX_SIZE: number; // 100

class CacheManager {
  constructor(options?: CacheManagerOptions);

  readonly options: ResolvedCacheOptions;
  get size(): number;                        // 只数 L1

  get<T = unknown>(key: string): Promise<T | undefined>;
  has(key: string): Promise<boolean>;
  lookup<T = unknown>(key: string, allowStale?: boolean): Promise<CacheLookup<T> | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number, tags?: readonly string[]): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  invalidateTags(tags: readonly string[]): Promise<void>;
  invalidateAll(): Promise<void>;

  getInFlight(key: string): Promise<unknown> | undefined;
  setInFlight(key: string, promise: Promise<unknown>): void;
}

class MemoryCacheAdapter implements CacheAdapter {
  constructor(options?: MemoryCacheAdapterOptions);
  readonly size: number;
  has(key: string): Promise<boolean>;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

class WebStorageCacheAdapter implements CacheAdapter {
  constructor(resolveStorage: () => Storage | undefined, options?: WebStorageCacheAdapterOptions);
  readonly label: string;
  readonly available: boolean;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

class IndexedDBCacheAdapter implements CacheAdapter {
  constructor(options?: IndexedDBCacheAdapterOptions);
  readonly available: boolean;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
```

```ts
interface CacheOptions {
  ttl?: number;                    // 默认 60
  maxSize?: number;                // 默认 100
  l1?: boolean;                    // 默认 true
  l2?: "localStorage" | "sessionStorage" | "indexedDB" | CacheAdapter;
  cacheFor?: "all" | SnailMethodType | SnailMethodType[];   // 默认 ["GET"]
  prefix?: string;                 // 默认 server 名
  staleWhileRevalidate?: boolean;  // 默认 false
  dedupe?: boolean;                // 默认 true
}

interface CacheableOptions {
  ttl?: number;
  tags?: readonly string[];
  key?: string;
}

interface CacheLookup<T = unknown> {
  value: T;
  stale: boolean;
}

interface CacheAdapter {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys?(): Promise<string[]>;
}

interface CacheKeyInput {
  prefix: string;
  request: InternalAxiosRequestConfig;
  methodType: SnailMethodType;
  explicitKey?: string;
}

interface CacheManagerOptions extends CacheOptions { logger?: SnailLogger; }

interface ResolvedCacheOptions {
  ttl: number; maxSize: number; l1: boolean;
  l2: CacheAdapter | undefined;
  cacheFor: "all" | readonly SnailMethodType[];
  prefix: string; staleWhileRevalidate: boolean; dedupe: boolean;
}

interface CachePlugin extends SnailPluginObject<CacheOptions> {
  readonly manager: CacheManager | undefined;
}

interface MemoryCacheAdapterOptions { maxSize?: number; onEvict?: (key: string) => void; }
interface WebStorageCacheAdapterOptions { prefix?: string; label?: string; }
interface IndexedDBCacheAdapterOptions { databaseName?: string; storeName?: string; version?: number; }
```

详见[缓存插件](/guide/plugin-cache)。

### `@snail-js/api/plugins` —— 拦截器

```ts
function Interceptor(options?: InterceptorOptions): InterceptorPlugin;

function BeforeRequest<T = InternalAxiosRequestConfig>(
  onFulfilled: (value: T, ctx: SnailContext) => T | void | Promise<T | void>,
  onRejected?: (error: unknown, ctx: SnailContext) => unknown
): ClassDecorator & MethodDecorator;

function AfterResponse<T = AxiosResponse>(
  onFulfilled: (value: T, ctx: SnailContext) => T | void | Promise<T | void>,
  onRejected?: (error: unknown, ctx: SnailContext) => unknown
): ClassDecorator & MethodDecorator;

function classBeforeEntries(target: unknown): InterceptorEntry[];
function methodBeforeEntries(target: unknown, methodName: string): InterceptorEntry[];
function classAfterEntries(target: unknown): InterceptorEntry[];
function methodAfterEntries(target: unknown, methodName: string): InterceptorEntry[];

const INTERCEPTOR_PLUGIN_NAME: string;   // "interceptor"
const INTERCEPTOR_PRIORITY: number;      // 100

class InterceptorManager<T = unknown> {
  use(entry: InterceptorEntry<T>): number;
  eject(id: number): boolean;
  clear(): void;
  readonly entries: InterceptorEntry<T>[];
  readonly size: number;
}
```

```ts
interface InterceptorEntry<T = unknown> {
  onFulfilled?: (value: T, ctx: SnailContext) => T | void | Promise<T | void>;
  onRejected?: (error: unknown, ctx: SnailContext) => unknown;
}

type RequestInterceptorEntry = InterceptorEntry<InternalAxiosRequestConfig>;
type ResponseInterceptorEntry = InterceptorEntry<AxiosResponse>;

interface InterceptorOptions {
  request?: InterceptorEntry<InternalAxiosRequestConfig>[];
  response?: InterceptorEntry<AxiosResponse>[];
}

interface InterceptorPlugin extends SnailPluginObject<InterceptorOptions> {
  readonly request: InterceptorManager<InternalAxiosRequestConfig>;
  readonly response: InterceptorManager<AxiosResponse>;
}
```

详见[拦截器插件](/guide/plugin-interceptor)。

### `@snail-js/api/plugins` —— 版本

```ts
const Versioning: SnailPlugin<VersioningOptions>;
function Version(version: string): ClassDecorator & MethodDecorator;
```

```ts
type VersioningType = "url" | "header" | "query" | "custom";

interface VersioningOptions {
  type: VersioningType;
  defaultVersion: string;              // 必填；缺失会在 setup 时抛 SnailPluginError
  key?: string;                        // url/query 默认 "v"，header 默认 "x-api-version"
  extractor?: (version: string, ctx: SnailContext) => VersioningPatch | void;  // 仅 custom
}

interface VersioningPatch {
  url?: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
}
```

详见[版本插件](/guide/plugin-versioning)。

### `@snail-js/api/plugins` —— 校验

```ts
/** 传 zod schema 是装饰器；传选项（或什么都不传）是插件。 */
function Validate(schema: ZodType): ClassDecorator & MethodDecorator;
function Validate(options?: ValidateOptions): SnailPluginObject<ValidateOptions>;

function ValidateResponse(schema: ZodType): ClassDecorator & MethodDecorator;

class SnailValidationError extends SnailError {   // "SNAIL_VALIDATION_ERROR"
  readonly issues: readonly SnailValidationIssue[];
}
```

```ts
type SnailValidationIssue = core.$ZodIssue;   // zod 的 issues，原样保留

interface ValidateOptions {
  request?: ZodType;
  response?: ZodType;
  strict?: boolean;   // 默认 true；false 把请求失败降级为警告
}
```

详见[校验插件](/guide/plugin-validate)。

### `@snail-js/api/plugins` —— 转换

```ts
/** 传 DTO 类是装饰器；传选项（或什么都不传）是插件。 */
function Transform(dto: DtoType): ClassDecorator & MethodDecorator;
function Transform(options?: TransformOptions): SnailPluginObject<TransformOptions>;

function PropertyType(type: () => unknown, options?: PropertyTypeOptions): PropertyDecorator;
function ExposeName(jsonKey: string): PropertyDecorator;

function hydrate<T>(raw: unknown, DtoClass: DtoType<T>, options?: HydrateOptions): T;
```

```ts
type DtoType<T = unknown> = (new () => T) & {
  fromJSON?: (raw: unknown, ctx?: SnailContext) => T;
};

interface PropertyTypeOptions { array?: boolean; }
interface PropertyTypeSpec { type: () => unknown; options?: PropertyTypeOptions; }

interface TransformOptions {
  dto?: DtoType;
  keepUnknown?: boolean;   // 默认 false
  maxDepth?: number;       // 默认 32
}

interface HydrateOptions {
  keepUnknown?: boolean;
  maxDepth?: number;
  ctx?: SnailContext;
}
```

详见[转换插件](/guide/plugin-transform)。

### `@snail-js/api/plugins` —— 请求池

```ts
function RequestPool(options?: RequestPoolOptions): RequestPoolPlugin;

const POOL_PLUGIN_NAME: string;   // "pool"
const POOL_PRIORITY: number;      // -150

function poolStats(plugin: RequestPoolPlugin): RequestPoolStats | undefined;
function clearPool(plugin: RequestPoolPlugin, reason?: unknown): void;
function isPoolError(error: unknown): error is SnailPoolError;

class SnailPoolError extends SnailError {
  readonly code: PoolErrorCode;
}

const POOL_ERROR_CODES: {
  queueFull: "SNAIL_POOL_QUEUE_FULL";
  queueTimeout: "SNAIL_POOL_QUEUE_TIMEOUT";
  aborted: "SNAIL_POOL_ABORTED";
  cleared: "SNAIL_POOL_CLEARED";
};
type PoolErrorCode = (typeof POOL_ERROR_CODES)[keyof typeof POOL_ERROR_CODES];
```

```ts
interface RequestPoolOptions {
  concurrency?: number;                 // 默认 6
  maxQueue?: number;                    // 默认 Infinity
  queueTimeout?: number;                // 默认 0（不限时）
  priority?: (ctx: unknown) => number;  // 默认 0；越小越先跑
}

interface RequestPoolStats {
  active: number;
  queued: number;
  concurrency: number;
}

interface PoolTicket {
  readonly release: () => void;         // 幂等
}

interface RequestPoolPlugin {
  readonly name: string;
  readonly priority: number;
  readonly scheduler: RequestPoolScheduler | undefined;   // install 之后才存在
}

class RequestPoolScheduler {
  constructor(options?: RequestPoolOptions);
  get stats(): RequestPoolStats;
  setConcurrency(value: number): void;
  acquire(ctx: unknown, signal?: AbortLike): Promise<PoolTicket>;
  clear(reason?: unknown): void;
}

interface AbortLike {
  readonly aborted: boolean;
  addEventListener?(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener?(type: "abort", listener: () => void): void;
}
```

详见[请求池插件](/guide/plugin-pool)。

### `@snail-js/api/adapter/vue`、`@snail-js/api/adapter/react`

状态适配器不是插件：它们是 `@Server({ stateAdapter })` 的取值。两个子路径是**仅有的**会 import
`vue` / `react` 的模块，所以不 import 它们就不会打包框架。

```ts
// @snail-js/api（包根）—— 默认适配器
const SnailAdapter: SnailStateAdapter;   // name: "plain"，create 返回 { value }

// @snail-js/api/adapter/vue
const VueRef: SnailStateAdapter;         // name: "vue"，create 返回 Vue 的 ref()

// @snail-js/api/adapter/react
const ReactState: SnailStateAdapter;     // name: "react"，create 返回可订阅盒子

function useMethodState<TData = unknown>(
  method: SnailMethod<any, TData, any, any, any>
): ReactMethodState<TData>;

interface ReactMethodState<TData = unknown> {
  data: TData | undefined;
  loading: boolean;
  error: unknown;
  code: unknown;
  message: unknown;
}
```

`ReactState.subscribe(handle, listener)` 可以在渲染之外直接订阅；`useMethodState` 只能渲染期间
调用，它按固定顺序绑定五个句柄。详见[框架适配器](/guide/adapters)。

### 优先级常量

六个插件常量从 `@snail-js/api/plugins` 导出，`TOKEN_AUTH_PRIORITY` 从
`@snail-js/api/strategies` 导出。`priority` 是无上界的数字，这些常量只是参考档位：

```ts
// @snail-js/api/plugins
const INTERCEPTOR_PRIORITY: number;   // 100
const VERSIONING_PRIORITY: number;    //  50
const TRANSFORM_PRIORITY: number;     //   0
const VALIDATE_PRIORITY: number;      // -50
const CACHE_PRIORITY: number;         // -100
const POOL_PRIORITY: number;          // -150

// @snail-js/api/strategies
const TOKEN_AUTH_PRIORITY: number;    //  20（useTokenAuth 返回的插件）
```

要让自己的插件紧挨着某个内置插件，用 `CACHE_PRIORITY + 1` 这样的相对定位，而不是硬编码一个
数字。详见[插件生命周期](/guide/plugin-lifecycle)§2.1。

### `@snail-js/api/strategies`

唯一的策略入口，**不 import 任何框架**：框架由 `@Server({ stateAdapter })` 决定，每个 hook 从它
拿到的 method 上读该选项。详见[策略概览](/guide/strategies)与[框架适配器](/guide/adapters)。

```ts
function createStrategyState<TData>(
  options?: StrategyStateOptions<TData>
): StrategyStateController<TData>;

function useRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseRequestOptions<TData>
): UseRequestResult<TData, TArgs>;

function useWatcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseWatcherOptions<TData>
): UseWatcherResult<TData, TArgs>;

function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options: UseFetcherStateOptions<TData>
): UseFetcherResult<TData, TArgs>;
function useFetcher<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseFetcherOptions<TData>
): UseFetcherCore<TData, TArgs>;

function usePagination<TData>(
  method: StrategyMethod<[PageRequest], TData>,
  options?: UsePaginationOptions<TData>
): UsePaginationResult<TData>;

function useAutoRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseAutoRequestOptions<TData>
): UseAutoRequestResult<TData, TArgs>;

function useRetriableRequest<TArgs extends readonly unknown[], TData>(
  method: StrategyMethod<TArgs, TData>,
  options?: UseRetriableRequestOptions<TData>
): UseRetriableRequestResult<TData, TArgs>;

function useUploader<TData>(
  method: StrategyMethod<[FormData], TData>,
  options?: UseUploaderOptions<TData>
): UseUploaderResult<TData>;

function useTokenAuth(options: TokenAuthOptions): TokenAuthHandle;
function useSSE(endpoint: SseEndpoint, options?: UseSseOptions): UseSseResult;

function useDownload<TArgs extends readonly unknown[], TPayload>(
  method: StrategyMethod<TArgs, TPayload>,
  options?: UseDownloadOptions<TPayload>
): UseDownloadResult<TPayload>;
```

```ts
type StrategyMethod<TArgs extends readonly unknown[] = readonly unknown[], TData = unknown> =
  (...args: TArgs) => SnailMethod<any, TData, any, any, any>;
type SnailRequest<TData = unknown> = SnailMethod<any, TData, any, any, any>;

interface MethodHolder<TData = unknown> {
  readonly instance: SnailRequest<TData> | undefined;
  readonly pending: boolean;
  resolve(args: readonly unknown[]): SnailRequest<TData>;
  abort(): void;
}

interface StrategyState<TData> {
  readonly loading: SnailStateRef<boolean>;
  readonly data: SnailStateRef<TData | undefined>;
  readonly error: SnailStateRef<unknown>;
  readonly code: SnailStateRef<number | string | undefined>;
  readonly message: SnailStateRef<string | undefined>;
  abort(): void;
  update(patch: StrategyStatePatch<TData>): void;
  bind(): StrategyBoundState<TData>;
  onSuccess(callback: (data: TData) => void): () => void;
  onError(callback: (error: unknown) => void): () => void;
  onFinish(callback: () => void): () => void;
}

interface StrategyStatePatch<TData> {
  data?: TData; loading?: boolean; error?: unknown;
  code?: number | string; message?: string;
}

interface StrategyBoundState<TData> {
  loading: boolean; data: TData | undefined; error: unknown;
  code: number | string | undefined; message: string | undefined;
}

interface StrategyStateOptions<TData> {
  adapter?: SnailStateAdapter;
  initialData?: TData;
  onAbort?: () => void;
}

interface StrategyStateController<TData> {
  readonly adapter: SnailStateAdapter;
  readonly state: StrategyState<TData>;
  setLoading(value: boolean): void;
  setData(value: TData | undefined): void;
  setError(value: unknown): void;
  setCode(value: number | string | undefined): void;
  setMessage(value: string | undefined): void;
  resetForSend(): void;
  applySuccess(result: { data: TData; code?: number | string; message?: string }): TData;
  applyFailure(error: unknown): void;
  emitSuccess(data: TData): void;
  emitError(error: unknown): void;
  emitFinish(): void;
  dispose(): void;
}

interface UseRequestOptions<TData> extends SnailStrategyCommonOptions {
  initialData?: TData;
  resetOnSend?: boolean;
}

interface UseRequestResult<TData, TArgs extends readonly unknown[] = readonly unknown[]>
  extends StrategyState<TData> {
  send(...args: TArgs): Promise<TData>;
}

interface UseWatcherOptions<TData> extends UseRequestOptions<TData> {
  watching: () => readonly unknown[];
  debounce?: number;
  throttle?: number;
}

interface UseWatcherResult<TData, TArgs extends readonly unknown[] = readonly unknown[]>
  extends UseRequestResult<TData, TArgs> {
  readonly watching: SnailStateRef<boolean>;
}

interface UseFetcherOptions<TData> extends SnailStrategyCommonOptions {
  withState?: boolean;   // 默认 false
}

type UseFetcherStateOptions<TData> = UseFetcherOptions<TData> & { withState: true };

interface UseFetcherCore<TData, TArgs extends readonly unknown[] = readonly unknown[]> {
  fetch(...args: TArgs): Promise<TData>;
  abort(): void;
  onSuccess(callback: (data: TData) => void): () => void;
  onError(callback: (error: unknown) => void): () => void;
  onFinish(callback: () => void): () => void;
}

interface UseFetcherResult<TData, TArgs extends readonly unknown[] = readonly unknown[]>
  extends UseFetcherCore<TData, TArgs>, StrategyState<TData> {}

interface PageRequest { page: number; pageSize: number; }

interface UsePaginationOptions<TData> extends SnailStrategyCommonOptions {
  initialPage?: number;         // 默认 1
  initialPageSize?: number;     // 默认 10
  total?: (payload: TData) => number;
  list?: (payload: TData) => unknown[];
  append?: boolean;             // 默认 false
  preloadNext?: boolean;        // 默认 false
}

interface UsePaginationResult<TData> extends StrategyState<TData> {
  readonly page: SnailStateRef<number>;
  readonly pageSize: SnailStateRef<number>;
  readonly total: SnailStateRef<number>;
  readonly list: SnailStateRef<unknown[]>;
  readonly isLastPage: SnailStateRef<boolean>;
  next(): Promise<TData | undefined>;
  prev(): Promise<TData | undefined>;
  goTo(page: number): Promise<TData | undefined>;
  reload(): Promise<TData | undefined>;
  changePageSize(pageSize: number): Promise<TData | undefined>;
}

interface UseAutoRequestOptions<TData> extends UseRequestOptions<TData> {
  pollingInterval?: number;
  enableFocusRefresh?: boolean;
  enableReconnectRefresh?: boolean;
  refreshOnVisible?: boolean;
}

interface UseAutoRequestResult<TData, TArgs extends readonly unknown[] = readonly unknown[]>
  extends UseRequestResult<TData, TArgs> {
  readonly running: SnailStateRef<boolean>;
  start(): void;
  stop(): void;
  refresh(): Promise<TData>;
  dispose(): void;
}

interface UseRetriableRequestOptions<TData> extends UseRequestOptions<TData>, RetryOptions {
  retryOn?: (error: unknown, attempt: number) => boolean;
}

interface RetryOptions {
  retries?: number;      // 默认 3
  delayMs?: number;      // 默认 1000
  maxDelayMs?: number;   // 默认 30000
  factor?: number;       // 默认 2
  jitter?: boolean;      // 默认 true
}

interface UseRetriableRequestResult<TData, TArgs extends readonly unknown[] = readonly unknown[]>
  extends StrategyState<TData> {
  send(...args: TArgs): Promise<TData>;
  readonly attempts: SnailStateRef<number>;
}

type UploadFileStatus = "pending" | "uploading" | "success" | "error";

interface UploadFileState {
  readonly id: string;
  readonly file: File;
  readonly status: UploadFileStatus;
  readonly progress: number;
  readonly error: unknown;
  readonly response: unknown;
}

interface UploaderProgress { progress: number; files: readonly UploadFileState[]; }

interface UseUploaderOptions<TData> extends SnailStrategyCommonOptions {
  concurrency?: number;   // 默认 3
  multiple?: boolean;     // 默认 true
  onProgress?: (state: UploaderProgress) => void;
  fieldName?: string;     // 默认 "file"
}

interface UseUploaderResult<TData> extends StrategyState<TData> {
  upload(files: File | File[] | FileList | null | undefined): Promise<void>;
  readonly files: SnailStateRef<UploadFileState[]>;
  readonly progress: SnailStateRef<number>;
  retry(id: string): void;
}

interface TokenAuthOptions {
  token: () => string | null | undefined | Promise<string | null | undefined>;
  refresh: () => Promise<string>;
  header?: string;              // 默认 "authorization"
  scheme?: string;              // 默认 "Bearer"；传 "" 得到裸 token
  onUnauthorized?: (error: unknown) => void;
}

interface TokenAuthHandle {
  readonly plugin: SnailPluginObject<TokenAuthOptions>;   // name "token-auth"，priority 20
  setToken(token: string | null | undefined): void;
  getToken(): string | undefined;
  clearToken(): void;
}

interface SseEndpoint extends SnailSseEndpoint {
  subscribe?(listener: (message: SnailSseMessage) => void): () => void;
}

interface SseConnectionTap {
  onMessage?(listener: (message: SnailSseMessage) => void): () => void;
}

interface UseSseOptions {
  adapter?: SnailStateAdapter;
  immediate?: boolean;      // 默认 false
  maxMessages?: number;     // 默认 100
  filter?: (message: SnailSseMessage) => boolean;
  onMessage?: (message: SnailSseMessage) => void;
}

interface UseSseResult {
  readonly messages: SnailStateRef<SnailSseMessage[]>;
  readonly lastMessage: SnailStateRef<SnailSseMessage | undefined>;
  readonly connected: SnailStateRef<boolean>;
  readonly error: SnailStateRef<unknown>;
  open(): void;
  close(): void;
  clear(): void;
  bind(): {
    messages: SnailSseMessage[];
    lastMessage: SnailSseMessage | undefined;
    connected: boolean;
    error: unknown;
  };
}

interface DownloadDescriptor {
  url: string;
  filename?: string;
}

interface UseDownloadOptions<TPayload> extends SnailStrategyCommonOptions {
  pick?: (payload: TPayload) => DownloadDescriptor;
  autoTrigger?: boolean;      // 默认 true
  openInNewTab?: boolean;     // 默认 false
  filename?: string;          // 优先于 pick 产出的名字
  container?: HTMLElement;
  referrerPolicy?: string;
}

interface UseDownloadResult<TPayload> extends StrategyState<TPayload> {
  download(...args: readonly unknown[]): Promise<TriggerDownloadResult>;
  readonly info: SnailStateRef<DownloadDescriptor | undefined>;
  onDownload(callback: (info: DownloadDescriptor) => void): () => void;
}
```

每个 hook 的行为、边界与陷阱见[策略概览](/guide/strategies)（每个 hook 一页：
[`useRequest`](/guide/strategies/use-request)、[`useWatcher`](/guide/strategies/use-watcher)、
[`useFetcher`](/guide/strategies/use-fetcher)、[`usePagination`](/guide/strategies/use-pagination)、
[`useAutoRequest`](/guide/strategies/use-auto-request)、
[`useRetriableRequest`](/guide/strategies/use-retriable-request)、
[`useUploader`](/guide/strategies/use-uploader)、
[`useTokenAuth`](/guide/strategies/use-token-auth)、[`useSSE`](/guide/strategies/use-sse)、
[`useDownload`](/guide/strategies/use-download)）。
