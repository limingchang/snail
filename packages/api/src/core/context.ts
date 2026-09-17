import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailLogger } from "./logger";
import type { SnailServer } from "./server";
import { StateBag } from "./state-bag";
import type { SnailApiOptions, SnailMethodType } from "../typings/api";
import type { SnailParamDescriptor } from "../typings/args";
import type { SnailResult } from "../typings/response";
import type { ResolvedServerOptions } from "../typings/server";

/** Everything needed to construct a request context. */
export interface SnailContextInit {
  server: SnailServer<any, any, any, any>;
  serverOptions: ResolvedServerOptions;
  apiClass: new () => unknown;
  api: unknown;
  apiName: string;
  apiOptions: Required<SnailApiOptions>;
  methodName: string;
  methodType: SnailMethodType;
  route: string;
  request: InternalAxiosRequestConfig;
  descriptors: readonly SnailParamDescriptor[];
  logger: SnailLogger;
}

/**
 * Per-request context — the single object every plugin hook receives.
 *
 * One context exists per `send()` call, so plugins may store freely in
 * `ctx.state` without worrying about concurrent requests colliding. That is a
 * deliberate fix over the pre-rewrite design, where the "event map" and the
 * request config lived on the long-lived `SnailMethod` instance and two
 * overlapping `send()` calls shared mutable state.
 */
export class SnailContext {
  /** The server instance that owns this request. */
  readonly server: SnailServer<any, any, any, any>;

  /** Fully resolved server options. */
  readonly serverOptions: ResolvedServerOptions;

  /** The decorated api class (constructor). */
  readonly apiClass: new () => unknown;

  /** The instantiated api class. */
  readonly api: unknown;

  /** Resolved api name — `@Api({ name })` or the class name. */
  readonly apiName: string;

  /** Fully resolved api options. */
  readonly apiOptions: Required<SnailApiOptions>;

  /** Decorated method name, e.g. `"getUser"`. */
  readonly methodName: string;

  /** Request verb. */
  readonly methodType: SnailMethodType;

  /**
   * Url template for this method — api prefix joined with the method path,
   * **before** `:placeholder` substitution.
   */
  readonly route: string;

  /** `server.api.method`, used in logs and error messages. */
  readonly fullName: string;

  /** Level-gated logger configured from `@Server({ logLevel })`. */
  readonly logger: SnailLogger;

  /** Parameter descriptors captured by the argument decorators. */
  readonly descriptors: readonly SnailParamDescriptor[];

  /** Plugin scratch space. Not visible to the caller. */
  readonly state = new StateBag();

  /** Caller-visible reactive values, populated by `initMeta` hooks. */
  meta: Record<string, unknown> = {};

  /**
   * The live axios request config.
   *
   * Plugins and argument decorators mutate this object in place; replacing it
   * wholesale is also supported and is what `ctx.request = ...` means.
   */
  request: InternalAxiosRequestConfig;

  /** Values gathered from `@Params()` for `:placeholder` substitution. */
  pathParams: Record<string, unknown> = {};

  /** Set once a response exists — from the network **or** from a cache. */
  response: AxiosResponse | undefined;

  /** Set when the request failed. */
  error: unknown;

  /** Set once the envelope passed validation. */
  result: SnailResult<any, any, any, any, any> | undefined;

  /** Timestamp when `send()` started. */
  startedAt: number = Date.now();

  /** Timestamp when the request settled. */
  finishedAt: number | undefined;

  private interrupted = false;
  private cacheHit = false;

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

  /** Milliseconds elapsed since `send()` started. */
  get elapsed(): number {
    return (this.finishedAt ?? Date.now()) - this.startedAt;
  }

  /**
   * Stop the request.
   *
   * With a `response` argument the network call is skipped entirely and that
   * response is used instead — this is exactly how a cache hit works. Without
   * one, the request is abandoned and `send()` rejects with a cancellation error.
   */
  interrupt(response?: AxiosResponse): void {
    this.interrupted = true;
    if (response) this.response = response;
  }

  /** `true` when a plugin short-circuited the request. */
  get isInterrupted(): boolean {
    return this.interrupted;
  }

  /** Record that the current response came from a cache. */
  markCacheHit(): void {
    this.cacheHit = true;
  }

  /** `true` when the response was served from a cache. */
  get isCacheHit(): boolean {
    return this.cacheHit;
  }

  /** Replace the current response. */
  setResponse(response: AxiosResponse | undefined): void {
    this.response = response;
  }

  /** Read the current response. */
  getResponse(): AxiosResponse | undefined {
    return this.response;
  }

  /** Read the current response, throwing when there is none. */
  requireResponse(): AxiosResponse {
    if (!this.response) {
      throw new ReferenceError(`[snail] ${this.fullName} has no response at this point`);
    }
    return this.response;
  }

  /** Replace the request config. */
  setRequest(request: InternalAxiosRequestConfig): void {
    this.request = request;
    this.request.url = this.request.url ?? this.route;
  }

  /** Read the request config. */
  getRequest(): InternalAxiosRequestConfig {
    return this.request;
  }

  /** Replace the parsed result. */
  setResult(result: SnailResult<any, any, any, any, any>): void {
    this.result = result;
  }

  /**
   * Clear everything that belongs to one `send()` while keeping the context
   * identity, so `meta` — and therefore the caller's reactive handles — survive
   * a re-send.
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

  /** Shallow copy of the fields worth logging. */
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
