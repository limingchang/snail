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

/** Payload of the `codeError` event. */
export interface SnailCodeErrorEvent {
  /** Business status code the backend returned. */
  code: number | string | undefined;
  /** Full parsed envelope. */
  payload: unknown;
  /** The `SnailResponseError` that will be thrown. */
  error: unknown;
}

/** Events emitted by a {@link SnailMethod}. */
export interface SnailMethodEventMap<
  S,
  T,
  D extends string,
  C extends string,
  M extends string
> {
  success: SnailResult<S, T, D, C, M>;
  error: unknown;
  codeError: SnailCodeErrorEvent;
  finish: undefined;
  cache: undefined;
}

/** Everything `SnailMethod` needs, assembled by the proxy in `SnailServer`. */
export interface SnailMethodInit {
  server: SnailServer<any, any, any, any>;
  pluginManager: PluginManager;
  axios: AxiosInstance;
  apiClass: new () => unknown;
  api: unknown;
  apiName: string;
  apiOptions: Required<SnailApiOptions>;
  serverOptions: ResolvedServerOptions;
  methodName: string;
  methodType: SnailMethodType;
  route: string;
  methodOptions: SnailMethodOptions & { url: string };
  descriptors: readonly SnailParamDescriptor[];
  headers: AxiosHeaders;
  logger: SnailLogger;
  /**
   * Builds a fresh axios config for this method.
   *
   * A factory rather than a value: every `send()` must start from a clean config
   * so mutations a plugin made during the previous send do not leak forward.
   */
  requestConfig: () => InternalAxiosRequestConfig;
}

/**
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
  /** `server.api.method`. */
  readonly name: string;

  /** Decorated method name. */
  readonly methodName: string;

  /** Request verb. */
  readonly methodType: SnailMethodType;

  /** Url template before `:placeholder` substitution. */
  readonly route: string;

  /** Arguments this instance was created with. `send(...args)` may override them. */
  readonly args: readonly unknown[];

  /**
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

  /** The live request context. */
  readonly context: SnailContext;

  private readonly init: SnailMethodInit;
  private readonly emitter: Emitter<
    SnailMethodEventMap<S, T, D, C, M> & Record<string, unknown>
  > = new Emitter();
  private controller: AbortController | undefined;
  private inFlight = false;

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

  /** `true` while a request is in flight. */
  get pending(): boolean {
    return this.inFlight;
  }

  /** Result of the most recent successful request. */
  get result(): SnailResult<S, T, D, C, M> | undefined {
    return this.context.result as SnailResult<S, T, D, C, M> | undefined;
  }

  /** Error from the most recent failed request. */
  get error(): unknown {
    return this.context.error;
  }

  /** The final axios config of the most recent request. */
  get request(): InternalAxiosRequestConfig {
    return this.context.request;
  }

  /**
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
   * Cancel the in-flight request.
   *
   * `send()` rejects with a {@link SnailCancelledError}, which strategies treat
   * as expected control flow rather than a failure.
   */
  abort(reason?: unknown): void {
    this.controller?.abort(reason);
  }

  // ── events ────────────────────────────────────────────────────────────────

  /** Subscribe to a successful request. Returns an unsubscribe function. */
  onSuccess(listener: (result: SnailResult<S, T, D, C, M>) => void): () => void {
    return this.emitter.on("success", listener);
  }

  /** Subscribe to a failed request. */
  onError(listener: (error: unknown) => void): () => void {
    return this.emitter.on("error", listener);
  }

  /**
   * Subscribe to a rejected business code.
   *
   * Observation only: the request still rejects with a `SnailResponseError`, so
   * this is the right place to raise a toast, not to recover.
   */
  onCodeError(listener: (event: SnailCodeErrorEvent) => void): () => void {
    return this.emitter.on("codeError", listener);
  }

  /** Subscribe to settlement, successful or not. */
  onFinish(listener: () => void): () => void {
    return this.emitter.on("finish", listener);
  }

  /** Subscribe to a response served from a cache. */
  onHitCache(listener: () => void): () => void {
    return this.emitter.on("cache", listener);
  }

  // ── pipeline ──────────────────────────────────────────────────────────────

  /** Reset the context for a fresh send, superseding any request already in flight. */
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
   * The transport step.
   *
   * Runs only when every `beforeRequest` hook called `next()`, i.e. only when the
   * response has to come from the network. The `afterResponse` chain is *not* here
   * — see {@link SnailMethod.send} for why it has to run on a cache hit too.
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

  /** Validate the envelope and assemble the caller-facing result. */
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

  /** Report a failure through the plugin hooks and the events, then rethrow it. */
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
   * Turn axios' error vocabulary into ours.
   *
   * The rule is: **if the server answered, hand back axios' error unchanged** —
   * it carries `response.status` and `response.data`, which applications and the
   * auth strategies both branch on. Only when no response exists at all (DNS
   * failure, offline, CORS rejection) is there nothing useful to preserve, so
   * that case becomes a typed {@link SnailHttpError} with the axios error as its
   * `cause`.
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
