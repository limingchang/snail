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
import { attachMethodContext, attachServerContext } from "./method-context";
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
 * 服务器基类。
 *
 * 继承它、用 `@Server(...)` 装饰子类，然后实例化一次：
 *
 * ```ts
 * @Server({ baseURL: "/api", timeout: 5000 })
 * class BackEnd extends SnailServer {}
 *
 * export const Service = new BackEnd();
 * ```
 *
 * 实例持有一个 axios 实例、一份插件注册表和已解析的选项。它在模块加载时就被
 * 创建，因此 `use()` 既同步又可以链式调用：`Service.use(A()).use(B())`。
 *
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
  /**
   * 服务器名 —— 取自 `@Server({ name })`，否则用子类名。
   *
   * Server name — `@Server({ name })` or the subclass name.
   */
  readonly name: string;

  /**
   * 已补齐默认值的选项。
   *
   * Fully resolved options, defaults applied.
   */
  readonly options: ResolvedServerOptions;

  /**
   * 该服务器所有请求都会经过的 axios 实例。
   *
   * The axios instance every request of this server goes through.
   */
  readonly axios: AxiosInstance;

  /**
   * 该服务器的插件注册表。
   *
   * This server's plugin registry.
   */
  readonly pluginManager: PluginManager;

  private readonly logger;
  private readonly apiCache = new WeakMap<object, unknown>();

  /**
   * 解析本类的 `@Server(...)` 选项并装配实例。
   *
   * axios 实例刻意用裸的 `axios.create()`：所有选项都随每次请求的配置传递，
   * 默认值因此只有一处应用，而不是两个互相竞争的层次。`configureServer` 钩子
   * 在管理器建好之后运行，所以插件可以在这里再注册另一个插件。
   *
   * Resolve this class's `@Server(...)` options and assemble the instance.
   *
   * @throws 子类未标注 `@Server(...)` 或 `baseURL` 非法时抛出 `SnailOptionsError` /
   *   `SnailOptionsError` when the subclass is not decorated or `baseURL` is invalid.
   */
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
   * 注册一个插件。
   *
   * 同步且可链式调用。校验（名字、重复、`dependsOn`）会立即抛错；异步的
   * `install` 钩子则通过管理器的 `ready` promise，在第一个请求之前被 await 一次。
   *
   * Register a plugin.
   *
   * Synchronous and chainable. Validation (name, duplicates, `dependsOn`) throws
   * immediately; an async `install` hook is awaited once, before the first
   * request, via the manager's `ready` promise.
   *
   * @param plugin 插件对象，或其工厂函数 / A plugin object, or its factory function.
   * @returns 服务器自身，便于链式调用 / This server, for chaining.
   */
  use(plugin: SnailPluginObject<any> | SnailPlugin<any>): this {
    const instance = typeof plugin === "function" ? plugin() : plugin;
    this.pluginManager.register(instance);
    return this;
  }

  /**
   * 按实例或名字注销一个插件。
   *
   * 找不到对应名字时返回 `false` 而不抛错，因此重复注销是安全的。
   *
   * Unregister a plugin by instance or by name.
   *
   * @param plugin 插件实例或其名字 / The plugin instance or its name.
   * @returns 确实移除了则为 `true` / `true` when a plugin was actually removed.
   */
  async remove(plugin: SnailPluginObject<any> | string): Promise<boolean> {
    const name = typeof plugin === "string" ? plugin : plugin?.name;
    if (!name || !this.pluginManager.has(name)) return false;
    await this.pluginManager.remove(name);
    return true;
  }

  /**
   * 是否已注册该名字的插件。
   *
   * `true` when a plugin with this name is registered.
   *
   * @param name 插件名 / The plugin name.
   * @returns 已注册时为 `true` / `true` when it is registered.
   */
  hasPlugin(name: string): boolean {
    return this.pluginManager.has(name);
  }

  /**
   * 已注册的插件名，按链序排列。
   *
   * Registered plugin names, in chain order.
   */
  get plugins(): readonly string[] {
    return this.pluginManager.names();
  }

  /**
   * 把一个带装饰器的 api 类变成「方法即请求工厂」的代理。
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
   * 声明的返回类型——上面的 `Promise<User>`——就是载荷类型，所以 `data` 无须显式
   * 泛型即为 `User`。同一个 api 类的代理会被缓存并复用，方法描述也只是按需解析
   * 一次，因此插件对方法选项的修改不会变成每请求一次。
   *
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
   *
   * @param apiClass 带装饰器的 api 类 / The decorated api class.
   * @returns 方法调用会返回请求对象的代理 / A proxy whose method calls return requests.
   * @throws api 选项非法时抛出 `SnailOptionsError` /
   *   `SnailOptionsError` when the api options are invalid.
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

        // The description rides on the factory so a `use*` strategy can read this
        // server's `stateAdapter` and envelope keys synchronously, before any
        // `SnailMethod` exists. That is what removed the process-global adapter
        // registry. See `core/method-context.ts`.
        return attachMethodContext(
          (...args: unknown[]) =>
            this.createMethod(apiClass, target, apiOptions, descriptor, args),
          {
            serverOptions: this.options,
            apiName: apiOptions.name || apiClass.name,
            methodName: descriptor.methodName,
            methodType: descriptor.methodType
          }
        );
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
   * 把标注了 `@Sse(...)` 的类变成端点工厂。
   *
   * ```ts
   * @Sse("/events")
   * class Events { @SseEvent() onMessage(m: SnailSseMessage) {} }
   *
   * const events = Service.createSse(Events);
   * const connection = events.open();
   * ```
   *
   * 端点带上本服务器的选项，`useSSE(endpoint)` 因此能与驱动方法的 `use*` 钩子
   * 一样继承服务器的 `stateAdapter`。
   *
   * Turn a class decorated with `@Sse(...)` into an endpoint factory.
   *
   * ```ts
   * @Sse("/events")
   * class Events { @SseEvent() onMessage(m: SnailSseMessage) {} }
   *
   * const events = Service.createSse(Events);
   * const connection = events.open();
   * ```
   *
   * @param sseClass 带 `@Sse(...)` 的类 / The class decorated with `@Sse(...)`.
   * @returns 可以 `open()` 的 SSE 端点 / The SSE endpoint, opened with `open()`.
   * @throws 类上缺少 `@Sse()` 时抛出 `SnailDecoratorError` /
   *   `SnailDecoratorError` when the class lacks `@Sse()`.
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

    // The endpoint carries this server's options so `useSSE(endpoint)` inherits the
    // server's `stateAdapter` exactly like a `use*` hook driving a method does.
    return attachServerContext(
      {
        open: () =>
          createSseConnection({
            url: buildRequestURL(this.options.baseURL, endpoint.url),
            options: endpoint.options,
            handlers: rebindSseHandlers(endpoint.handlers, instance),
            name: `${this.options.name}.${sseClass.name}`,
            logger: this.logger
          })
      },
      this.options
    );
  }

  /**
   * 把标注了 `@WebSocket(...)` 的类变成端点工厂。
   *
   * ```ts
   * @WebSocket("/ws")
   * class Chat { @OnWsMessage() incoming(event: MessageEvent) {} }
   *
   * const chat = Service.createWebSocket(Chat);
   * const socket = chat.open();
   * socket.send({ hello: "world" });
   * ```
   *
   * 与 {@link SnailServer.createSse} 一样，端点携带服务器的选项；url 会先把
   * `http(s)` 前缀换成 `ws(s)` 再交给平台 socket。
   *
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
   *
   * @param wsClass 带 `@WebSocket(...)` 的类 / The class decorated with `@WebSocket(...)`.
   * @returns 可以 `open()` 的 WebSocket 端点 / The WebSocket endpoint, opened with `open()`.
   * @throws 类上缺少 `@WebSocket()` 时抛出 `SnailDecoratorError` /
   *   `SnailDecoratorError` when the class lacks `@WebSocket()`.
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

    return attachServerContext(
      {
        open: () =>
          createWsConnection({
            url: toWebSocketURL(buildRequestURL(this.options.baseURL, endpoint.url)),
            options: endpoint.options,
            handlers: rebindWsHandlers(endpoint.handlers, instance),
            name: `${this.options.name}.${wsClass.name}`,
            logger: this.logger
          })
      },
      this.options
    );
  }

  /**
   * 发送一个**不**依赖已装饰 api 类的一次性请求。
   *
   * 这是一条逃生通道，而且刻意做得很薄：它 await 插件安装完成，然后直接调用
   * axios 实例。**不会运行任何生命周期钩子**——没有 `beforeRequest`、没有
   * `afterResponse`、没有缓存、没有校验、没有响应转换——信封也*不会*被拆开，
   * 拿到的就是原始 `AxiosResponse`。
   *
   * 凡是应当参与插件流水线的调用，都请优先使用已装饰的 api 方法。只有确实
   * 无处安放于服务定义的调用（例如对第三方的健康检查）才用它。
   *
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
   *
   * @param config 请求配置；`baseURL` 与 `timeout` 会被服务器的值补在前面 /
   *   The request config; the server's `baseURL` and `timeout` are applied first.
   * @returns 未经处理的 axios 响应 / The raw axios response.
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

  /**
   * 卸载所有插件，并运行它们的清理钩子。
   *
   * Uninstall every plugin, running their cleanup hooks.
   */
  async dispose(): Promise<void> {
    await this.pluginManager.clear();
  }

  /**
   * 供工具和测试使用的元数据快照。
   *
   * Metadata helper for tooling and tests.
   *
   * @returns 名称、关键选项与插件清单 / The name, key options and plugin list.
   */
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
   * 解析一个已装饰方法上的全部静态信息。
   *
   * 每个 api 类的每个方法只解析一次。非端点成员返回 `null`，因此 api 类可以在请求
   * 方法旁边保留普通辅助方法。
   *
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
   * 构建 `@HttpStream` 方法背后的流控制器。
   *
   * 这里构造的是真实上下文而非仿制品，因此 `@Query()` / `@Data()` /
   * `@HeaderValue()` 解析器的行为与普通请求完全一致。插件管线被刻意跳过：
   * 字节流没有可供缓存或校验的信封。
   *
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

  /**
   * 构造被代理方法调用所返回的请求对象。
   *
   * Construct the request object a proxied method call returns.
   */
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

/**
 * 一个已装饰成员的全部静态信息，每个 api 类只解析一次。
 *
 * Everything static about one decorated member, resolved once per api class.
 */
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
