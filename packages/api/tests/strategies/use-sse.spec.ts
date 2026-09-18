import { describe, expect, it } from "vitest";
import type {
  SnailConnection,
  SnailSseConnection,
  SnailSseMessage
} from "../../src/index";
import { useSSE } from "../../src/strategies";
import type { SseEndpoint } from "../../src/strategies";
import { delay } from "./support";

/**
 * `useSSE`.
 *
 * The endpoint is faked rather than mocked at the transport level: a
 * `SnailSseEndpoint` is a two-method contract, and driving `opened`/`closed` by
 * hand is the only way to test what happens when a connect *fails* — the case that
 * would otherwise surface as an unhandled rejection.
 */

interface FakeSse {
  readonly endpoint: SseEndpoint;
  readonly opens: number;
  readonly closes: number;
  readonly listeners: number;
  emit(message: SnailSseMessage): void;
  connect(): void;
  fail(error: unknown): void;
  /** The transport dropped without the hook asking it to. */
  drop(): void;
}

function createFakeSse(): FakeSse {
  const subscribers = new Set<(message: SnailSseMessage) => void>();
  let opens = 0;
  let closes = 0;
  let live = false;
  let resolveOpened: (() => void) | undefined;
  let rejectOpened: ((error: unknown) => void) | undefined;
  let resolveClosed: (() => void) | undefined;

  const endpoint: SseEndpoint = {
    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },

    open(): SnailSseConnection {
      opens += 1;

      const opened = new Promise<void>((resolve, reject) => {
        resolveOpened = resolve;
        rejectOpened = reject;
      });
      const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
      });

      /** Share the endpoint's subscriber set, mirroring the real transport. */
      const tap = (listener: (entry: SnailSseMessage) => void): (() => void) => {
        subscribers.add(listener);
        return () => {
          subscribers.delete(listener);
        };
      };

      return {
        get connected(): boolean {
          return live;
        },
        opened,
        closed,
        onMessage: tap,
        on: (_event: string, listener: (entry: SnailSseMessage) => void) =>
          tap(listener),
        close(): void {
          closes += 1;
          live = false;
          resolveClosed?.();
        }
      };
    }
  };

  return {
    endpoint,
    get opens() {
      return opens;
    },
    get closes() {
      return closes;
    },
    get listeners() {
      return subscribers.size;
    },
    emit(message) {
      for (const listener of [...subscribers]) listener(message);
    },
    connect() {
      live = true;
      resolveOpened?.();
    },
    fail(error) {
      live = false;
      rejectOpened?.(error);
    },
    drop() {
      live = false;
      resolveClosed?.();
    }
  };
}

function message(data: string, event = "message"): SnailSseMessage {
  return { event, data, id: "", retry: undefined };
}

describe("useSSE", () => {
  it("accumulates messages and tracks the connection", async () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);

    expect(feed.messages.value).toEqual([]);
    expect(feed.connected.value).toBe(false);

    feed.open();
    expect(sse.opens).toBe(1);
    sse.connect();
    await delay(2);

    sse.emit(message("one"));
    sse.emit(message("two", "tick"));

    expect(feed.connected.value).toBe(true);
    expect(feed.messages.value.map((entry) => entry.data)).toEqual(["one", "two"]);
    expect(feed.lastMessage.value?.data).toBe("two");
    expect(feed.bind().messages).toHaveLength(2);
  });

  it("bounds the buffer with maxMessages, dropping the oldest", () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint, { maxMessages: 3 });
    feed.open();

    for (let index = 1; index <= 5; index += 1) sse.emit(message(String(index)));

    expect(feed.messages.value.map((entry) => entry.data)).toEqual(["3", "4", "5"]);
    expect(feed.lastMessage.value?.data).toBe("5");
  });

  it("uses a bounded default buffer of 100", () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);
    feed.open();

    for (let index = 1; index <= 150; index += 1) sse.emit(message(String(index)));

    expect(feed.messages.value).toHaveLength(100);
    expect(feed.messages.value[0]!.data).toBe("51");
  });

  it("excludes messages the filter rejects", () => {
    const sse = createFakeSse();
    const seen: string[] = [];
    const feed = useSSE(sse.endpoint, {
      filter: (entry) => entry.event === "tick",
      onMessage: (entry) => seen.push(entry.data)
    });
    feed.open();

    sse.emit(message("plain"));
    sse.emit(message("ticked", "tick"));

    expect(feed.messages.value.map((entry) => entry.data)).toEqual(["ticked"]);
    expect(seen).toEqual(["ticked"]);
  });

  it("survives a throwing handler by reporting it as an error", () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint, {
      filter: () => {
        throw new Error("bad filter");
      }
    });
    feed.open();

    sse.emit(message("one"));

    expect(feed.messages.value).toEqual([]);
    expect(feed.error.value).toBeInstanceOf(Error);
    expect(feed.connected.value).toBe(false);
  });

  it("is idempotent while a connection is live", () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);

    feed.open();
    feed.open();

    expect(sse.opens).toBe(1);
  });

  it("opens once on creation with immediate: true", () => {
    const sse = createFakeSse();
    useSSE(sse.endpoint, { immediate: true });

    expect(sse.opens).toBe(1);
  });

  it("closes, detaches and can be reopened", async () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);
    feed.open();
    expect(sse.listeners).toBe(1);

    feed.close();

    expect(sse.closes).toBe(1);
    expect(sse.listeners).toBe(0);
    expect(feed.connected.value).toBe(false);

    // Nothing is delivered after a close, because the tap was detached.
    sse.emit(message("late"));
    expect(feed.messages.value).toEqual([]);

    feed.open();
    expect(sse.opens).toBe(2);
    sse.emit(message("again"));
    expect(feed.messages.value.map((entry) => entry.data)).toEqual(["again"]);
  });

  it("can be reopened after the transport closed on its own", async () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);
    feed.open();
    sse.connect();
    await delay(2);

    // The transport dropped: the connection resolves `closed` without the hook
    // having called close().
    sse.drop();
    await delay(2);
    expect(feed.connected.value).toBe(false);

    feed.open();
    sse.emit(message("after-reopen"));

    expect(sse.opens).toBe(2);
    // The stale tap was released: exactly one delivery, and one live subscriber.
    expect(feed.messages.value.map((entry) => entry.data)).toEqual(["after-reopen"]);
    expect(sse.listeners).toBe(1);
  });

  it("reports a rejected opened promise without an unhandled rejection", async () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);
    feed.open();

    sse.fail(new Error("cannot connect"));
    await delay(2);

    expect(feed.error.value).toBeInstanceOf(Error);
    expect(feed.connected.value).toBe(false);
  });

  it("clears the buffer without touching the connection", () => {
    const sse = createFakeSse();
    const feed = useSSE(sse.endpoint);
    feed.open();
    sse.emit(message("one"));

    feed.clear();

    expect(feed.messages.value).toEqual([]);
    expect(feed.lastMessage.value).toBeUndefined();
    expect(sse.closes).toBe(0);
  });

  it("falls back to the connection tap when the endpoint has none", () => {
    const listeners = new Set<(entry: SnailSseMessage) => void>();

    const endpoint = {
      open() {
        const tap = (
          listener: (entry: SnailSseMessage) => void
        ): (() => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        };

        return {
          connected: true,
          opened: Promise.resolve(),
          closed: new Promise<void>(() => undefined),
          close() {
            /* nothing to release */
          },
          onMessage: tap,
          on: (_event: string, listener: (entry: SnailSseMessage) => void) => tap(listener)
        } satisfies SnailSseConnection;
      }
    };

    const feed = useSSE(endpoint);
    feed.open();
    for (const listener of [...listeners]) listener(message("tapped"));

    expect(feed.messages.value.map((entry) => entry.data)).toEqual(["tapped"]);
  });
});
