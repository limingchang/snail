import { SnailRequestError } from "../error/request";
import { t } from "../locale";
import type {
  SnailSseConnection,
  SnailSseMessage,
  SnailSseOptions
} from "../typings/stream";
import type { SnailSseHandlers } from "../decorators/stream";
import { deferred } from "../utils/object";
import { withDispose } from "./connection";
import { backoffDelay, canRetry, resolveReconnectPolicy } from "./reconnect";
import type { SnailLogger } from "./logger";

/**
 * SSE 传输层打开一条连接所需的全部信息。
 *
 * Everything the SSE transport needs to open a connection.
 */
export interface SseConnectionInit {
  /**
   * 完整的 url。
   *
   * Fully qualified url.
   */
  url: string;
  /**
   * 来自 `@Sse(path, options)` 的选项。
   *
   * Options from `@Sse(path, options)`.
   */
  options: SnailSseOptions;
  /**
   * 由装饰器登记的处理函数。
   *
   * Handlers registered by the decorators.
   */
  handlers: SnailSseHandlers;
  /**
   * 日志行里使用的名字。
   *
   * Name used in log lines.
   */
  name: string;
  /**
   * 额外表头（服务器级、鉴权等）。
   *
   * Extra headers (server-level, auth, …).
   */
  headers?: Record<string, string>;
  /**
   * 日志器。
   *
   * Logger.
   */
  logger: SnailLogger;
}

/**
 * 基于 `fetch` 的服务端推送（Server-Sent Events）。
 *
 * 刻意不用 `EventSource`：它无法发送请求头、无法 `POST`、无法干净地中断，而且
 * 按自己的一套规则自动重连。`fetch` 的流读取器四项全都支持，下面的解析器也不
 * 过五十来行。
 *
 * 未提供 `reconnect` 时默认重试 3 次。连接首次成功才 resolve `opened`；重试
 * 预算耗尽仍未连上时，`opened` 会带着最近一次真实错误 reject，而不是用泛泛的
 * 「放弃重试」掩盖问题。
 *
 * Server-Sent Events over `fetch`.
 *
 * `EventSource` is deliberately not used: it cannot send request headers, cannot
 * `POST`, cannot be aborted cleanly and reconnects on its own terms. A `fetch`
 * stream reader supports all four, and the parser below is ~50 lines.
 *
 * @param init 建立连接所需的全部信息 / Everything needed to open the connection.
 * @returns 可关闭、可重连的 SSE 连接 / A closable, reconnecting SSE connection.
 */
export function createSseConnection(init: SseConnectionInit): SnailSseConnection {
  const { url, options, handlers, name, logger } = init;
  const policy = resolveReconnectPolicy(options.reconnect ?? { retries: 3 });

  const opened = deferred<void>();
  const closed = deferred<void>();
  const controller = new AbortController();

  // A caller that only iterates or only calls `close()` never attaches a handler
  // to `opened`. Marking it handled here keeps a legitimate failure from being
  // reported as an unhandled rejection, while `await connection.opened` still
  // rejects with the real error.
  void opened.promise.catch(() => undefined);

  let connected = false;
  let stopped = false;
  let attempt = 0;
  let retryHint: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastError: unknown;

  /**
   * 本次尝试是否至少送达过一个事件。
   *
   * 这一标志区分了健康连接与注定失败的连接。服务端接受请求、发送事件后再关闭流，
   * 属于正常行为，应当用全新的重试预算重连；而接受后立刻关闭、什么都没发的服务端
   * 说明它在空转，其重试预算必须真正耗尽。
   *
   * 一收到响应头就重置计数——最直觉的写法——会让预算形同虚设，并产生没有上限的
   * 热重连循环。
   *
   * Whether the current attempt delivered at least one event.
   *
   * This is what separates a healthy connection from a doomed one. A server that
   * accepts the request, sends events and then closes the stream is behaving
   * correctly and should reconnect with a fresh retry budget; a server that
   * accepts and immediately closes without ever sending anything is looping, and
   * its retry budget must actually run out.
   *
   * Resetting the counter as soon as headers arrive — the obvious implementation
   * — makes the budget meaningless and produces an unbounded hot reconnect loop.
   */
  let sawEvent = false;

  const messageListeners = new Set<(message: SnailSseMessage) => void>();
  const eventListeners = new Map<string, Set<(message: SnailSseMessage) => void>>();

  /**
   * 调用一组监听器，同时避免某个坏监听器拖垮整条流。
   *
   * Invoke one listener set, keeping a broken listener from killing the stream.
   */
  const notify = (
    listeners: Iterable<(message: SnailSseMessage) => void>,
    message: SnailSseMessage
  ): void => {
    for (const listener of [...listeners]) {
      try {
        listener(message);
      } catch (error) {
        logger.error(`[snail] ${name} SSE message listener threw`, error);
      }
    }
  };

  const dispatch = (message: SnailSseMessage): void => {
    sawEvent = true;
    for (const entry of handlers.events) {
      if (entry.event !== message.event) continue;
      try {
        (entry.handler as (message: SnailSseMessage) => void)(message);
      } catch (error) {
        logger.error(`[snail] ${name} SSE handler for "${message.event}" threw`, error);
      }
    }
    notify(messageListeners, message);
    notify(eventListeners.get(message.event) ?? [], message);
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;

    if (!policy || !canRetry(attempt + 1, policy)) {
      if (!connected) {
        // Surface the *actual* failure — "responded 500" or "connection refused"
        // — rather than a generic "gave up after N attempts", which would hide
        // the one detail the caller needs to diagnose it.
        opened.reject(
          lastError ??
            new SnailRequestError(
              t("error.request.failed", name, `SSE connection failed after ${attempt} attempt(s)`)
            )
        );
      }
      stopped = true;
      closed.resolve();
      return;
    }

    attempt += 1;
    const delay = retryHint ?? backoffDelay(attempt, policy);
    retryHint = undefined;

    timer = setTimeout(() => {
      void run();
    }, delay);
  };

  const run = async (): Promise<void> => {
    if (stopped) return;

    sawEvent = false;

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          accept: "text/event-stream",
          ...(options.headers ?? {}),
          ...(init.headers ?? {})
        },
        body:
          options.method === "POST" && options.data !== undefined
            ? JSON.stringify(options.data)
            : undefined,
        credentials: options.withCredentials ? "include" : "same-origin",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new SnailRequestError(
          t("error.request.failed", name, `SSE responded ${response.status} ${response.statusText}`)
        );
      }
      if (!response.body) {
        throw new SnailRequestError(
          t("error.request.failed", name, "SSE response has no readable body")
        );
      }

      if (!connected) {
        connected = true;
        opened.resolve();
        for (const handler of handlers.open) {
          try {
            handler(new Event("open"));
          } catch (error) {
            logger.error(`[snail] ${name} SSE open handler threw`, error);
          }
        }
        logger.info(t("info.sse.open", name));
      }

      await readStream(response.body, dispatch, (hint) => {
        retryHint = hint;
      });

      // A clean end-of-stream is still a disconnect: fall through to reconnect.
      connected = false;
      lastError = undefined;
      // A connection that delivered events was healthy — start the budget over.
      if (sawEvent) attempt = 0;
      scheduleReconnect();
    } catch (error) {
      if (controller.signal.aborted || stopped) {
        stopped = true;
        closed.resolve();
        return;
      }

      lastError = error;

      for (const handler of handlers.error) {
        try {
          handler(new Event("error"));
        } catch (handlerError) {
          logger.error(`[snail] ${name} SSE error handler threw`, handlerError);
        }
      }
      logger.warn(t("error.request.failed", name, `SSE ${String(error)}`));

      connected = false;
      scheduleReconnect();
    }
  };

  void run();

  return withDispose({
    get connected() {
      return connected;
    },
    opened: opened.promise,
    closed: closed.promise,
    onMessage(listener) {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    on(event, listener) {
      let listeners = eventListeners.get(event);
      if (!listeners) {
        listeners = new Set();
        eventListeners.set(event, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      controller.abort();
      connected = false;
      messageListeners.clear();
      eventListeners.clear();
      logger.info(t("info.sse.close", name));
      closed.resolve();
    }
  });
}

/**
 * 解析 event-stream 响应体。
 *
 * 遵循实践中真正重要的 WHATWG 规则：行以 `\n`、`\r\n` 或 `\r` 结束；空行派发已
 * 缓冲的事件；`:` 开头是注释；字段值保留第一个冒号之后的全部内容，并去掉一个前导
 * 空格。
 *
 * Parse an event-stream body.
 *
 * Follows the WHATWG rules that matter in practice: lines are terminated by
 * `\n`, `\r\n` or `\r`; a blank line dispatches the buffered event; `:` starts a
 * comment; a field value keeps everything after the first colon, minus one
 * leading space.
 */
async function readStream(
  body: ReadableStream<Uint8Array>,
  dispatch: (message: SnailSseMessage) => void,
  onRetry: (hint: number) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];
  let lastId = "";
  let sawData = false;

  const flush = (): void => {
    if (!sawData) {
      eventName = "message";
      dataLines = [];
      return;
    }
    dispatch({
      event: eventName || "message",
      data: dataLines.join("\n"),
      id: lastId,
      retry: undefined
    });
    eventName = "message";
    dataLines = [];
    sawData = false;
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.search(/\r\n|\r|\n/);
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      const terminatorLength = buffer.startsWith("\r\n", newlineIndex) ? 2 : 1;
      buffer = buffer.slice(newlineIndex + terminatorLength);
      newlineIndex = buffer.search(/\r\n|\r|\n/);

      if (line.length === 0) {
        flush();
        continue;
      }
      if (line.startsWith(":")) continue;

      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      switch (field) {
        case "event":
          eventName = value;
          break;
        case "data":
          dataLines.push(value);
          sawData = true;
          break;
        case "id":
          lastId = value;
          break;
        case "retry": {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed)) onRetry(parsed);
          break;
        }
        default:
          break;
      }
    }
  }

  flush();
}
