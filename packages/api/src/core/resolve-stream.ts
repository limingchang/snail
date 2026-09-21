import type { SnailSseHandlers, SnailWsHandlers } from "../decorators/stream";
import type {
  SnailHttpStreamOptions,
  SnailSseOptions,
  SnailWsOptions
} from "../typings/stream";import { getMetadata } from "./metadata";
import {
  SNAIL_HTTP_STREAM,
  SNAIL_SSE_HANDLERS,
  SNAIL_SSE_OPTIONS,
  SNAIL_WS_HANDLERS,
  SNAIL_WS_OPTIONS
} from "./metadata.keys";

/**
 * 解析后的 `@Sse` 端点描述。
 *
 * Resolved description of an `@Sse` endpoint.
 */
export interface ResolvedSseEndpoint {
  /**
   * 完整的端点 url（来自 `@Sse(path)`）。
   *
   * The endpoint url, taken from `@Sse(path)`.
   */
  url: string;
  /**
   * `@Sse(path, options)` 中声明的选项。
   *
   * The options declared by `@Sse(path, options)`.
   */
  options: SnailSseOptions;
  /**
   * 由流装饰器登记的处理函数。
   *
   * The handlers registered by the stream decorators.
   */
  handlers: SnailSseHandlers;
}

/**
 * 解析后的 `@WebSocket` 端点描述。
 *
 * Resolved description of an `@WebSocket` endpoint.
 */
export interface ResolvedWsEndpoint {
  /**
   * 完整的端点 url（来自 `@WebSocket(path)`）。
   *
   * The endpoint url, taken from `@WebSocket(path)`.
   */
  url: string;
  /**
   * `@WebSocket(path, options)` 中声明的选项。
   *
   * The options declared by `@WebSocket(path, options)`.
   */
  options: SnailWsOptions;
  /**
   * 由 WebSocket 装饰器登记的处理函数。
   *
   * The handlers registered by the WebSocket decorators.
   */
  handlers: SnailWsHandlers;
}

/**
 * 解析后的 `@HttpStream` 方法描述。
 *
 * Resolved description of an `@HttpStream` method.
 */
export interface ResolvedHttpStreamEndpoint {
  /**
   * 该方法的 url（来自 `@HttpStream(path)`）。
   *
   * The method url, taken from `@HttpStream(path)`.
   */
  url: string;
  /**
   * `@HttpStream(path, options)` 中声明的选项。
   *
   * The options declared by `@HttpStream(path, options)`.
   */
  options: SnailHttpStreamOptions;
}

const EMPTY_SSE_HANDLERS: SnailSseHandlers = { open: [], error: [], events: [] };
const EMPTY_WS_HANDLERS: SnailWsHandlers = {
  open: [],
  message: [],
  close: [],
  error: []
};

/**
 * 读取 `@Sse(...)` 的选项及其登记的处理函数。
 *
 * 未标注该装饰器的类返回 `undefined`，由调用方决定如何报错；处理函数缺失时
 * 回退到空集合，url 缺失时回退到空串，因此返回值总是完整的端点描述。
 *
 * Read the `@Sse(...)` options and its registered handlers.
 *
 * @param streamClass 被 `@Sse(...)` 标注的类 / The class decorated with `@Sse(...)`.
 * @returns 解析后的端点；该类未标注时为 `undefined` /
 *   The resolved endpoint, or `undefined` when the class is not decorated.
 */
export function resolveSseEndpoint(
  streamClass: unknown
): ResolvedSseEndpoint | undefined {
  const declared = getMetadata<SnailSseOptions & { url: string }>(
    SNAIL_SSE_OPTIONS,
    streamClass
  );
  if (!declared) return undefined;

  return {
    url: declared.url ?? "",
    options: declared,
    handlers:
      getMetadata<SnailSseHandlers>(SNAIL_SSE_HANDLERS, streamClass) ??
      EMPTY_SSE_HANDLERS
  };
}

/**
 * 读取 `@WebSocket(...)` 的选项及其登记的处理函数。
 *
 * 与 {@link resolveSseEndpoint} 同构：未标注返回 `undefined`，处理函数与 url
 * 各自有兜底值。
 *
 * Read the `@WebSocket(...)` options and its registered handlers.
 *
 * @param streamClass 被 `@WebSocket(...)` 标注的类 /
 *   The class decorated with `@WebSocket(...)`.
 * @returns 解析后的端点；该类未标注时为 `undefined` /
 *   The resolved endpoint, or `undefined` when the class is not decorated.
 */
export function resolveWsEndpoint(
  streamClass: unknown
): ResolvedWsEndpoint | undefined {
  const declared = getMetadata<SnailWsOptions & { url: string }>(
    SNAIL_WS_OPTIONS,
    streamClass
  );
  if (!declared) return undefined;

  return {
    url: declared.url ?? "",
    options: declared,
    handlers:
      getMetadata<SnailWsHandlers>(SNAIL_WS_HANDLERS, streamClass) ??
      EMPTY_WS_HANDLERS
  };
}

/**
 * 读取某个方法上 `@HttpStream(...)` 的选项。
 *
 * 元数据按「类 + 方法名」查找，因此同一个类里的多个流式方法互不干扰。
 *
 * Read the `@HttpStream(...)` options of one method.
 *
 * @param apiClass 承载该方法的类 / The class that owns the method.
 * @param methodName 方法名 / The method name.
 * @returns 解析后的端点；该方法未标注时为 `undefined` /
 *   The resolved endpoint, or `undefined` when the method is not decorated.
 */
export function resolveHttpStreamEndpoint(
  apiClass: unknown,
  methodName: string
): ResolvedHttpStreamEndpoint | undefined {
  const declared = getMetadata<SnailHttpStreamOptions & { url: string }>(
    SNAIL_HTTP_STREAM,
    apiClass,
    methodName
  );
  if (!declared) return undefined;
  return { url: declared.url ?? "", options: declared };
}

/**
 * 把 http(s) 的 `baseURL` 换成对应的 WebSocket 源。
 *
 * 只改协议头，其余部分原样保留。相对 `baseURL`（浏览器里的常见情形）也能
 * 继续工作：`new WebSocket` 会按文档基准解析相对 url，但协议仍必须显式升级，
 * 这正是本函数要做的事。
 *
 * Turn an http(s) `baseURL` into the matching WebSocket origin.
 *
 * `https://api.example.com` → `wss://api.example.com`. A relative `baseURL`
 * (the common browser case) keeps working because `new WebSocket` resolves a
 * relative url against the document base — but the scheme still has to be
 * upgraded explicitly, which is what this does.
 *
 * @param url 原始 url / The source url.
 * @returns 升级协议后的 url；其他协议原样返回 /
 *   The url with an upgraded scheme, unchanged for any other scheme.
 */
export function toWebSocketURL(url: string): string {
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return url;
}

/**
 * 把每个 SSE 处理函数绑定到真正接收事件的实例上。
 *
 * 装饰器只能看到原型，因此原始函数被原样记录，在这里才绑定——每次 `open()`
 * 绑定一次，绑定到 `createSse` 实际创建的那个实例上。返回的是新对象与新的
 * 函数引用，原记录不会被修改。
 *
 * Bind every SSE handler to the instance that will receive the events.
 *
 * Decorators only ever see the prototype, so the raw functions are stored and
 * bound here — one binding per `open()`, against the instance actually created by
 * `createSse`.
 *
 * @param handlers 装饰器登记的原始处理函数 / The raw handlers from the decorators.
 * @param instance 接收事件的实例 / The instance that will receive the events.
 * @returns 绑定到该实例的处理函数副本 / A copy of the handlers bound to `instance`.
 */
export function rebindSseHandlers(
  handlers: SnailSseHandlers,
  instance: object
): SnailSseHandlers {
  return {
    open: handlers.open.map((fn) => fn.bind(instance)),
    error: handlers.error.map((fn) => fn.bind(instance)),
    events: handlers.events.map((entry) => ({
      event: entry.event,
      handler: entry.handler.bind(instance)
    }))
  };
}

/**
 * 把每个 WebSocket 处理函数绑定到实例上。
 *
 * 与 {@link rebindSseHandlers} 同理，只是处理函数按 `open` / `message` /
 * `close` / `error` 四类平铺登记。
 *
 * Bind every WebSocket handler to the instance. @see rebindSseHandlers
 *
 * @param handlers 装饰器登记的原始处理函数 / The raw handlers from the decorators.
 * @param instance 接收事件的实例 / The instance that will receive the events.
 * @returns 绑定到该实例的处理函数副本 / A copy of the handlers bound to `instance`.
 */
export function rebindWsHandlers(
  handlers: SnailWsHandlers,
  instance: object
): SnailWsHandlers {
  return {
    open: handlers.open.map((fn) => fn.bind(instance)),
    message: handlers.message.map((fn) => fn.bind(instance)),
    close: handlers.close.map((fn) => fn.bind(instance)),
    error: handlers.error.map((fn) => fn.bind(instance))
  };
}
