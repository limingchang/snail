import { SnailRequestError } from "../error/request";
import { t } from "../locale";
import type {
  SnailHttpStreamConnection,
  SnailHttpStreamOptions
} from "../typings/stream";
import { deferred } from "../utils/object";
import { withDispose } from "./connection";
import type { SnailLogger } from "./logger";

/**
 * HTTP 流式传输所需的全部信息。
 *
 * Everything the HTTP streaming transport needs.
 */
export interface HttpStreamInit {
  /**
   * 完整限定的 url。
   *
   * Fully qualified url.
   */
  url: string;
  /**
   * `@HttpStream(path, options)` 的选项，并带上其请求方法。
   *
   * Options from `@HttpStream(path, options)` with its request method.
   */
  options: SnailHttpStreamOptions & { method?: string };
  /**
   * 请求负载。
   *
   * Request payload.
   */
  body: unknown;
  /**
   * 日志行中使用的名称。
   *
   * Name used in log lines.
   */
  name: string;
  /**
   * 额外的请求头（服务器级、鉴权等）。
   *
   * Extra headers (server-level, auth, …).
   */
  headers?: Record<string, string>;
  /**
   * 输出诊断信息的 logger。
   *
   * Logger.
   */
  logger: SnailLogger;
}

/**
 * 流式 HTTP 响应。
 *
 * 之所以用 `fetch`，是因为它把响应体以 `ReadableStream` 的形式交出来，在浏览器、
 * Node 18+ 和 worker 中都能工作。连接对象本身可异步迭代，因此调用方可以直接写
 * `for await (const chunk of stream)`。
 *
 * Streaming HTTP response.
 *
 * Uses `fetch` so the response body arrives as a `ReadableStream`, which works
 * in browsers, Node 18+ and workers alike. The connection object is itself
 * async-iterable, so callers write `for await (const chunk of stream)`.
 *
 * @param init 创建这条流连接所需的全部信息 / Everything needed to create the stream.
 * @returns 可异步迭代、可主动关闭的流连接 /
 *   An async-iterable stream connection that can be closed explicitly.
 */
export function createHttpStream(init: HttpStreamInit): SnailHttpStreamConnection {
  const { url, options, body, name, logger } = init;
  const controller = new AbortController();
  const opened = deferred<void>();
  const closed = deferred<void>();

  // Attaching a handler marks `opened` as handled, so a failing stream does not
  // surface as an unhandled rejection when the caller only ever iterates it.
  void opened.promise.catch(() => undefined);

  const decodeText = options.decodeText ?? true;
  const lineDelimited = options.lineDelimited ?? false;

  let connected = false;
  let stopped = false;
  let iterator: AsyncIterator<string> | undefined;

  const start = async (): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
    const method = (options.method ?? "POST").toUpperCase();
    const hasBody = body !== undefined && method !== "GET";

    const response = await fetch(url, {
      method,
      headers: {
        accept: "text/event-stream, application/x-ndjson, text/plain",
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {}),
        ...(init.headers ?? {})
      },
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new SnailRequestError(
        t(
          "error.request.failed",
          name,
          `stream responded ${response.status} ${response.statusText}`
        )
      );
    }
    if (!response.body) {
      throw new SnailRequestError(
        t("error.request.failed", name, "stream response has no readable body")
      );
    }

    connected = true;
    opened.resolve();
    return response.body.getReader();
  };

  /**
   * 立即发起请求，而不是等到第一次迭代时再发起。
   *
   * `opened` 和 `closed` 只有在请求已经在途时才有意义：懒启动的流会让
   * `await connection.opened` 永远挂起，这是一个陷阱。创建连接**就是**流的
   * “发送”动作。
   *
   * Start the request immediately rather than on first iteration.
   *
   * `opened` and `closed` are only useful if the request is already in flight — a
   * lazily started stream leaves `await connection.opened` pending forever, which
   * is a trap. Creating the connection *is* the "send" action for a stream.
   */
  const readerPromise = start();

  // An unconsumed failure must not become an unhandled rejection either.
  void readerPromise.catch(() => undefined);

  const createIterator = (): AsyncIterator<string> => {
    const decoder = new TextDecoder("utf-8");
    let pending = "";
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const next = async (): Promise<IteratorResult<string>> => {
      try {
        reader ??= await readerPromise;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (lineDelimited) {
            const newlineIndex = pending.indexOf("\n");
            if (newlineIndex !== -1) {
              const line = pending.slice(0, newlineIndex);
              pending = pending.slice(newlineIndex + 1);
              if (line.trim().length === 0) continue;
              return { value: line, done: false };
            }
          } else if (pending.length > 0) {
            const chunk = pending;
            pending = "";
            return { value: chunk, done: false };
          }

          const { done, value } = await reader.read();
          if (done) {
            connected = false;
            stopped = true;
            closed.resolve();
            if (pending.length > 0) {
              const tail = pending;
              pending = "";
              return { value: tail, done: false };
            }
            return { value: undefined, done: true };
          }

          pending += decodeText ? decoder.decode(value, { stream: true }) : String(value);
        }
      } catch (error) {
        connected = false;
        stopped = true;
        opened.reject(error);
        closed.resolve();
        throw error;
      }
    };

    return {
      next,
      return: async () => {
        stopped = true;
        connected = false;
        controller.abort();
        closed.resolve();
        return { value: undefined, done: true };
      }
    };
  };

  const connection: SnailHttpStreamConnection = withDispose({
    get connected() {
      return connected;
    },
    opened: opened.promise,
    closed: closed.promise,
    close() {
      if (stopped) return;
      stopped = true;
      connected = false;
      controller.abort();
      logger.debug(t("info.sse.close", name));
      closed.resolve();
    },
    [Symbol.asyncIterator]() {
      iterator ??= createIterator();
      return iterator;
    },
    async text() {
      let out = "";
      for await (const chunk of connection) out += chunk;
      return out;
    }
  });

  return connection;
}
