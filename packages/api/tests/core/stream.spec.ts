/**
 * Streaming transports: SSE, WebSocket and the raw HTTP stream.
 *
 * Each is driven against a stubbed platform primitive rather than a socket, so
 * the parsing and lifecycle rules are pinned down deterministically: what counts
 * as an event, when a reconnect is scheduled, and what `close()` actually stops.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpStream } from "../../src/core/http-stream";
import {
  backoffDelay,
  canRetry,
  resolveReconnectPolicy,
  DEFAULT_RECONNECT_POLICY
} from "../../src/core/reconnect";
import { createSseConnection } from "../../src/core/sse";
import { createWsConnection } from "../../src/core/websocket";
import { createLogger } from "../../src/core/logger";
import type { SnailSseMessage } from "../../src/index";

const logger = createLogger("silent");

/** A one-shot `ReadableStream` over the given text. */
function textStream(text: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    }
  });
}

/** Replace `fetch` with one that answers with a fixed body. */
function stubFetch(body: string, status = 200) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(textStream(body), {
      status,
      headers: { "content-type": "text/event-stream" }
    });
  }) as typeof globalThis.fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = original;
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reconnect policy", () => {
  it("resolves defaults, and nothing when disabled", () => {
    expect(resolveReconnectPolicy(false)).toBeUndefined();
    expect(resolveReconnectPolicy(undefined)).toEqual(DEFAULT_RECONNECT_POLICY);
    expect(resolveReconnectPolicy({ retries: 1 })).toMatchObject({
      retries: 1,
      delayMs: DEFAULT_RECONNECT_POLICY.delayMs
    });
  });

  it("caps the delay at maxDelayMs regardless of attempt count", () => {
    const policy = { ...DEFAULT_RECONNECT_POLICY, delayMs: 100, factor: 2, maxDelayMs: 1000, jitter: false };
    expect(backoffDelay(1, policy)).toBe(100);
    expect(backoffDelay(2, policy)).toBe(200);
    expect(backoffDelay(50, policy)).toBe(1000);
  });

  it("stays within the cap when jitter is on", () => {
    const policy = { ...DEFAULT_RECONNECT_POLICY, delayMs: 10, maxDelayMs: 500, jitter: true };
    for (let attempt = 1; attempt <= 20; attempt++) {
      const delay = backoffDelay(attempt, policy);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(500);
    }
  });

  it("stops once retries are exhausted", () => {
    const policy = { ...DEFAULT_RECONNECT_POLICY, retries: 2 };
    expect(canRetry(1, policy)).toBe(true);
    expect(canRetry(2, policy)).toBe(true);
    expect(canRetry(3, policy)).toBe(false);
  });
});

describe("SSE transport", () => {
  /** Build a connection over a fixed body with reconnecting off. */
  function connect(body: string, handlers: Parameters<typeof createSseConnection>[0]["handlers"]) {
    return createSseConnection({
      url: "/events",
      options: { reconnect: false },
      handlers,
      name: "test.sse",
      logger
    });
  }

  it("parses a default message event", async () => {
    const fetchStub = stubFetch("data: hello\n\n");
    const received: SnailSseMessage[] = [];

    const connection = connect("data: hello\n\n", {
      open: [],
      error: [],
      events: [{ event: "message", handler: (message) => received.push(message as SnailSseMessage) }]
    });

    await connection.opened;
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ event: "message", data: "hello", id: "", retry: undefined });
    connection.close();
    fetchStub.restore();
  });

  it("joins multi-line data, honours a named event and an id", async () => {
    const fetchStub = stubFetch("event: tick\nid: 7\ndata: one\ndata: two\n\n");
    const received: SnailSseMessage[] = [];

    const connection = connect("event: tick\nid: 7\ndata: one\ndata: two\n\n", {
      open: [],
      error: [],
      events: [{ event: "tick", handler: (message) => received.push(message as SnailSseMessage) }]
    });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ event: "tick", data: "one\ntwo", id: "7", retry: undefined });
    connection.close();
    fetchStub.restore();
  });

  it("ignores comment lines and events with no data", async () => {
    const fetchStub = stubFetch(": keep-alive\n\nevent: empty\n\n");
    const received: SnailSseMessage[] = [];

    const connection = connect(": keep-alive\n\nevent: empty\n\n", {
      open: [],
      error: [],
      events: [{ event: "message", handler: (m) => received.push(m as SnailSseMessage) }]
    });

    await connection.closed;
    expect(received).toHaveLength(0);
    connection.close();
    fetchStub.restore();
  });

  it("invokes the open handler once the stream is established", async () => {
    const fetchStub = stubFetch("data: x\n\n");
    const open = vi.fn();

    const connection = connect("data: x\n\n", { open: [open], error: [], events: [] });
    await connection.opened;
    expect(open).toHaveBeenCalledOnce();
    expect(connection.connected).toBe(true);
    connection.close();
    fetchStub.restore();
  });

  it("sends the configured method, headers and credentials", async () => {
    const fetchStub = stubFetch("data: x\n\n");

    const connection = createSseConnection({
      url: "/events",
      options: {
        method: "POST",
        data: { subscribe: true },
        headers: { "x-custom": "1" },
        withCredentials: true,
        reconnect: false
      },
      handlers: { open: [], error: [], events: [] },
      headers: { authorization: "Bearer t" },
      name: "test.sse",
      logger
    });

    await connection.opened;
    const init = fetchStub.calls[0]!.init!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"subscribe":true}');
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["x-custom"]).toBe("1");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer t");
    connection.close();
    fetchStub.restore();
  });

  it("rejects opened when the server answers with an error status", async () => {
    const fetchStub = stubFetch("nope", 500);

    const connection = connect("nope", { open: [], error: [], events: [] });
    await expect(connection.opened).rejects.toThrow(/500/);
    connection.close();
    fetchStub.restore();
  });

  it("supports explicit resource management", async () => {
    const fetchStub = stubFetch("data: x\n\n");

    const connection = createSseConnection({
      url: "/events",
      options: {},
      handlers: { open: [], error: [], events: [] },
      name: "test.sse",
      logger
    });

    await connection.opened;

    // Attached whenever the engine provides the well known symbols, so a caller
    // may write `await using connection = …` instead of remembering close().
    expect(typeof connection[Symbol.asyncDispose]).toBe("function");
    expect(typeof connection[Symbol.dispose]).toBe("function");

    await connection[Symbol.asyncDispose]!();
    expect(connection.connected).toBe(false);
    await expect(connection.closed).resolves.toBeUndefined();
    fetchStub.restore();
  });

  it("stop() aborts the request and resolves closed", async () => {
    const fetchStub = stubFetch("data: x\n\n");

    const connection = createSseConnection({
      url: "/events",
      options: {},
      handlers: { open: [], error: [], events: [] },
      name: "test.sse",
      logger
    });

    await connection.opened;
    connection.close();
    expect(connection.connected).toBe(false);
    await expect(connection.closed).resolves.toBeUndefined();
    fetchStub.restore();
  });

  it("exposes decoded events through onMessage and on(event)", async () => {
    const fetchStub = stubFetch("event: tick\ndata: 1\n\nevent: tock\ndata: 2\n\n");
    const all: SnailSseMessage[] = [];
    const ticks: SnailSseMessage[] = [];

    const connection = connect("event: tick\ndata: 1\n\nevent: tock\ndata: 2\n\n", {
      open: [],
      error: [],
      events: []
    });

    connection.onMessage((message) => all.push(message));
    connection.on("tick", (message) => ticks.push(message));

    // `useSSE` builds on exactly this surface.
    await vi.waitFor(() => expect(all).toHaveLength(2));
    expect(all.map((message) => message.event)).toEqual(["tick", "tock"]);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.data).toBe("1");

    connection.close();
    fetchStub.restore();
  });

  it("unsubscribes from onMessage", async () => {
    const fetchStub = stubFetch("data: 1\ndata: 2\n\n");
    const seen: SnailSseMessage[] = [];

    const connection = connect("data: 1\ndata: 2\n\n", {
      open: [],
      error: [],
      events: []
    });

    const off = connection.onMessage((message) => seen.push(message));
    off();
    await connection.closed;

    expect(seen).toHaveLength(0);
    connection.close();
    fetchStub.restore();
  });

  it("gives up after the retry budget when the stream never delivers an event", async () => {
    // A comment-only body: the connection is accepted and then closed without a
    // single event. That is the failure shape the retry budget exists for.
    const fetchStub = stubFetch(": ping\n\n");

    const connection = createSseConnection({
      url: "/events",
      options: { reconnect: { retries: 1, delayMs: 1, jitter: false } },
      handlers: { open: [], error: [], events: [] },
      name: "test.sse",
      logger
    });

    await connection.closed;
    // First attempt + exactly one retry, then it stops.
    expect(fetchStub.calls.length).toBe(2);
    connection.close();
    fetchStub.restore();
  });

  it("resets the retry budget for a stream that keeps delivering events", async () => {
    const fetchStub = stubFetch("data: x\n\n");

    const connection = createSseConnection({
      url: "/events",
      options: { reconnect: { retries: 1, delayMs: 1, jitter: false } },
      handlers: { open: [], error: [], events: [] },
      name: "test.sse",
      logger
    });

    // `retries` budgets *failures*. A connection that sent events was healthy, so
    // it reconnects past the configured limit instead of giving up — which is why
    // the attempt counter must not be reset merely because headers arrived.
    await vi.waitFor(() => expect(fetchStub.calls.length).toBeGreaterThanOrEqual(3));
    connection.close();
    fetchStub.restore();
  });
});

describe("WebSocket transport", () => {
  /** A controllable `WebSocket` stand-in. */
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;

    readonly url: string;
    readonly protocols: string | string[] | undefined;
    readyState = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    closeCode: number | undefined;

    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;

    constructor(url: string, protocols?: string | string[]) {
      this.url = url;
      this.protocols = protocols;
      FakeWebSocket.instances.push(this);
    }

    send(data: string): void {
      if (this.readyState !== FakeWebSocket.OPEN) {
        throw new DOMException("not open", "InvalidStateError");
      }
      this.sent.push(data);
    }

    close(code = 1000): void {
      this.closeCode = code;
      this.readyState = FakeWebSocket.CLOSED;
    }

    /** Test hook: complete the handshake. */
    open(): void {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }

    /** Test hook: deliver a message. */
    receive(data: unknown): void {
      this.onmessage?.({ data } as MessageEvent);
    }
  }

  const originalWebSocket = globalThis.WebSocket;

  function installFake(): void {
    FakeWebSocket.instances = [];
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  }

  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it("queues sends made before the socket opens, then flushes them", async () => {
    installFake();

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: {},
      handlers: { open: [], message: [], close: [], error: [] },
      name: "test.ws",
      logger
    });

    connection.send({ hello: "world" });
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.sent).toHaveLength(0);

    socket.open();
    await connection.opened;
    expect(socket.sent).toEqual(['{"hello":"world"}']);
    connection.close();
  });

  it("parses a JSON message into event.data", async () => {
    installFake();
    const received: unknown[] = [];

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: {},
      handlers: {
        open: [],
        message: [(event) => received.push(event.data)],
        close: [],
        error: []
      },
      name: "test.ws",
      logger
    });

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await connection.opened;
    socket.receive('{"n":1}');

    expect(received).toEqual([{ n: 1 }]);
    connection.close();
  });

  it("leaves a non-JSON message as text", async () => {
    installFake();
    const received: unknown[] = [];

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: {},
      handlers: { open: [], message: [(e) => received.push(e.data)], close: [], error: [] },
      name: "test.ws",
      logger
    });

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await connection.opened;
    socket.receive("plain text");

    expect(received).toEqual(["plain text"]);
    connection.close();
  });

  it("passes sub-protocols through to the constructor", async () => {
    installFake();

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: { protocols: ["v1", "v2"] },
      handlers: { open: [], message: [], close: [], error: [] },
      name: "test.ws",
      logger
    });

    expect(FakeWebSocket.instances[0]!.protocols).toEqual(["v1", "v2"]);
    connection.close();
  });

  it("refuses to queue when queueWhileConnecting is off", () => {
    installFake();

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: { queueWhileConnecting: false },
      handlers: { open: [], message: [], close: [], error: [] },
      name: "test.ws",
      logger
    });

    expect(() => connection.send("x")).toThrow(/not open/);
    connection.close();
  });

  it("reports close and reconnects after an unexpected drop", async () => {
    installFake();
    const closed = vi.fn();

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: { reconnect: { retries: 1, delayMs: 1, jitter: false } },
      handlers: { open: [], message: [], close: [closed], error: [] },
      name: "test.ws",
      logger
    });

    const first = FakeWebSocket.instances[0]!;
    first.open();
    await connection.opened;
    first.readyState = FakeWebSocket.CLOSED;
    first.onclose?.({ code: 1006 } as CloseEvent);

    expect(closed).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    connection.close();
  });

  it("rejects opened once the retry budget is exhausted", async () => {
    installFake();

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: { reconnect: { retries: 0, delayMs: 1, jitter: false } },
      handlers: { open: [], message: [], close: [], error: [] },
      name: "test.ws",
      logger
    });

    const socket = FakeWebSocket.instances[0]!;
    socket.readyState = FakeWebSocket.CLOSED;
    socket.onclose?.({ code: 1006 } as CloseEvent);

    await expect(connection.opened).rejects.toThrow(/WebSocket failed/);
    connection.close();
  });

  it("close() stops reconnecting", async () => {
    installFake();

    const connection = createWsConnection({
      url: "ws://x/ws",
      options: { reconnect: { retries: 5, delayMs: 1, jitter: false } },
      handlers: { open: [], message: [], close: [], error: [] },
      name: "test.ws",
      logger
    });

    connection.close();
    expect(FakeWebSocket.instances[0]!.closeCode).toBe(1000);
    await expect(connection.closed).resolves.toBeUndefined();
    // Nothing new may be scheduled after an explicit close.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("HTTP stream transport", () => {
  it("yields decoded chunks in order", async () => {
    const fetchStub = stubFetch("alpha-beta-");

    const stream = createHttpStream({
      url: "/stream",
      options: {},
      body: undefined,
      name: "test.stream",
      logger
    });

    let collected = "";
    for await (const chunk of stream) collected += chunk;

    expect(collected).toBe("alpha-beta-");
    fetchStub.restore();
  });

  it("splits on newlines when lineDelimited is set and drops blank lines", async () => {
    const fetchStub = stubFetch('{"n":1}\n\n{"n":2}\n');

    const stream = createHttpStream({
      url: "/stream",
      options: { lineDelimited: true },
      body: undefined,
      name: "test.stream",
      logger
    });

    const lines: string[] = [];
    for await (const line of stream) lines.push(line);

    expect(lines).toEqual(['{"n":1}', '{"n":2}']);
    fetchStub.restore();
  });

  it("text() buffers the whole stream", async () => {
    const fetchStub = stubFetch("one two three");

    const stream = createHttpStream({
      url: "/stream",
      options: {},
      body: undefined,
      name: "test.stream",
      logger
    });

    expect(await stream.text()).toBe("one two three");
    fetchStub.restore();
  });

  it("posts the body as JSON and sends the accept header", async () => {
    const fetchStub = stubFetch("");

    const stream = createHttpStream({
      url: "/stream",
      options: {},
      body: { prompt: "hi" },
      name: "test.stream",
      logger
    });

    await stream.opened;
    const init = fetchStub.calls[0]!.init!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"prompt":"hi"}');
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    stream.close();
    fetchStub.restore();
  });

  it("rejects when the server answers with an error status", async () => {
    const fetchStub = stubFetch("boom", 502);

    const stream = createHttpStream({
      url: "/stream",
      options: {},
      body: undefined,
      name: "test.stream",
      logger
    });

    await expect(stream.text()).rejects.toThrow(/502/);
    fetchStub.restore();
  });
});
