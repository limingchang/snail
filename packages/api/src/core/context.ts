import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailLogger } from "./logger";
import type { SnailServer } from "./server";
import { StateBag } from "./state-bag";
import type { SnailApiOptions, SnailMethodType } from "../typings/api";
import type { SnailParamDescriptor } from "../typings/args";
import type { SnailResult } from "../typings/response";
import type { ResolvedServerOptions } from "../typings/server";

/**
 * 构造请求上下文所需的全部信息。
 *
 * Everything needed to construct a request context.
 */
export interface SnailContextInit {
  /**
   * 拥有本次请求的服务器实例。
   *
   * The server instance that owns this request.
   */
  server: SnailServer<any, any, any, any>;
  /**
   * 已完全解析的服务器选项。
   *
   * Fully resolved server options.
   */
  serverOptions: ResolvedServerOptions;
  /**
   * 被装饰的 api 类（构造函数）。
   *
   * The decorated api class (constructor).
   */
  apiClass: new () => unknown;
  /**
   * 实例化后的 api 对象。
   *
   * The instantiated api class.
   */
  api: unknown;
  /**
   * 解析后的 api 名称 —— `@Api({ name })` 或类名。
   *
   * Resolved api name — `@Api({ name })` or the class name.
   */
  apiName: string;
  /**
   * 已完全解析的 api 选项。
   *
   * Fully resolved api options.
   */
  apiOptions: Required<SnailApiOptions>;
  /**
   * 被装饰的方法名，例如 `"getUser"`。
   *
   * Decorated method name, e.g. `"getUser"`.
   */
  methodName: string;
  /**
   * 请求动词。
   *
   * Request verb.
   */
  methodType: SnailMethodType;
  /**
   * 本方法的 url 模板，即 api 前缀与方法路径的拼接结果，**尚未**做
   * `:placeholder` 替换。
   *
   * Url template for this method — api prefix joined with the method path,
   * **before** `:placeholder` substitution.
   */
  route: string;
  /**
   * 请求开始时的 axios 配置。
   *
   * The axios config the request starts from.
   */
  request: InternalAxiosRequestConfig;
  /**
   * 参数装饰器捕获的参数描述符。
   *
   * Parameter descriptors captured by the argument decorators.
   */
  descriptors: readonly SnailParamDescriptor[];
  /**
   * 输出诊断信息的 logger。
   *
   * Logger used for diagnostics.
   */
  logger: SnailLogger;
}

/**
 * 每次请求的上下文 —— 所有插件钩子收到的唯一对象。
 *
 * 每次 `send()` 调用各自拥有一个上下文，因此插件可以放心地把数据存进 `ctx.state`，
 * 不必担心并发请求互相干扰。这是对重写前设计的刻意修正：当时“事件表”和请求配置
 * 都挂在长生命周期的 `SnailMethod` 实例上，两个重叠的 `send()` 调用会共享可变状态。
 *
 * Per-request context — the single object every plugin hook receives.
 *
 * One context exists per `send()` call, so plugins may store freely in
 * `ctx.state` without worrying about concurrent requests colliding. That is a
 * deliberate fix over the pre-rewrite design, where the "event map" and the
 * request config lived on the long-lived `SnailMethod` instance and two
 * overlapping `send()` calls shared mutable state.
 */
export class SnailContext {
  /**
   * 拥有本次请求的服务器实例。
   *
   * The server instance that owns this request.
   */
  readonly server: SnailServer<any, any, any, any>;

  /**
   * 已完全解析的服务器选项。
   *
   * Fully resolved server options.
   */
  readonly serverOptions: ResolvedServerOptions;

  /**
   * 被装饰的 api 类（构造函数）。
   *
   * The decorated api class (constructor).
   */
  readonly apiClass: new () => unknown;

  /**
   * 实例化后的 api 对象。
   *
   * The instantiated api class.
   */
  readonly api: unknown;

  /**
   * 解析后的 api 名称 —— `@Api({ name })` 或类名。
   *
   * Resolved api name — `@Api({ name })` or the class name.
   */
  readonly apiName: string;

  /**
   * 已完全解析的 api 选项。
   *
   * Fully resolved api options.
   */
  readonly apiOptions: Required<SnailApiOptions>;

  /**
   * 被装饰的方法名，例如 `"getUser"`。
   *
   * Decorated method name, e.g. `"getUser"`.
   */
  readonly methodName: string;

  /**
   * 请求动词。
   *
   * Request verb.
   */
  readonly methodType: SnailMethodType;

  /**
   * 本方法的 url 模板 —— api 前缀与方法路径拼接而成，处于 `:placeholder`
   * 替换**之前**。
   *
   * Url template for this method — api prefix joined with the method path,
   * **before** `:placeholder` substitution.
   */
  readonly route: string;

  /**
   * `server.api.method`，用于日志和错误信息。
   *
   * `server.api.method`, used in logs and error messages.
   */
  readonly fullName: string;

  /**
   * 按 `@Server({ logLevel })` 配置的分级 logger。
   *
   * Level-gated logger configured from `@Server({ logLevel })`.
   */
  readonly logger: SnailLogger;

  /**
   * 参数装饰器捕获的参数描述符。
   *
   * Parameter descriptors captured by the argument decorators.
   */
  readonly descriptors: readonly SnailParamDescriptor[];

  /**
   * 插件暂存区，调用方不可见。
   *
   * Plugin scratch space. Not visible to the caller.
   */
  readonly state = new StateBag();

  /**
   * 调用方可见的响应式值。
   *
   * 核心会用服务器的 `stateAdapter` 填充五个标准句柄；插件可以通过 `initMeta`
   * 追加自己的句柄。
   *
   * Caller-visible reactive values.
   *
   * Core fills the five standard handles from the server's `stateAdapter`; plugins
   * may add their own through `initMeta`.
   */
  meta: Record<string, unknown> = {};

  /**
   * 实时的 axios 请求配置。
   *
   * 插件和参数装饰器会就地改写这个对象；整体替换同样受支持，这正是
   * `ctx.request = ...` 的含义。
   *
   * The live axios request config.
   *
   * Plugins and argument decorators mutate this object in place; replacing it
   * wholesale is also supported and is what `ctx.request = ...` means.
   */
  request: InternalAxiosRequestConfig;

  /**
   * 从 `@Params()` 收集、用于 `:placeholder` 替换的值。
   *
   * Values gathered from `@Params()` for `:placeholder` substitution.
   */
  pathParams: Record<string, unknown> = {};

  /**
   * 一旦存在响应就会被赋值 —— 无论响应来自网络**还是**缓存。
   *
   * Set once a response exists — from the network **or** from a cache.
   */
  response: AxiosResponse | undefined;

  /**
   * 请求失败时赋值。
   *
   * Set when the request failed.
   */
  error: unknown;

  /**
   * 信封通过校验后赋值。
   *
   * Set once the envelope passed validation.
   */
  result: SnailResult<any, any, any, any, any> | undefined;

  /**
   * `send()` 开始的时间戳。
   *
   * Timestamp when `send()` started.
   */
  startedAt: number = Date.now();

  /**
   * 请求结束时的时间戳。
   *
   * Timestamp when the request settled.
   */
  finishedAt: number | undefined;

  private interrupted = false;
  private cacheHit = false;

  /**
   * 根据初始化描述构造一个上下文。
   *
   * Build a context from its init description.
   *
   * @param init 各字段均已确定值的初始化描述 / Init description with every field resolved.
   */
  constructor(init: SnailContextInit) {
    this.server = init.server;
    this.serverOptions = init.serverOptions;
    this.apiClass = init.apiClass;
    this.api = init.api;
    this.apiName = init.apiName;
    this.apiOptions = init.apiOptions;
    this.methodName = init.methodName;
    this.methodType = init.methodType;
    this.route = init.route;
    this.fullName = `${init.serverOptions.name}.${init.apiName}.${init.methodName}`;
    this.request = init.request;
    this.descriptors = init.descriptors;
    this.logger = init.logger;
  }

  /**
   * 自 `send()` 开始以来经过的毫秒数。
   *
   * Milliseconds elapsed since `send()` started.
   */
  get elapsed(): number {
    return (this.finishedAt ?? Date.now()) - this.startedAt;
  }

  /**
   * 中止请求。
   *
   * 传入 `response` 时会完全跳过网络调用，直接采用该响应 —— 缓存命中正是这样实现的；
   * 不传则请求被放弃，`send()` 以取消错误 reject。
   *
   * Stop the request.
   *
   * With a `response` argument the network call is skipped entirely and that
   * response is used instead — this is exactly how a cache hit works. Without
   * one, the request is abandoned and `send()` rejects with a cancellation error.
   *
   * @param response 可选的替代响应，提供时跳过网络调用 /
   *   Optional replacement response; when given, the network call is skipped.
   */
  interrupt(response?: AxiosResponse): void {
    this.interrupted = true;
    if (response) this.response = response;
  }

  /**
   * 某个插件已提前结束本次请求时为 `true`。
   *
   * `true` when a plugin short-circuited the request.
   */
  get isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * 记录当前响应来自缓存。
   *
   * Record that the current response came from a cache.
   */
  markCacheHit(): void {
    this.cacheHit = true;
  }

  /**
   * 响应由缓存提供时为 `true`。
   *
   * `true` when the response was served from a cache.
   */
  get isCacheHit(): boolean {
    return this.cacheHit;
  }

  /**
   * 替换当前响应。
   *
   * Replace the current response.
   *
   * @param response 新的响应，或 `undefined` 表示清空 /
   *   The new response, or `undefined` to clear it.
   */
  setResponse(response: AxiosResponse | undefined): void {
    this.response = response;
  }

  /**
   * 读取当前响应。
   *
   * Read the current response.
   *
   * @returns 当前响应，尚未产生时为 `undefined` /
   *   The current response, or `undefined` when there is none yet.
   */
  getResponse(): AxiosResponse | undefined {
    return this.response;
  }

  /**
   * 读取当前响应，不存在时抛错。
   *
   * Read the current response, throwing when there is none.
   *
   * @returns 当前响应 / The current response.
   * @throws 尚无响应时抛出 `ReferenceError` /
   *   `ReferenceError` when no response exists yet.
   */
  requireResponse(): AxiosResponse {
    if (!this.response) {
      throw new ReferenceError(`[snail] ${this.fullName} has no response at this point`);
    }
    return this.response;
  }

  /**
   * 替换请求配置。
   *
   * Replace the request config.
   *
   * @param request 新的请求配置 / The new request config.
   */
  setRequest(request: InternalAxiosRequestConfig): void {
    this.request = request;
    this.request.url = this.request.url ?? this.route;
  }

  /**
   * 读取请求配置。
   *
   * Read the request config.
   *
   * @returns 当前的 axios 请求配置 / The current axios request config.
   */
  getRequest(): InternalAxiosRequestConfig {
    return this.request;
  }

  /**
   * 替换解析结果。
   *
   * Replace the parsed result.
   *
   * @param result 新的解析结果 / The new parsed result.
   */
  setResult(result: SnailResult<any, any, any, any, any>): void {
    this.result = result;
  }

  /**
   * 清空属于某一次 `send()` 的全部内容，但保留上下文本身，使 `meta`（也就是
   * 调用方的响应式句柄）在重新发送后依然可用。
   *
   * Clear everything that belongs to one `send()` while keeping the context
   * identity, so `meta` — and therefore the caller's reactive handles — survive
   * a re-send.
   *
   * @param request 下一次发送所用的请求配置 / Request config for the next send.
   */
  reset(request: InternalAxiosRequestConfig): void {
    this.state.clear();
    this.pathParams = {};
    this.response = undefined;
    this.error = undefined;
    this.result = undefined;
    this.finishedAt = undefined;
    this.interrupted = false;
    this.cacheHit = false;
    this.startedAt = Date.now();
    this.request = request;
  }

  /**
   * 便于日志记录的部分字段浅拷贝。
   *
   * Shallow copy of the fields worth logging.
   *
   * @returns 日志用字段的普通对象 / A plain object of the fields worth logging.
   */
  describe(): Record<string, unknown> {
    return {
      name: this.fullName,
      method: this.methodType,
      url: this.request.url,
      route: this.route,
      baseURL: this.request.baseURL,
      params: this.request.params,
      fromCache: this.cacheHit,
      elapsed: this.elapsed
    };
  }
}
