import { AxiosHeaders, isCancel } from "axios";
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { SnailCancelledError, SnailTimeoutError } from "../error/request";
import { SnailHttpError, SnailResponseError } from "../error/response";
import { t } from "../locale";
import type { SnailApiOptions, SnailMethodOptions, SnailMethodType } from "../typings/api";
import type { SnailParamDescriptor } from "../typings/args";
import type { SnailMeta } from "../typings/meta";
import type { SnailResult } from "../typings/response";
import type { ResolvedServerOptions } from "../typings/server";
import { Emitter } from "../utils/emitter";
import { applyParamDescriptors, finalizeRequestURL } from "./args";
import { SnailContext } from "./context";
import type { SnailLogger } from "./logger";
import {
  createMetaHandles,
  markMetaFailure,
  markMetaPending,
  markMetaSuccess,
  markMetaSettled
} from "./meta";
import type { PluginManager } from "./plugin-manager";
import { assertBusinessCode, buildResult, coerceJSONStringBody, readKey } from "./response";
import type { SnailServer } from "./server";

/**
 * `codeError` 事件的载荷。
 *
 * Payload of the `codeError` event.
 */
export interface SnailCodeErrorEvent {
  /**
   * 后端返回的业务状态码。
   *
   * Business status code the backend returned.
   */
  code: number | string | undefined;
  /**
   * 完整解析后的响应信封。
   *
   * Full parsed envelope.
   */
  payload: unknown;
  /**
   * 即将被抛出的那个 `SnailResponseError`。
   *
   * The `SnailResponseError` that will be thrown.
   */
  error: unknown;
}

/**
 * {@link SnailMethod} 发出的事件。
 *
 * Events emitted by a {@link SnailMethod}.
 */
export interface SnailMethodEventMap<
  S,
  T,
  D extends string,
  C extends string,
  M extends string
> {
  /**
   * 请求成功，携带组装好的结果。
   *
   * The request succeeded, carrying the assembled result.
   */
  success: SnailResult<S, T, D, C, M>;
  /**
   * 请求失败，携带具体错误。
   *
   * The request failed, carrying the concrete error.
   */
  error: unknown;
  /**
   * 后端返回了被拒绝的业务码。
   *
   * The backend returned a rejected business code.
   */
  codeError: SnailCodeErrorEvent;
  /**
   * 请求结束，无论成功与否。
   *
   * The request settled, successfully or not.
   */
  finish: undefined;
  /**
   * 响应来自缓存。
   *
   * The response came from a cache.
   */
  cache: undefined;
}

/**
 * `SnailMethod` 需要的全部信息，由 `SnailServer` 中的代理组装。
 *
 * Everything `SnailMethod` needs, assembled by the proxy in `SnailServer`.
 */
export interface SnailMethodInit {
  /**
   * 拥有该方法实例的服务器。
   *
   * The server that owns this method instance.
   */
  server: SnailServer<any, any, any, any>;
  /**
   * 该服务器上的插件管理器。
   *
   * The plugin manager of that server.
   */
  pluginManager: PluginManager;
  /**
   * 发起请求所用的 axios 实例。
   *
   * The axios instance used to dispatch the request.
   */
  axios: AxiosInstance;
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
   * 解析后的 api 名称。
   *
   * The resolved api name.
   */
  apiName: string;
  /**
   * 已完全解析的 api 选项。
   *
   * Fully resolved api options.
   */
  apiOptions: Required<SnailApiOptions>;
  /**
   * 已完全解析的服务器选项。
   *
   * Fully resolved server options.
   */
  serverOptions: ResolvedServerOptions;
  /**
   * 被装饰的方法名。
   *
   * The decorated method name.
   */
  methodName: string;
  /**
   * 请求动词。
   *
   * Request verb.
   */
  methodType: SnailMethodType;
  /**
   * `:placeholder` 替换之前的 url 模板。
   *
   * The url template before `:placeholder` substitution.
   */
  route: string;
  /**
   * 方法级选项，其中已写好 url。
   *
   * Method-level options with the url already written.
   */
  methodOptions: SnailMethodOptions & { url: string };
  /**
   * 参数装饰器捕获的描述符。
   *
   * Descriptors captured by the argument decorators.
   */
  descriptors: readonly SnailParamDescriptor[];
  /**
   * api 级与方法级 `@Header` 合并后的请求头。
   *
   * Request headers merged from api-level and method-level `@Header`.
   */
  headers: AxiosHeaders;
  /**
   * 输出诊断信息的 logger。
   *
   * Logger used for diagnostics.
   */
  logger: SnailLogger;
  /**
   * 为本方法构建一份全新的 axios 配置。
   *
   * 它是工厂而不是值：每次 `send()` 都必须从干净的配置开始，否则插件在上一次
   * 发送中所做的改动会泄漏到下一次。
   *
   * Builds a fresh axios config for this method.
   *
   * A factory rather than a value: every `send()` must start from a clean config
   * so mutations a plugin made during the previous send do not leak forward.
   *
   * @returns 全新的 axios 请求配置 / A fresh axios request config.
   */
  requestConfig: () => InternalAxiosRequestConfig;
}

/**
 * 一次待发送的请求。
 *
 * 调用被代理的 api 方法（`userApi.getUser("1")`）即可创建，再由
 * {@link SnailMethod.send} 发出。在 `send()` 之前不会有任何网络流量。
 *
 * ## 为什么上下文只构建一次然后被重置
 *
 * 核心在方法构建时就根据服务器的 `stateAdapter` 创建调用方的响应式句柄。这些句柄
 * 必须在每次重新发送之后依然有效，因此上下文只构造一次，{@link SnailContext.reset}
 * 只清空属于单次请求的字段。若每次调用 `userApi.getUser()` 都新建一套 ref，就会
 * 产生两组互不相干的响应式状态 —— 这正是旧的“`request()` 返回全新状态”设计的缺陷。
 *
 * One pending request.
 *
 * Created by calling a proxied api method — `userApi.getUser("1")` — and sent by
 * calling {@link SnailMethod.send}. Nothing hits the network until `send()`.
 *
 * ## Why the context is built once and reset
 *
 * Core creates the caller's reactive handles from the server's `stateAdapter` when
 * the method is built. Those handles must survive every re-send, so the context is
 * constructed once and {@link SnailContext.reset} clears only the per-request
 * fields. Calling `userApi.getUser()` twice would produce two independent sets of
 * refs, which is exactly the bug the old `request()`-returns-fresh-state design had.
 */
export class SnailMethod<
  S = unknown,
  T = unknown,
  D extends string = "data",
  C extends string = "code",
  M extends string = "message"
> {
  /**
   * 本方法的完整名称 `server.api.method`。
   *
   * `server.api.method`.
   */
  readonly name: string;

  /**
   * 被装饰的方法名。
   *
   * Decorated method name.
   */
  readonly methodName: string;

  /**
   * 请求动词。
   *
   * Request verb.
   */
  readonly methodType: SnailMethodType;

  /**
   * `:placeholder` 替换之前的 url 模板。
   *
   * Url template before `:placeholder` substitution.
   */
  readonly route: string;

  /**
   * 创建本实例时传入的参数；`send(...args)` 可以覆盖它们。
   *
   * Arguments this instance was created with. `send(...args)` may override them.
   */
  readonly args: readonly unknown[];

  /**
   * 调用方可见的响应式值，由服务器的 `stateAdapter` 产出。
   *
   * 它是 `context.meta` 的实时视图。核心在方法构建时就创建五个标准句柄，因此它们在
   * 每次重新发送后都保持稳定；插件可以通过 `initMeta` 追加自己的句柄。
   *
   * `loading` 和 `error` 由 {@link SnailMeta} 接口给出类型；信封句柄的名字取自
   * 服务器配置的键，因此要给它们类型就需要扩展 `SnailMeta`。
   *
   * Caller-visible reactive values, produced by the server's `stateAdapter`.
   *
   * A live view of `context.meta`. Core creates the five standard handles when the
   * method is built, so they stay stable across every re-send; a plugin may add its
   * own through `initMeta`.
   *
   * `loading` and `error` are typed by the {@link SnailMeta} interface; the
   * envelope handles are named after the server's configured keys, so augment
   * `SnailMeta` to type them.
   */
  get meta(): SnailMeta & Record<string, unknown> {
    return this.context.meta as SnailMeta & Record<string, unknown>;
  }

  /**
   * 实时的请求上下文。
   *
   * The live request context.
   */
  readonly context: SnailContext;

  private readonly init: SnailMethodInit;
  private readonly emitter: Emitter<
    SnailMethodEventMap<S, T, D, C, M> & Record<string, unknown>
  > = new Emitter();
  private controller: AbortController | undefined;
  private inFlight = false;

  /**
   * 由初始化描述和本次调用的参数构造方法实例。
   *
   * 构造时会立刻创建五个标准 meta 句柄，并运行插件的 `initMeta` 同步钩子，
   * 使调用方在第一次请求之前就能把这些句柄渲染出来。
   *
   * Build a method instance from its init description and this call's arguments.
   *
   * @param init 由代理组装的初始化描述 / The init description assembled by the proxy.
   * @param args 本次调用捕获的参数 / The arguments captured for this call.
   */
  constructor(init: SnailMethodInit, args: readonly unknown[] = []) {
    this.init = init;
    this.args = args;
    this.name = `${init.serverOptions.name}.${init.apiName}.${init.methodName}`;
    this.methodName = init.methodName;
    this.methodType = init.methodType;
    this.route = init.route;

    this.context = new SnailContext({
      server: init.server,
      serverOptions: init.serverOptions,
      apiClass: init.apiClass,
      api: init.api,
      apiName: init.apiName,
      apiOptions: init.apiOptions,
      methodName: init.methodName,
      methodType: init.methodType,
      route: init.route,
      request: init.requestConfig(),
      descriptors: init.descriptors,
      logger: init.logger
    });

    // Core creates the five standard handles from the server's `stateAdapter`, so
    // `method.meta.data` is a Vue ref (or a React box, or a plain value) purely
    // because of a `@Server` option — no adapter plugin is involved. Runs eagerly
    // so the caller can render the handles before the first request.
    createMetaHandles(this.context);

    // Plugins may still contribute their own meta here; core has already created
    // the standard keys, so a plugin adds rather than replaces.
    init.pluginManager.runEffectsSync("initMeta", this.context);
  }

  /**
   * 请求在途时为 `true`。
   *
   * `true` while a request is in flight.
   */
  get pending(): boolean {
    return this.inFlight;
  }

  /**
   * 最近一次成功请求的结果。
   *
   * Result of the most recent successful request.
   */
  get result(): SnailResult<S, T, D, C, M> | undefined {
    return this.context.result as SnailResult<S, T, D, C, M> | undefined;
  }

  /**
   * 最近一次失败请求的错误。
   *
   * Error from the most recent failed request.
   */
  get error(): unknown {
    return this.context.error;
  }

  /**
   * 最近一次请求最终的 axios 配置。
   *
   * The final axios config of the most recent request.
   */
  get request(): InternalAxiosRequestConfig {
    return this.context.request;
  }

  /**
   * 发送请求。
   *
   * 这里传入的参数会替换代理时捕获的参数，这正是让某个策略持有一个实例、而按调用
   * 变换参数的做法。
   *
   * ## 同时只允许一个请求在途
   *
   * 一个 `SnailMethod` 恰好拥有一个上下文，而调用方的响应式句柄就存在其中。因此两个
   * 重叠的 `send()` 会争抢同一个 `ctx.response`，较慢的响应可能落进较快那次已经公布
   * 过的状态里。
   *
   * 所以发起第二次发送会**中止第一次**：前一次调用以 `SnailCancelledError` reject，
   * 从而保证“后来者胜”。确实需要两个并行请求的调用方应当创建两个实例 ——
   * `userApi.getUser("1")` 与 `userApi.getUser("2")` —— 这也正是让参数类型对得上的
   * 做法。
   *
   * Send the request.
   *
   * Any arguments given here replace the ones captured when the method was
   * proxied, which is what lets a strategy own one instance and vary the
   * arguments per call.
   *
   * ## One request in flight at a time
   *
   * A `SnailMethod` owns exactly one context, and that context is what holds the
   * caller's reactive handles. Two overlapping `send()` calls would therefore
   * race over the same `ctx.response`, and the slower response could land in the
   * state the faster one already reported.
   *
   * Starting a second send therefore **aborts the first**, so the previous call
   * rejects with a `SnailCancelledError` and "latest wins" holds. Callers that
   * genuinely want two parallel requests should create two instances —
   * `userApi.getUser("1")` and `userApi.getUser("2")` — which is also what makes
   * the argument types line up.
   *
   * @param args 本次调用的参数，省略则使用创建实例时的参数 /
   *   Arguments for this call; omitted means the ones captured at creation.
   * @returns 组装好的请求结果 / The assembled request result.
   * @throws 请求失败、被取消或业务码被拒时抛出的错误 /
   *   The error thrown when the request fails, is cancelled or is rejected by its code.
   */
  async send(...args: unknown[]): Promise<SnailResult<S, T, D, C, M>> {
    const callArgs = args.length > 0 ? args : this.args;
    const ctx = this.begin();

    this.inFlight = true;
    ctx.logger.info(
      t(
        "info.request.start",
        this.methodType,
        `${ctx.request.baseURL ?? ""}${this.route}`,
        this.name
      )
    );

    try {
      // A plugin with an async `install` may not have wired its hooks yet.
      await this.init.pluginManager.ready;

      // Safety net for a context built before the server's adapter was known, and
      // for the case where an async `install` had not wired anything yet.
      if (Object.keys(ctx.meta).length === 0) {
        createMetaHandles(ctx);
        this.init.pluginManager.runEffectsSync("initMeta", ctx);
      }

      // Flag loading and clear the previous failure before any hook can observe
      // them, so a plugin reading `meta` sees the same thing the UI does.
      markMetaPending(ctx);

      this.init.pluginManager.runEffectsSync("beforeCreate", ctx);

      applyParamDescriptors(ctx, callArgs);
      finalizeRequestURL(ctx);

      await this.init.pluginManager.runChain("beforeRequest", ctx, () =>
        this.dispatch(ctx)
      );

      if (!ctx.response) {
        // Reaching this point without a response means a `beforeRequest` hook
        // declined to call `next()`: the request was refused, not attempted and
        // failed. Reporting it as a cancellation is what lets a strategy treat it
        // as expected control flow (the cache plugin on a hit does exactly this,
        // except it also supplies the response).
        throw new SnailCancelledError(t("error.request.cancelled", this.name));
      }

      // The response chain runs for a network response and a cache hit alike.
      //
      // A hit short-circuits `beforeRequest` and supplies `ctx.response`, which
      // skips `dispatch` entirely. Leaving `afterResponse` inside `dispatch` meant
      // every plugin that works on the *payload* — zod response validation, the
      // JSON→class transform — silently did nothing on a hit, so the same call
      // returned a DTO instance the first time and a plain object the second. The
      // chain belongs to the response, not to the transport.
      //
      // `requestInterceptor` and `responseInterceptor` deliberately stay on the
      // network path: they exist to rewrite a real request and a real response.
      await this.init.pluginManager.runChain("afterResponse", ctx);

      // Publish the payload to `meta` *before* the success event, so a handler that
      // reads `method.meta.data` sees this response rather than the previous one.
      markMetaSuccess(ctx);

      const result = this.finalize(ctx) as SnailResult<S, T, D, C, M>;
      this.emitter.emit("success", result);
      return result;
    } catch (error) {
      throw await this.fail(ctx, error);
    } finally {
      this.inFlight = false;
      ctx.finishedAt = Date.now();

      // `afterRequest` runs *before* the `finish` event on purpose. Both core and
      // the plugins clear `loading` in that window, so emitting `finish` first would
      // hand a caller's `onFinish` handler a stale `loading === true` — precisely the
      // flag a UI reads to dismiss its spinner. Cleanup first, then tell everyone.
      try {
        await this.init.pluginManager.runEffects("afterRequest", ctx);
      } catch (cleanupError) {
        ctx.logger.error(
          t("error.request.failed", this.name, `afterRequest hook: ${String(cleanupError)}`)
        );
      }

      markMetaSettled(ctx);

      this.emitter.emit("finish", undefined);
    }
  }

  /**
   * 取消在途请求。
   *
   * `send()` 会以 {@link SnailCancelledError} reject，各策略都把它当作预期的控制流，
   * 而不是失败。
   *
   * Cancel the in-flight request.
   *
   * `send()` rejects with a {@link SnailCancelledError}, which strategies treat
   * as expected control flow rather than a failure.
   *
   * @param reason 传给 `AbortController.abort` 的原因 /
   *   The reason forwarded to `AbortController.abort`.
   */
  abort(reason?: unknown): void {
    this.controller?.abort(reason);
  }

  // ── events ────────────────────────────────────────────────────────────────

  /**
   * 订阅请求成功。返回取消订阅的函数。
   *
   * Subscribe to a successful request. Returns an unsubscribe function.
   *
   * @param listener 成功时以结果调用 / Called with the result on success.
   * @returns 取消订阅的函数 / A function that unsubscribes.
   */
  onSuccess(listener: (result: SnailResult<S, T, D, C, M>) => void): () => void {
    return this.emitter.on("success", listener);
  }

  /**
   * 订阅请求失败。
   *
   * Subscribe to a failed request.
   *
   * @param listener 失败时以错误调用 / Called with the error on failure.
   * @returns 取消订阅的函数 / A function that unsubscribes.
   */
  onError(listener: (error: unknown) => void): () => void {
    return this.emitter.on("error", listener);
  }

  /**
   * 订阅业务码被拒。
   *
   * 仅用于观察：请求仍会以 `SnailResponseError` reject，因此这里适合弹提示，
   * 而不是做恢复处理。
   *
   * Subscribe to a rejected business code.
   *
   * Observation only: the request still rejects with a `SnailResponseError`, so
   * this is the right place to raise a toast, not to recover.
   *
   * @param listener 业务码被拒时以事件调用 / Called with the event on a rejected code.
   * @returns 取消订阅的函数 / A function that unsubscribes.
   */
  onCodeError(listener: (event: SnailCodeErrorEvent) => void): () => void {
    return this.emitter.on("codeError", listener);
  }

  /**
   * 订阅请求结束，无论成功与否。
   *
   * Subscribe to settlement, successful or not.
   *
   * @param listener 结束时调用 / Called once the request settles.
   * @returns 取消订阅的函数 / A function that unsubscribes.
   */
  onFinish(listener: () => void): () => void {
    return this.emitter.on("finish", listener);
  }

  /**
   * 订阅由缓存提供的响应。
   *
   * Subscribe to a response served from a cache.
   *
   * @param listener 命中缓存时调用 / Called when a cache hit occurs.
   * @returns 取消订阅的函数 / A function that unsubscribes.
   */
  onHitCache(listener: () => void): () => void {
    return this.emitter.on("cache", listener);
  }

  // ── pipeline ──────────────────────────────────────────────────────────────

  /**
   * 为一次新的发送重置上下文，并取代任何已在途的请求。
   *
   * Reset the context for a fresh send, superseding any request already in flight.
   *
   * @returns 已重置、可直接使用的请求上下文 / The reset, ready-to-use request context.
   */
  private begin(): SnailContext {
    const ctx = this.context;

    // "Latest wins": a second send() invalidates the first rather than letting
    // both write into one context. The superseded call settles as cancelled,
    // which every strategy already treats as expected control flow.
    this.controller?.abort();
    this.controller = new AbortController();

    const config = this.init.requestConfig();
    config.signal = this.controller.signal;
    ctx.reset(config);
    return ctx;
  }

  /**
   * 传输步骤。
   *
   * 只有当每个 `beforeRequest` 钩子都调用了 `next()` 时才执行，也就是响应必须来自
   * 网络时才执行。`afterResponse` 链**不在**这里 —— 见 {@link SnailMethod.send}，
   * 那里解释了为什么命中缓存时它也必须运行。
   *
   * The transport step.
   *
   * Runs only when every `beforeRequest` hook called `next()`, i.e. only when the
   * response has to come from the network. The `afterResponse` chain is *not* here
   * — see {@link SnailMethod.send} for why it has to run on a cache hit too.
   *
   * @param ctx 当前请求上下文 / The current request context.
   */
  private async dispatch(ctx: SnailContext): Promise<void> {
    let config = this.init.pluginManager.reduce(
      "requestInterceptor",
      ctx.request,
      ctx
    );
    ctx.request = config;

    let response: AxiosResponse;
    try {
      response = await this.init.axios.request(config);
    } catch (error) {
      throw this.normalizeTransportError(error);
    }

    response = coerceJSONStringBody(response, ctx.serverOptions.coerceJSONString);
    ctx.setResponse(response);

    const intercepted = this.init.pluginManager.reduce(
      "responseInterceptor",
      response,
      ctx
    );
    ctx.setResponse(intercepted);
  }

  /**
   * 校验响应信封并组装面向调用方的结果。
   *
   * Validate the envelope and assemble the caller-facing result.
   *
   * @param ctx 当前请求上下文 / The current request context.
   * @returns 组装好的请求结果 / The assembled request result.
   */
  private finalize(ctx: SnailContext): SnailResult<S, T, D, C, M> {
    const response = ctx.requireResponse();
    const envelope = response.data;
    const { codeKey, messageKey, dataKey, validateCode } = ctx.serverOptions;
    const code = readKey<number | string>(envelope, codeKey);

    assertBusinessCode({
      body: envelope,
      code,
      dataKey,
      validate: validateCode,
      fullName: this.name,
      message: t("error.response.code", this.name, String(code))
    });

    const result = buildResult<S, T, D, C, M>({
      response,
      envelope,
      codeKey,
      messageKey,
      dataKey,
      fromCache: ctx.isCacheHit,
      config: ctx.request
    });

    ctx.setResult(result);
    if (ctx.isCacheHit) this.emitter.emit("cache", undefined);

    ctx.logger.info(
      t(
        "info.request.success",
        this.methodType,
        `${response.config.baseURL ?? ""}${response.config.url ?? ""}`,
        this.name,
        `${Math.round(ctx.elapsed)}ms`
      )
    );

    return result;
  }

  /**
   * 通过插件钩子和事件上报失败，然后把错误重新抛出。
   *
   * Report a failure through the plugin hooks and the events, then rethrow it.
   *
   * @param ctx 当前请求上下文 / The current request context.
   * @param error 导致失败的错误 / The error that caused the failure.
   * @returns 原样返回的同一个错误，供调用方 `throw` /
   *   The same error, so the caller can `throw` it.
   */
  private async fail(ctx: SnailContext, error: unknown): Promise<unknown> {
    ctx.error = error;

    // Publish the failure before the hooks and events run, so an observer reading
    // `meta.error` sees the same value the `error` event carries. A cancellation is
    // skipped inside, so an unmount does not flash an error state.
    markMetaFailure(ctx, error);

    try {
      await this.init.pluginManager.runEffects("onError", ctx, error);
    } catch (hookError) {
      ctx.logger.error(
        t("error.request.failed", this.name, `onError hook: ${String(hookError)}`)
      );
    }

    if (error instanceof SnailResponseError) {
      this.emitter.emit("codeError", {
        code: error.businessCode,
        payload: error.payload,
        error
      });
      ctx.logger.warn(
        t(
          "info.request.codeError",
          this.methodType,
          this.route,
          this.name,
          String(error.businessCode)
        )
      );
    } else {
      this.emitter.emit("error", error);
      if (!(error instanceof SnailCancelledError)) {
        ctx.logger.error(
          t("info.request.error", this.methodType, this.route, this.name, String(error))
        );
      }
    }

    return error;
  }

  /**
   * 把 axios 的错误词汇翻译成本库的。
   *
   * 规则是：**只要服务器作出了应答，就原样返回 axios 的错误** —— 它带着
   * `response.status` 和 `response.data`，应用代码和鉴权策略都会据此分支。只有完全
   * 没有响应时（DNS 失败、离线、CORS 被拒）才没有任何值得保留的东西，这种情况才
   * 转成带类型的 {@link SnailHttpError}，并把 axios 错误作为它的 `cause`。
   *
   * Turn axios' error vocabulary into ours.
   *
   * The rule is: **if the server answered, hand back axios' error unchanged** —
   * it carries `response.status` and `response.data`, which applications and the
   * auth strategies both branch on. Only when no response exists at all (DNS
   * failure, offline, CORS rejection) is there nothing useful to preserve, so
   * that case becomes a typed {@link SnailHttpError} with the axios error as its
   * `cause`.
   *
   * @param error 传输层抛出的原始错误 / The raw error thrown by the transport.
   * @returns 归一化后的错误 / The normalised error.
   */
  private normalizeTransportError(error: unknown): unknown {
    if (error instanceof SnailCancelledError) return error;

    const axiosError = error as {
      code?: string;
      message?: string;
      response?: AxiosResponse;
      isAxiosError?: boolean;
      config?: { timeout?: number };
    };

    if (isCancel(error) || axiosError?.code === "ERR_CANCELED") {
      return new SnailCancelledError(t("error.request.cancelled", this.name), {
        cause: error
      });
    }

    if (axiosError?.code === "ECONNABORTED" || axiosError?.code === "ETIMEDOUT") {
      return new SnailTimeoutError(
        t("error.request.timeout", this.name, String(axiosError.config?.timeout ?? "")),
        { timeout: axiosError.config?.timeout, cause: error }
      );
    }

    if (axiosError?.isAxiosError === true && !axiosError.response) {
      return new SnailHttpError(
        t("error.request.failed", this.name, axiosError.message ?? "network error"),
        { cause: error, code: "SNAIL_NETWORK_ERROR" }
      );
    }

    return error;
  }
}
