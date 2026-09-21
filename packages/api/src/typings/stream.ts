/**
 * SSE / WebSocket / HTTP 流式传输的类型定义。
 *
 * Types for the SSE / WebSocket / HTTP-stream transports.
 */

/**
 * 可重连的传输方式共用的退避策略。
 *
 * Backoff policy shared by the reconnecting transports.
 */
export interface SnailReconnectPolicy {
  /**
   * 首次失败后的额外尝试次数。默认为 `3`。
   *
   * Extra attempts after the first failure. Defaults to `3`.
   */
  retries?: number;
  /**
   * 首次延迟毫秒数。默认为 `1000`。
   *
   * First delay in milliseconds. Defaults to `1000`.
   */
  delayMs?: number;
  /**
   * 延迟的上限。默认为 `30000`。
   *
   * Upper bound for the delay. Defaults to `30000`.
   */
  maxDelayMs?: number;
  /**
   * 每次失败后延迟所乘的倍数。默认为 `2`。
   *
   * Multiplier applied to the delay after each failure. Defaults to `2`.
   */
  factor?: number;
  /**
   * 加入随机抖动以避免惊群。默认为 `true`。
   *
   * Add random jitter to avoid a thundering herd. Defaults to `true`.
   */
  jitter?: boolean;
}

/**
 * 一条已解码的服务端发送事件（SSE）。
 *
 * One decoded server-sent event.
 */
export interface SnailSseMessage {
  /**
   * 事件名 —— 默认事件为 `"message"`。
   *
   * Event name — `"message"` for the default event.
   */
  event: string;
  /**
   * 原始载荷文本。
   *
   * Raw payload text.
   */
  data: string;
  /**
   * `id:` 字段，服务端有发送时存在。
   *
   * `id:` field, when the server sent one.
   */
  id: string;
  /**
   * `retry:` 提示（毫秒），服务端有发送时存在。
   *
   * `retry:` hint in milliseconds, when the server sent one.
   */
  retry: number | undefined;
}

/**
 * `@Sse(path, options)` 接受的选项。
 *
 * Options accepted by `@Sse(path, options)`.
 */
export interface SnailSseOptions {
  /**
   * 请求方法。默认为 `"GET"`。
   *
   * Request method. Defaults to `"GET"`.
   */
  method?: "GET" | "POST";
  /**
   * 跨站时发送 cookie 与认证头。
   *
   * Send cookies and auth headers cross-site.
   */
  withCredentials?: boolean;
  /**
   * 额外请求头。
   *
   * Extra request headers.
   */
  headers?: Record<string, string>;
  /**
   * 静态请求体，配合 `method: "POST"` 使用。
   *
   * Static request body, useful with `method: "POST"`.
   */
  data?: unknown;
  /**
   * 自动重连策略，或 `false` 关闭重连。
   *
   * Auto-reconnect policy, or `false` to disable reconnecting.
   */
  reconnect?: false | SnailReconnectPolicy;
}

/**
 * `@WebSocket(path, options)` 接受的选项。
 *
 * Options accepted by `@WebSocket(path, options)`.
 */
export interface SnailWsOptions {
  /**
   * 传给 `WebSocket` 构造函数的子协议。
   *
   * Sub-protocols passed to the `WebSocket` constructor.
   */
  protocols?: string | string[];
  /**
   * 自动重连策略，或 `false` 关闭重连。
   *
   * Auto-reconnect policy, or `false` to disable reconnecting.
   */
  reconnect?: false | SnailReconnectPolicy;
  /**
   * `send()` 使用的序列化器。
   * - `"json"`（默认）→ `JSON.stringify`
   * - `"text"` → `String(value)`
   * - 一对自定义函数
   *
   * Serialiser used by `send()`.
   * - `"json"` (default) → `JSON.stringify`
   * - `"text"` → `String(value)`
   * - a custom pair of functions
   */
  serializer?:
    | "json"
    | "text"
    | {
        serialize?: (value: unknown) => string | ArrayBufferLike | Blob | ArrayBufferView;
        deserialize?: (raw: string) => unknown;
      };
  /**
   * 套接字仍在连接时发送的消息是否排队。默认为 `true`。
   *
   * Queue messages sent while the socket is still connecting. Defaults to `true`.
   */
  queueWhileConnecting?: boolean;
}

/**
 * `@HttpStream(path, options)` 接受的选项。
 *
 * Options accepted by `@HttpStream(path, options)`.
 */
export interface SnailHttpStreamOptions {
  /**
   * 请求方法。默认为 `"POST"`。
   *
   * Request method. Defaults to `"POST"`.
   */
  method?: import("./api").SnailMethodType;
  /**
   * 请求头，通常是 `{ accept: "text/event-stream" }`。
   *
   * Request headers, typically `{ accept: "text/event-stream" }`.
   */
  headers?: Record<string, string>;
  /**
   * 把每个分片按 UTF-8 文本而不是原始字节解码。默认为 `true`。
   *
   * Decode each chunk as UTF-8 text rather than raw bytes. Defaults to `true`.
   */
  decodeText?: boolean;
  /**
   * 把流按行切分而不是按原始分片。默认为 `false`。
   *
   * Split the stream into lines instead of raw chunks. Defaults to `false`.
   */
  lineDelimited?: boolean;
}

/**
 * `open()` 返回的活动连接。
 *
 * 它实现了 `Symbol.asyncDispose`，因此在支持显式资源管理的运行时里可以用
 * `await using` 驱动连接。
 *
 * A live connection returned by `open()`.
 *
 * `Symbol.asyncDispose` is implemented so a connection can be driven with
 * `await using` in runtimes that support explicit resource management.
 */
export interface SnailConnection {
  /**
   * 关闭连接并释放其资源。
   *
   * Close the connection and release its resources.
   */
  close(): void;
  /**
   * 传输层已连接时为 `true`。
   *
   * `true` while the transport is connected.
   */
  connected: boolean;
  /**
   * 连接建立后 resolve。
   *
   * Resolves once the connection is established.
   */
  readonly opened: Promise<void>;
  /**
   * 连接关闭后 resolve（无论何种原因）。
   *
   * Resolves once the connection is closed, for any reason.
   */
  readonly closed: Promise<void>;

  /**
   * 用 `using` / `await using` 释放连接。
   *
   * 只要运行引擎提供这些众所周知的 symbol，两者都会在运行时挂上，否则直接缺席
   * —— 因此 `close()` 始终是释放连接唯一可移植的方式。
   *
   * Release the connection with `using` / `await using`.
   *
   * Both are attached at runtime whenever the running engine provides the well
   * known symbols, and simply absent otherwise — so `close()` remains the one
   * portable way to release a connection.
   */
  [Symbol.dispose]?(): void;
  /**
   * 用 `await using` 异步释放连接。
   *
   * Release the connection asynchronously with `await using`.
   */
  [Symbol.asyncDispose]?(): Promise<void>;
}

/**
 * 一个 WebSocket 连接。
 *
 * 套接字仍在连接时调用 `send` 会把消息排队（除非 `queueWhileConnecting: false`），
 * 因为刚调用 `open()` 的调用方不应该去和握手竞争。
 *
 * A WebSocket connection.
 *
 * `send` while the socket is still connecting queues the message (unless
 * `queueWhileConnecting: false`), because a caller that just called `open()`
 * should not have to race the handshake.
 */
export interface SnailSocketConnection extends SnailConnection {
  /**
   * 发送一个值，按 `serializer` 选项序列化。
   *
   * Send a value, serialised according to the `serializer` option.
   */
  send(data: unknown): void;
}

/**
 * 一个流式 HTTP 响应。
 *
 * 连接本身是异步可迭代的，因此可以直接用 `for await ... of` 消费，见下方示例。
 *
 * A streaming HTTP response.
 *
 * The connection is itself async-iterable, so it can be consumed directly:
 *
 * ```ts
 * const stream = aiApi.chat(payload);
 * for await (const chunk of stream) process(chunk);
 * ```
 */
export interface SnailHttpStreamConnection extends SnailConnection {
  /**
   * 迭代已解码的分片。
   *
   * Iterate the decoded chunks.
   */
  [Symbol.asyncIterator](): AsyncIterator<string>;
  /**
   * 把整个流缓冲成一个字符串。
   *
   * Buffer the whole stream into a single string.
   */
  text(): Promise<string>;
}

/**
 * 一个 Server-Sent Events 连接。
 *
 * 它在共享连接句柄之上还带有自己的消息接口。没有它，解析出的事件就只能到达被
 * 装饰类的 `@SseEvent()` 处理器，`useSSE` 这类需要自己观察流的钩子将无从订阅。
 *
 * A Server-Sent Events connection.
 *
 * Carries a message surface of its own, on top of the shared connection handle.
 * Without it the parsed events would only ever reach the decorated class's
 * `@SseEvent()` handlers, so a hook like `useSSE` — which needs to observe the
 * stream itself — would have nothing to subscribe to.
 */
export interface SnailSseConnection extends SnailConnection {
  /**
   * 订阅所有已解码事件（无论名称）。返回取消订阅函数。
   *
   * Subscribe to every decoded event, whatever its name. Returns an unsubscribe.
   */
  onMessage(listener: (message: SnailSseMessage) => void): () => void;

  /**
   * 订阅某个具名事件。返回取消订阅函数。
   *
   * Subscribe to one named event. Returns an unsubscribe function.
   */
  on(event: string, listener: (message: SnailSseMessage) => void): () => void;
}

/**
 * 由 `Service.createSse(EventStream)` 创建的 Server-Sent Events 端点。
 *
 * 在调用 `open()` 之前不会建立任何连接，且每次调用 `open()` 都会创建一条独立的
 * 连接及其自身的重连循环。
 *
 * A Server-Sent Events endpoint created by `Service.createSse(EventStream)`.
 *
 * Nothing connects until `open()` is called, and every call to `open()` creates
 * an independent connection with its own reconnect loop.
 */
export interface SnailSseEndpoint {
  /**
   * 打开一条连接并返回其句柄。
   *
   * Open a connection and return its handle.
   */
  open(): SnailSseConnection;
}

/**
 * 由 `Service.createWebSocket(ChatSocket)` 创建的 WebSocket 端点。
 *
 * A WebSocket endpoint created by `Service.createWebSocket(ChatSocket)`.
 */
export interface SnailWsEndpoint {
  /**
   * 打开一条连接并返回其句柄。
   *
   * Open a connection and return its handle.
   */
  open(): SnailSocketConnection;
}
