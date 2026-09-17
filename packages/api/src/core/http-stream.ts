import { SnailRequestError } from "../error/request";
import { t } from "../locale";
import type {
  SnailHttpStreamConnection,
  SnailHttpStreamOptions
} from "../typings/stream";
import { deferred } from "../utils/object";
import { withDispose } from "./connection";
import type { SnailLogger } from "./logger";

/** Everything the HTTP streaming transport needs. */
export interface HttpStreamInit {
  /** Fully qualified url. */
  url: string;
  /** Options from `@HttpStream(path, options)` with its request method. */
  options: SnailHttpStreamOptions & { method?: string };
  /** Request payload. */
  body: unknown;
  /** Name used in log lines. */
  name: string;
  /** Extra headers (server-level, auth, …). */
  headers?: Record<string, string>;
  /** Logger. */
  logger: SnailLogger;
}

/**
 * Streaming HTTP response.
 *
 * Uses `fetch` so the response body arrives as a `ReadableStream`, which works
 * in browsers, Node 18+ and workers alike. The connection object is itself
 * async-iterable, so callers write `for await (const chunk of stream)`.
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
