import axios from "axios";
import { AxiosHeaders } from "axios";
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { SnailDecoratorError } from "../error/decorator";
import type { SnailApiProxy, SnailMethodOptions, SnailMethodType } from "../typings/api";
import type { SnailParamDescriptor } from "../typings/args";
import type { SnailPlugin, SnailPluginObject } from "../typings/plugin";
import type { SnailEnvelopeSchema } from "../typings/response";
import type {
  SnailHttpStreamOptions,
  SnailSseEndpoint,
  SnailWsEndpoint
} from "../typings/stream";
import type { ResolvedServerOptions } from "../typings/server";
import { buildRequestURL } from "../utils/url";
import { applyParamDescriptors, finalizeRequestURL } from "./args";
import { SnailContext } from "./context";
import { createHttpStream } from "./http-stream";
import { createLogger } from "./logger";
import { SNAIL_PARAMS } from "./metadata.keys";
import { getMetadata } from "./metadata";
import { SnailMethod } from "./method";
import { PluginManager } from "./plugin-manager";
import {
  buildBaseRequestConfig,
  resolveApiOptions,
  resolveHeaders,
  resolveMethodDecoratorOptions,
  resolveProgress,
  resolveRoute,
  resolveServerOptions
} from "./resolve";
import {
  rebindSseHandlers,
  rebindWsHandlers,
  resolveHttpStreamEndpoint,
  resolveSseEndpoint,
  resolveWsEndpoint,
  toWebSocketURL
} from "./resolve-stream";
import { createSseConnection } from "./sse";
import { createWsConnection } from "./websocket";

/**
 * The server base class.
 *
 * Extend it, decorate the subclass with `@Server(...)` and instantiate once:
 *
 * ```ts
 * @Server({ baseURL: "/api", timeout: 5000 })
 * class BackEnd extends SnailServer {}
 *
 * export const Service = new BackEnd();
 * ```
 *
 * The instance owns an axios instance, a plugin registry and the resolved
 * options. It is created eagerly at module load, so `use()` is synchronous and
 * chainable: `Service.use(A()).use(B())`.
 */
export class SnailServer<
  ServerResponse = SnailEnvelopeSchema,
  DataKey extends string = "data",
  CodeKey extends string = "code",
  MessageKey extends string = "message"
> {
  /** Server name — `@Server({ name })` or the subclass name. */
  readonly name: string;

  /** Fully resolved options, defaults applied. */
  readonly options: ResolvedServerOptions;

  /** The axios instance every request of this server goes through. */
  readonly axios: AxiosInstance;

  /** This server's plugin registry. */
  readonly pluginManager: PluginManager;

  private readonly logger;
  private readonly apiCache = new WeakMap<object, unknown>();

  constructor() {
    const serverClass = this.constructor as new () => unknown;
    this.options = resolveServerOptions(serverClass, serverClass.name);
    this.name = this.options.name;
    this.logger = createLogger(this.options.logLevel);

    // A bare instance on purpose: every option travels on the per-request config
    // built by `buildBaseRequestConfig`, so there is exactly one place where
    // defaults are applied instead of two competing layers.
    this.axios = axios.create();
    this.pluginManager = new PluginManager(this.name, this.options);

    // `configureServer` runs once, after the manager exists, so a plugin may
    // still register another plugin from inside it.
    for (const { hook } of this.pluginManager.hooks("configureServer")) {
      (hook as (options: ResolvedServerOptions) => void)(this.options);
    }
  }

  /**
   * Register a plugin.
   *
   * Synchronous and chainable. Validation (name, duplicates, `dependsOn`) throws
   * immediately; an async `install` hook is awaited once, before the first
   * request, via the manager's `ready` promise.
   */
  use(plugin: SnailPluginObject<any> | SnailPlugin<any>): this {
    const instance = typeof plugin === "function" ? plugin() : plugin;
    this.pluginManager.register(instance);
    return this;
  }

  /** Unregister a plugin by instance or by name. */
  async remove(plugin: SnailPluginObject<any> | string): Promise<boolean> {
    const name = typeof plugin === "string" ? plugin : plugin?.name;
    if (!name || !this.pluginManager.has(name)) return false;
    await this.pluginManager.remove(name);
    return true;
  }

  /** `true` when a plugin with this name is registered. */
  hasPlugin(name: string): boolean {
    return this.pluginManager.has(name);
  }

  /** Registered plugin names, in chain order. */
  get plugins(): readonly string[] {
    return this.pluginManager.names();
  }

  /**
   * Turn a decorated api class into a proxy whose methods build requests.
   *
   * ```ts
   * @Api("/user")
   * class UserApi {
   *   @Get("/:id")
   *   getUser(@Params("id") id: string): Promise<User> { return null!; }
   * }
   *
   * export const userApi = Service.createApi(UserApi);
   * const method = userApi.getUser("1");  // nothing sent yet
   * const { data } = await method.send();
   * ```
   *
   * A declared return type — `Promise<User>` above — becomes the payload type,
   * so `data` is `User` with no explicit generic.
   */
  createApi<TClass extends new (...args: any[]) => object>(
    apiClass: TClass
  ): SnailApiProxy<InstanceType<TClass>, ServerResponse, DataKey, CodeKey, MessageKey> {
    const cached = this.apiCache.get(apiClass);
    if (cached) {
      return cached as SnailApiProxy<
        InstanceType<TClass>,
        ServerResponse,
        DataKey,
        CodeKey,
        MessageKey
      >;
    }

    const apiOptions = resolveApiOptions(apiClass, apiClass.name);
    for (const { hook } of this.pluginManager.hooks("configureApi")) {
      (hook as (options: typeof apiOptions, target: unknown) => void)(apiOptions, apiClass);
    }

    const instance = new apiClass();
    // Method descriptions are resolved once per api class and cached: resolving
    // them on every property access would re-run `configureMethod` per *call*
    // rather than per method, and a plugin that mutates method options would
    // then apply its change once per request.
    const descriptors = new Map<string, MethodDescriptor | null>();
    const descriptorFor = (methodName: string): MethodDescriptor | null => {
      if (descriptors.has(methodName)) return descriptors.get(methodName)!;
      const resolved = this.resolveMethodDescriptor(apiClass, apiOptions, methodName);
      descriptors.set(methodName, resolved);
      return resolved;
    };

    const proxied = new Proxy(instance, {
      get: (target, propertyKey, receiver) => {
        const value = Reflect.get(target, propertyKey, receiver);

        if (typeof propertyKey === "symbol" || typeof value !== "function") {
          return value;
        }

        const descriptor = descriptorFor(String(propertyKey));
        if (!descriptor) {
          // Not a decorated request method — hand back the original so an api
          // class may still hold helpers next to its endpoints.
          return value;
        }

        if (descriptor.kind === "stream") {
          // `@HttpStream` methods return a stream controller rather than a request
          // object: a stream has no envelope to validate or cache, so it never
          // enters the plugin pipeline.
          return (...args: unknown[]) =>
            this.createHttpStream(apiClass, apiOptions, descriptor, args);
        }

        return (...args: unknown[]) =>
          this.createMethod(apiClass, target, apiOptions, descriptor, args);
      }
    });

    this.apiCache.set(apiClass, proxied);
    return proxied as unknown as SnailApiProxy<
      InstanceType<TClass>,
      ServerResponse,
      DataKey,
      CodeKey,
      MessageKey
    >;
  }

  /**
   * Turn a class decorated with `@Sse(...)` into an endpoint factory.
   *
   * ```ts
   * @Sse("/events")
   * class Events { @SseEvent() onMessage(m: SnailSseMessage) {} }
   *
   * const events = Service.createSse(Events);
   * const connection = events.open();
   * ```
   */
  createSse<TClass extends new (...args: any[]) => object>(
    sseClass: TClass
  ): SnailSseEndpoint {
    const endpoint = resolveSseEndpoint(sseClass);
    if (!endpoint) {
      throw new SnailDecoratorError(
        `[snail] ${sseClass.name} is missing the @Sse() decorator`
      );
    }

    const instance = new sseClass();

    return {
      open: () =>
        createSseConnection({
          url: buildRequestURL(this.options.baseURL, endpoint.url),
          options: endpoint.options,
          handlers: rebindSseHandlers(endpoint.handlers, instance),
          name: `${this.options.name}.${sseClass.name}`,
          logger: this.logger
        })
    };
  }

  /**
   * Turn a class decorated with `@WebSocket(...)` into an endpoint factory.
   *
   * ```ts
   * @WebSocket("/ws")
   * class Chat { @OnWsMessage() incoming(event: MessageEvent) {} }
   *
   * const chat = Service.createWebSocket(Chat);
   * const socket = chat.open();
   * socket.send({ hello: "world" });
   * ```
   */
  createWebSocket<TClass extends new (...args: any[]) => object>(
    wsClass: TClass
  ): SnailWsEndpoint {
    const endpoint = resolveWsEndpoint(wsClass);
    if (!endpoint) {
      throw new SnailDecoratorError(
        `[snail] ${wsClass.name} is missing the @WebSocket() decorator`
      );
    }

    const instance = new wsClass();

    return {
      open: () =>
        createWsConnection({
          url: toWebSocketURL(buildRequestURL(this.options.baseURL, endpoint.url)),
          options: endpoint.options,
          handlers: rebindWsHandlers(endpoint.handlers, instance),
          name: `${this.options.name}.${wsClass.name}`,
          logger: this.logger
        })
    };
  }

  /**
   * Send a one-off request that is **not** backed by a decorated api class.
   *
   * This is an escape hatch, and it is deliberately thin: it awaits plugin
   * installation and then calls the axios instance directly. **No lifecycle hook
   * runs** — no `beforeRequest`, no `afterResponse`, no caching, no validation, no
   * response transformation — and the envelope is *not* unwrapped, so you get the
   * raw `AxiosResponse` back.
   *
   * Prefer a decorated api method for anything that should participate in the
   * plugin pipeline. Reach for this only for a call that genuinely has no place in
   * a service definition, such as a health check against a third party.
   */
  async request<T = unknown, R = AxiosResponse<T>>(
    config: AxiosRequestConfig
  ): Promise<R> {
    await this.pluginManager.ready;
    const merged: AxiosRequestConfig = {
      baseURL: this.options.baseURL,
      timeout: this.options.timeout,
      ...config
    };
    return (await this.axios.request(merged)) as unknown as R;
  }

  /** Uninstall every plugin, running their cleanup hooks. */
  async dispose(): Promise<void> {
    await this.pluginManager.clear();
  }

  /** Metadata helper for tooling and tests. */
  describe(): Record<string, unknown> {
    return {
      name: this.name,
      baseURL: this.options.baseURL,
      timeout: this.options.timeout,
      codeKey: this.options.codeKey,
      messageKey: this.options.messageKey,
      dataKey: this.options.dataKey,
      logLevel: this.options.logLevel,
      plugins: this.pluginManager.list().map((entry) => ({
        name: entry.name,
        priority: entry.priority
      }))
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Resolve everything static about one decorated method.
   *
   * Called once per method per api class. Returns `null` for a member that is not
   * a decorated endpoint, which is how an api class may keep plain helpers next to
   * its requests.
   */
  private resolveMethodDescriptor(
    apiClass: new () => object,
    apiOptions: ReturnType<typeof resolveApiOptions>,
    methodName: string
  ): MethodDescriptor | null {
    const streamEndpoint = resolveHttpStreamEndpoint(apiClass, methodName);
    if (streamEndpoint) {
      const methodType = (streamEndpoint.options.method ?? "POST").toUpperCase() as SnailMethodType;
      return {
        kind: "stream",
        methodName,
        methodType,
        route: resolveRoute(apiOptions.url, streamEndpoint.url),
        streamOptions: streamEndpoint.options,
        headers: resolveHeaders(apiClass, methodName),
        descriptors:
          getMetadata<SnailParamDescriptor[]>(SNAIL_PARAMS, apiClass, methodName) ?? []
      };
    }

    const methodOptions = resolveMethodDecoratorOptions(apiClass, methodName);
    if (!methodOptions) return null;

    const methodType = methodOptions.method;
    const progress = resolveProgress(apiClass, methodName);
    const headers = resolveHeaders(apiClass, methodName);
    const route = resolveRoute(apiOptions.url, methodOptions.url ?? "");

    const resolvedMethodOptions = {
      ...methodOptions,
      url: route,
      onUploadProgress:
        (methodOptions.onUploadProgress as never) ?? (progress.onUploadProgress as never),
      onDownloadProgress:
        (methodOptions.onDownloadProgress as never) ??
        (progress.onDownloadProgress as never)
    };

    for (const { hook } of this.pluginManager.hooks("configureMethod")) {
      (
        hook as (
          options: typeof resolvedMethodOptions,
          name: string,
          apiName: string
        ) => void
      )(resolvedMethodOptions, methodName, apiOptions.name);
    }

    return {
      kind: "request",
      methodName,
      methodType,
      route,
      methodOptions: resolvedMethodOptions,
      headers,
      descriptors:
        getMetadata<SnailParamDescriptor[]>(SNAIL_PARAMS, apiClass, methodName) ?? []
    };
  }

  /**
   * Build the stream controller behind an `@HttpStream` method.
   *
   * A real context is constructed rather than a look-alike, so the `@Query()` /
   * `@Data()` / `@HeaderValue()` resolvers behave exactly as they do for a normal
   * request. The plugin pipeline is deliberately skipped: a byte stream has no
   * envelope to cache or validate.
   */
  private createHttpStream(
    apiClass: new () => object,
    apiOptions: ReturnType<typeof resolveApiOptions>,
    descriptor: Extract<MethodDescriptor, { kind: "stream" }>,
    args: unknown[]
  ): ReturnType<typeof createHttpStream> {
    const streamOptions = descriptor.streamOptions;
    const methodOptions = {
      ...streamOptions,
      url: descriptor.route,
      method: descriptor.methodType
    };

    const config = buildBaseRequestConfig({
      serverOptions: this.options,
      apiOptions,
      methodOptions: methodOptions as never,
      methodType: descriptor.methodType,
      headers: descriptor.headers
    });
    config.url = descriptor.route;

    const ctx = new SnailContext({
      server: this as unknown as SnailServer<any, any, any, any>,
      serverOptions: this.options,
      apiClass,
      api: undefined,
      apiName: apiOptions.name || apiClass.name,
      apiOptions,
      methodName: descriptor.methodName,
      methodType: descriptor.methodType,
      route: descriptor.route,
      request: config,
      descriptors: descriptor.descriptors,
      logger: this.logger
    });

    applyParamDescriptors(ctx, args);
    finalizeRequestURL(ctx);

    const headers = Object.fromEntries(
      Object.entries(ctx.request.headers.toJSON()).map(([key, value]) => [key, String(value)])
    );

    return createHttpStream({
      url: buildRequestURL(this.options.baseURL, ctx.request.url ?? descriptor.route),
      options: { ...streamOptions, method: descriptor.methodType },
      body: ctx.request.data,
      name: ctx.fullName,
      headers,
      logger: this.logger
    });
  }

  /** Construct the request object a proxied method call returns. */
  private createMethod(
    apiClass: new () => object,
    api: object,
    apiOptions: ReturnType<typeof resolveApiOptions>,
    descriptor: Extract<MethodDescriptor, { kind: "request" }>,
    args: unknown[]
  ): SnailMethod<any, any, any, any, any> {
    const { methodName, methodType, route, methodOptions, headers, descriptors } = descriptor;

    return new SnailMethod(
      {
        server: this as unknown as SnailServer<any, any, any, any>,
        pluginManager: this.pluginManager,
        axios: this.axios,
        apiClass,
        api,
        apiName: apiOptions.name || apiClass.name,
        apiOptions,
        serverOptions: this.options,
        methodName,
        methodType,
        route,
        methodOptions,
        descriptors,
        headers,
        logger: this.logger,
        requestConfig: () =>
          buildBaseRequestConfig({
            serverOptions: this.options,
            apiOptions,
            methodOptions,
            methodType,
            headers
          })
      },
      args
    );
  }
}

/** Everything static about one decorated member, resolved once per api class. */
type MethodDescriptor =
  | {
      kind: "request";
      methodName: string;
      methodType: SnailMethodType;
      route: string;
      methodOptions: SnailMethodOptions & { url: string };
      headers: AxiosHeaders;
      descriptors: readonly SnailParamDescriptor[];
    }
  | {
      kind: "stream";
      methodName: string;
      methodType: SnailMethodType;
      route: string;
      streamOptions: SnailHttpStreamOptions;
      headers: AxiosHeaders;
      descriptors: readonly SnailParamDescriptor[];
    };
