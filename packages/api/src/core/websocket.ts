import { SnailRequestError } from "../error/request";
import { t } from "../locale";
import type { SnailSocketConnection, SnailWsOptions } from "../typings/stream";
import type { SnailWsHandlers } from "../decorators/stream";
import { deferred } from "../utils/object";
import { withDispose } from "./connection";
import { backoffDelay, canRetry, resolveReconnectPolicy } from "./reconnect";
import type { SnailLogger } from "./logger";

/**
 * WebSocket 传输层所需的全部信息。
 *
 * Everything the WebSocket transport needs.
 */
export interface WsConnectionInit {
  /**
   * 完整的 `ws://` / `wss://` url。
   *
   * Fully qualified `ws://` / `wss://` url.
   */
  url: string;
  /**
   * 来自 `@WebSocket(path, options)` 的选项。
   *
   * Options from `@WebSocket(path, options)`.
   */
  options: SnailWsOptions;
  /**
   * 由装饰器登记的处理函数。
   *
   * Handlers registered by the decorators.
   */
  handlers: SnailWsHandlers;
  /**
   * 日志行里使用的名字。
   *
   * Name used in log lines.
   */
  name: string;
  /**
   * 日志器。
   *
   * Logger.
   */
  logger: SnailLogger;
}

/**
 * 带重连和发送队列的 WebSocket。
 *
 * 两件平台原生 socket 不提供、而几乎每个真实应用最终都要自己写一遍的事：
 *
 * - **退避重连** —— `close` 是常态；没有策略时，网络抖一下 socket 就永久死掉。
 * - **开连前排队发送** —— `open()` 立即返回，调用方若在下一行立刻 `send`，
 *   原生实现会抛 `InvalidStateError`。
 *
 * 未提供 `reconnect` 时默认重试 3 次；`queueWhileConnecting` 默认为 `true`，
 * 关闭它则未连上就发送会直接抛错。连接仅在某次尝试真正 open 之后才 resolve
 * `opened`。
 *
 * WebSocket with reconnecting and an outbound queue.
 *
 * Two behaviours the platform socket does not give you, and which every real
 * application ends up writing by hand:
 *
 * - **Reconnect with backoff** — `close` is normal; without a policy the socket
 *   simply stays dead after a blip.
 * - **Send-before-open queueing** — `open()` returns immediately, so a caller
 *   that sends on the next line would otherwise throw `InvalidStateError`.
 *
 * @param init 建立连接所需的全部信息 / Everything needed to open the connection.
 * @returns 可发送、可关闭、可重连的 socket 连接 /
 *   A socket connection that can send, close and reconnect.
 */
export function createWsConnection(init: WsConnectionInit): SnailSocketConnection {
  const { url, options, handlers, name, logger } = init;
  const policy = resolveReconnectPolicy(options.reconnect ?? { retries: 3 });
  const serializer = normalizeSerializer(options.serializer);
  const queueWhileConnecting = options.queueWhileConnecting ?? true;

  const opened = deferred<void>();
  const closed = deferred<void>();

  // Marked handled so a connection that never opens does not become an unhandled
  // rejection when the caller only ever calls `send()`/`close()`.
  void opened.promise.catch(() => undefined);

  let socket: WebSocket | undefined;
  let connected = false;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: unknown[] = [];

  const emit = <K extends keyof SnailWsHandlers>(
    kind: K,
    event: SnailWsHandlers[K] extends Array<(event: infer E) => void> ? E : never
  ): void => {
    for (const handler of handlers[kind] as Array<(event: unknown) => void>) {
      try {
        handler(event);
      } catch (error) {
        logger.error(`[snail] ${name} WS ${kind} handler threw`, error);
      }
    }
  };

  const flush = (): void => {
    if (!socket || !connected || queue.length === 0) return;
    const pending = queue;
    queue = [];
    for (const message of pending) {
      socket.send(serializer.serialize(message));
    }
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;

    if (!policy || !canRetry(attempt + 1, policy)) {
      if (!connected) {
        opened.reject(
          new SnailRequestError(
            t("error.request.failed", name, `WebSocket failed after ${attempt} attempt(s)`)
          )
        );
      }
      stopped = true;
      closed.resolve();
      return;
    }

    attempt += 1;
    timer = setTimeout(connect, backoffDelay(attempt, policy));
  };

  const connect = (): void => {
    if (stopped) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, options.protocols);
    } catch (error) {
      logger.warn(t("error.request.failed", name, `WebSocket ${String(error)}`));
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = (event) => {
      connected = true;
      attempt = 0;
      opened.resolve();
      emit("open", event);
      logger.info(t("info.ws.open", name));
      flush();
    };

    ws.onmessage = (event) => {
      const raw = options.serializer === "text" ? event : deserializeEvent(event, serializer);
      emit("message", raw as never);
    };

    ws.onerror = (event) => {
      emit("error", event);
    };

    ws.onclose = (event) => {
      connected = false;
      emit("close", event);
      logger.info(t("info.ws.close", name, String(event.code)));
      if (!stopped) scheduleReconnect();
    };
  };

  connect();

  return withDispose({
    get connected() {
      return connected;
    },
    opened: opened.promise,
    closed: closed.promise,
    send(data: unknown) {
      if (stopped) {
        throw new SnailRequestError(
          t("error.request.failed", name, "cannot send on a closed WebSocket")
        );
      }
      if (!connected) {
        if (!queueWhileConnecting) {
          throw new SnailRequestError(
            t("error.request.failed", name, "WebSocket is not open yet")
          );
        }
        queue.push(data);
        return;
      }
      socket!.send(serializer.serialize(data));
    },
    close() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      queue = [];
      connected = false;
      try {
        socket?.close(1000, "client closed");
      } catch {
        /* a socket that never opened throws on close; nothing to do */
      }
      closed.resolve();
    }
  });
}

interface WsSerializer {
  serialize: (value: unknown) => string;
  deserialize: (raw: string) => unknown;
}

function normalizeSerializer(
  input: SnailWsOptions["serializer"]
): WsSerializer {
  if (!input || input === "json") {
    return {
      serialize: (value) => (typeof value === "string" ? value : JSON.stringify(value)),
      deserialize: (raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      }
    };
  }

  if (input === "text") {
    return { serialize: (value) => String(value), deserialize: (raw) => raw };
  }

  return {
    serialize: (value) => String(input.serialize?.(value) ?? value),
    deserialize: (raw) => input.deserialize?.(raw) ?? raw
  };
}

/**
 * 把 `MessageEvent` 解码成处理器可直接使用的普通值。
 *
 * Decode a `MessageEvent` into a plain value for the handlers.
 */
function deserializeEvent(event: MessageEvent, serializer: WsSerializer): MessageEvent {
  if (typeof event.data !== "string") return event;

  const decoded = serializer.deserialize(event.data);
  // Handlers receive a `MessageEvent`-shaped object so `event.data` keeps
  // working, while JSON payloads arrive already parsed.
  return { ...event, data: decoded } as MessageEvent;
}
