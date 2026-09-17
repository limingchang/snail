/** Types for the SSE / WebSocket / HTTP-stream transports. */

/** Backoff policy shared by the reconnecting transports. */
export interface SnailReconnectPolicy {
  /** Extra attempts after the first failure. Defaults to `3`. */
  retries?: number;
  /** First delay in milliseconds. Defaults to `1000`. */
  delayMs?: number;
  /** Upper bound for the delay. Defaults to `30000`. */
  maxDelayMs?: number;
  /** Multiplier applied to the delay after each failure. Defaults to `2`. */
  factor?: number;
  /** Add random jitter to avoid a thundering herd. Defaults to `true`. */
  jitter?: boolean;
}

/** One decoded server-sent event. */
export interface SnailSseMessage {
  /** Event name — `"message"` for the default event. */
  event: string;
  /** Raw payload text. */
  data: string;
  /** `id:` field, when the server sent one. */
  id: string;
  /** `retry:` hint in milliseconds, when the server sent one. */
  retry: number | undefined;
}

/** Options accepted by `@Sse(path, options)`. */
export interface SnailSseOptions {
  /** Request method. Defaults to `"GET"`. */
  method?: "GET" | "POST";
  /** Send cookies and auth headers cross-site. */
  withCredentials?: boolean;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Static request body, useful with `method: "POST"`. */
  data?: unknown;
  /** Auto-reconnect policy, or `false` to disable reconnecting. */
  reconnect?: false | SnailReconnectPolicy;
}

/** Options accepted by `@WebSocket(path, options)`. */
export interface SnailWsOptions {
  /** Sub-protocols passed to the `WebSocket` constructor. */
  protocols?: string | string[];
  /** Auto-reconnect policy, or `false` to disable reconnecting. */
  reconnect?: false | SnailReconnectPolicy;
  /**
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
  /** Queue messages sent while the socket is still connecting. Defaults to `true`. */
  queueWhileConnecting?: boolean;
}

/** Options accepted by `@HttpStream(path, options)`. */
export interface SnailHttpStreamOptions {
  /** Request method. Defaults to `"POST"`. */
  method?: import("./api").SnailMethodType;
  /** Request headers, typically `{ accept: "text/event-stream" }`. */
  headers?: Record<string, string>;
  /** Decode each chunk as UTF-8 text rather than raw bytes. Defaults to `true`. */
  decodeText?: boolean;
  /** Split the stream into lines instead of raw chunks. Defaults to `false`. */
  lineDelimited?: boolean;
}

/**
 * A live connection returned by `open()`.
 *
 * `Symbol.asyncDispose` is implemented so a connection can be driven with
 * `await using` in runtimes that support explicit resource management.
 */
export interface SnailConnection {
  /** Close the connection and release its resources. */
  close(): void;
  /** `true` while the transport is connected. */
  connected: boolean;
  /** Resolves once the connection is established. */
  readonly opened: Promise<void>;
  /** Resolves once the connection is closed, for any reason. */
  readonly closed: Promise<void>;

  /**
   * Release the connection with `using` / `await using`.
   *
   * Both are attached at runtime whenever the running engine provides the well
   * known symbols, and simply absent otherwise — so `close()` remains the one
   * portable way to release a connection.
   */
  [Symbol.dispose]?(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
}

/**
 * A WebSocket connection.
 *
 * `send` while the socket is still connecting queues the message (unless
 * `queueWhileConnecting: false`), because a caller that just called `open()`
 * should not have to race the handshake.
 */
export interface SnailSocketConnection extends SnailConnection {
  /** Send a value, serialised according to the `serializer` option. */
  send(data: unknown): void;
}

/**
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
  /** Iterate the decoded chunks. */
  [Symbol.asyncIterator](): AsyncIterator<string>;
  /** Buffer the whole stream into a single string. */
  text(): Promise<string>;
}

/**
 * A Server-Sent Events connection.
 *
 * Carries a message surface of its own, on top of the shared connection handle.
 * Without it the parsed events would only ever reach the decorated class's
 * `@SseEvent()` handlers, so a hook like `useSSE` — which needs to observe the
 * stream itself — would have nothing to subscribe to.
 */
export interface SnailSseConnection extends SnailConnection {
  /** Subscribe to every decoded event, whatever its name. Returns an unsubscribe. */
  onMessage(listener: (message: SnailSseMessage) => void): () => void;

  /** Subscribe to one named event. Returns an unsubscribe function. */
  on(event: string, listener: (message: SnailSseMessage) => void): () => void;
}

/**
 * A Server-Sent Events endpoint created by `Service.createSse(EventStream)`.
 *
 * Nothing connects until `open()` is called, and every call to `open()` creates
 * an independent connection with its own reconnect loop.
 */
export interface SnailSseEndpoint {
  /** Open a connection and return its handle. */
  open(): SnailSseConnection;
}

/** A WebSocket endpoint created by `Service.createWebSocket(ChatSocket)`. */
export interface SnailWsEndpoint {
  /** Open a connection and return its handle. */
  open(): SnailSocketConnection;
}
