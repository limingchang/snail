# Streaming and realtime

Three transports share one idea: the decorated members only **describe** handlers, and a factory
turns the class into a live connection. Nothing connects until you call `open()`.

Unlike a request method, a **stream handler's body does run** — the connection calls it. These
classes are plain classes, not `@Api` classes, and `Service.createSse(...)` /
`Service.createWebSocket(...)` instantiate them for you.

```ts
import {
  Sse, SseEvent, OnSseOpen, OnSseError,
  WebSocket, Ws, OnWsOpen, OnWsMessage, OnWsClose, OnWsError,
  HttpStream
} from "@snail-js/api";
```

Every url is resolved against the server's `baseURL`, exactly like a normal request.

## Server-Sent Events

```ts
@Sse("/events", { events: ["tick"], reconnect: { retries: 5 } })
class Ticker {
  @OnSseOpen()
  open(): void { console.log("connected"); }

  @OnSseError()
  failed(event: Event): void { console.warn("lost", event); }

  @SseEvent()                                  // the default `message` event
  message(message: SnailSseMessage): void { render(message.data); }

  @SseEvent("tick")                            // a named event
  tick(message: SnailSseMessage): void { tickOnce(); }
}

const ticker = Service.createSse(Ticker);
const connection = ticker.open();              // each open() is an independent connection

connection.connected;                          // true while the transport is up
await connection.opened;                       // resolves once established
connection.close();
await connection.closed;                       // resolves for any reason
```

`SnailSseMessage` is `{ event, data, id, retry }` — `data` is the **raw payload text**, so
`JSON.parse(message.data)` is the caller's job.

`SnailSseOptions`: `method` (`"GET"` default, `"POST"` allowed), `withCredentials`, `headers`,
`data` (static body, useful with POST), `reconnect` (`false` or a policy), `events` (extra named
events to subscribe to).

The transport is `fetch` + a stream reader rather than `EventSource`, which is what makes request
headers, `POST` and `withCredentials` possible — `EventSource` supports none of them.

## WebSocket

```ts
@WebSocket("/ws")
class ChatSocket {
  @OnWsOpen()    connected(): void {}
  @OnWsMessage() incoming(event: MessageEvent): void { render(event.data); }
  @OnWsClose()   gone(event: CloseEvent): void {}
  @OnWsError()   failed(event: Event): void {}
}

const chat = Service.createWebSocket(ChatSocket);
const socket = chat.open();
socket.send({ hello: "world" });      // serialised per the `serializer` option
socket.close();
```

`@Ws` is an alias of `@WebSocket`.

`SnailWsOptions`: `protocols`, `reconnect` (`false` or a policy), `serializer`
(`"json"` default → `JSON.stringify`, `"text"` → `String(value)`, or `{ serialize, deserialize }`),
`queueWhileConnecting` (default `true` — `send()` right after `open()` is queued, not dropped).

## Streaming HTTP

```ts
@Api("/ai")
class AiApi {
  @HttpStream("/chat", { method: "POST", lineDelimited: true })
  chat(@Data() prompt: { text: string }): void {}
}

const stream = Service.createApi(AiApi).chat({ text: "hi" });
for await (const chunk of stream) render(chunk);   // the connection is async-iterable
await stream.text();                               // or buffer everything
stream.close();
```

```ts
@HttpStream("/chat", { method: "POST" })
chat(@Data() prompt: { text: string }): void {}
```

```ts
@HttpStream("/chat", { method: "GET" })
chat(@Query("q") q: string): void {}
```

`SnailHttpStreamOptions`: `method` (`"POST"` default; `GET` cannot carry a body), `headers`,
`decodeText` (default `true`), `lineDelimited` (default `false` — set it to yield one line per
chunk instead of raw chunks).

`SnailHttpStreamConnection` implements `SnailConnection` plus
`[Symbol.asyncIterator](): AsyncIterator<string>` and `text(): Promise<string>`. A non-2xx
response throws `SnailRequestError` from the first `read`, not from `open()`.

**A `@HttpStream` method returns a stream controller, not a `SnailMethod`**: there is no envelope,
so the plugin pipeline (cache, validation, interceptors) does **not** run for it. Its argument
decorators (`@Query`, `@Data`, `@HeaderValue`, `@Params`) *are* applied, and it does not need
`.send()`.

## Reconnect policy

```ts
interface SnailReconnectPolicy {
  retries?: number;      // extra attempts after the first failure (3)
  delayMs?: number;      // first delay (1000)
  maxDelayMs?: number;   // upper bound (30000)
  factor?: number;       // multiplier per failure (2)
  jitter?: boolean;      // randomise the delay (true)
}
```

`reconnect: false` disables retrying entirely. Retries apply to SSE and WebSocket; a streamed
HTTP response is a single fetch and is not retried for you.

## Traps

```ts
@Sse("/events")
@WebSocket("/ws")
class Both {}                      // ❌ SnailDecoratorError — one transport per class

class NotDecorated {}
Service.createSse(NotDecorated);           // ❌ SnailDecoratorError: missing @Sse()
Service.createWebSocket(NotDecorated);     // ❌ SnailDecoratorError: missing @WebSocket()

@Sse("/events")
class Ticker {
  @SseEvent()  message = "x";      // ❌ handler decorators must decorate methods
}
```

* The handler class is instantiated by `createSse` / `createWebSocket`, which bind each handler
  to that instance. Do not `new` the class yourself and do not rely on a constructor argument.
* Each `open()` creates a new connection with its own reconnect loop; call `close()` or you leak
  a socket per call.
* `@UploadProgress` / `@DownloadProgress` do not apply to streams, and the `xhr` adapter caveat
  from [decorators.md](decorators.md) still applies to normal requests.
