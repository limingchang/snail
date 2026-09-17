# SSE / WebSocket / HTTP 流

三种传输，一个共同点：被装饰的成员只**描述**处理器，真正建立连接的是
`Service.createSse(...)` / `Service.createWebSocket(...)` 返回的端点，或 `@HttpStream` 方法。

| 传输 | 声明 | 建立连接 | 拿到什么 |
| --- | --- | --- | --- |
| SSE | `@Sse(path, options)` + `@SseEvent` / `@OnSseOpen` / `@OnSseError` | `Service.createSse(Class).open()` | `SnailConnection` |
| WebSocket | `@WebSocket(path, options)` + `@OnWs*` | `Service.createWebSocket(Class).open()` | `SnailSocketConnection` |
| HTTP 流 | `@HttpStream(path, options)`（方法） | 直接调用代理方法 | `SnailHttpStreamConnection` |

::: warning 一个类只能声明一种连接传输
同一个类上同时出现 `@Sse` 与 `@WebSocket` 会抛 `SnailDecoratorError`：
`类[Ticker]上只能使用一个连接类装饰器（@Sse/@WebSocket）`。
:::

## SSE

```ts
import { OnSseError, OnSseOpen, Sse, SseEvent, type SnailSseMessage } from "@snail-js/api";

@Sse("/events", { reconnect: { retries: 5, delayMs: 500 } })
class Ticker {
  @OnSseOpen()
  open(): void {
    console.log("connected");
  }

  @OnSseError()
  failed(event: Event): void {
    console.warn("lost", event);
  }

  @SseEvent()                       // 默认的 `message` 事件
  message(message: SnailSseMessage): void {
    console.log(message.data);
  }

  @SseEvent("tick")                 // 具名事件
  tick(message: SnailSseMessage): void {
    console.log("tick", message.data);
  }
}

const ticker = Service.createSse(Ticker);
const connection = ticker.open();

await connection.opened;            // 连接建立
connection.connected;               // true / false
connection.close();                 // 主动关闭
await connection.closed;            // 关闭（含失败放弃重连）
```

### 消息结构

```ts
interface SnailSseMessage {
  event: string;              // 事件名，默认事件为 "message"
  data: string;               // 原始载荷文本（不做 JSON 解析）
  id: string;                 // 服务端发的 id: 字段
  retry: number | undefined;  // 见下方说明
}
```

处理器按**事件名精确匹配**：只有 `@SseEvent("tick")` 会收到 `event === "tick"` 的消息；
`@SseEvent()`（等价于 `@SseEvent("message")`）收默认事件。

::: warning 两个实现细节
1. `message.retry` 目前**恒为 `undefined`**：`retry:` 字段被用作下一次重连的延迟提示
   （`retryHint`），没有随消息一起下发。
2. 解析器会读取 `id:` 并放进 `message.id`，但当前实现**不会**在重连时自动发送
   `Last-Event-ID` 请求头。需要断点续传时，请在自己的处理器里记录 `id`，并在关闭重连前
   把最新 id 放进 `options.headers`。
:::

### `@Sse` 的选项

| 选项 | 类型 | 默认行为 | 说明 |
| --- | --- | --- | --- |
| `method` | `"GET" \| "POST"` | `"GET"` | 请求方法 |
| `withCredentials` | `boolean` | `false`（`credentials: "same-origin"`） | `true` 时用 `credentials: "include"` 发送 cookie 与认证头 |
| `headers` | `Record<string, string>` | 未设置 | 额外请求头，会与 server 级 header 合并 |
| `data` | `unknown` | 未设置 | 静态请求体，**仅在 `method: "POST"` 时发送**（`JSON.stringify`） |
| `reconnect` | `false \| SnailReconnectPolicy` | 启用，`retries: 3` | 传 `false` 关闭自动重连 |
| `events` | `string[]` | 未设置 | 见下方说明 |

`SnailReconnectPolicy` 与默认值：

```ts
interface SnailReconnectPolicy {
  retries?: number;     // 首次失败后的额外尝试次数，默认 3
  delayMs?: number;     // 首次延迟毫秒，默认 1000
  maxDelayMs?: number;  // 延迟上限，默认 30000
  factor?: number;      // 每次失败后的倍数，默认 2
  jitter?: boolean;     // 加随机抖动，默认 true
}
```

::: tip `events` 选项当前不提供订阅接口
`options.events` 会登记事件名，但返回的 `SnailConnection` 上没有「订阅」方法，
所以它目前无法替代 `@SseEvent(name)`。要用具名事件，请写处理器装饰器。
:::

### 为什么用 `fetch` 而不是 `EventSource`

`EventSource` 的接口太窄：不能自定义请求头（因此没法带 `Authorization`）、不能 `POST`、
不能干净地中止、并且按自己的规则重连。这里改成 `fetch` + `ReadableStream` 读取器，
代价是必须自己解析 `text/event-stream`（本库内置约 50 行的解析器，遵循实践中有意义的
WHATWG 规则：`\n` / `\r\n` / `\r` 都算行终止，空行派发，`:` 开头是注释，字段值去掉一个前导空格）。

换来的是：

- 任意请求头（`Authorization`、`x-trace-id` …）；
- `method: "POST"` 与请求体；
- `withCredentials` 语义明确（`credentials: "include"`）；
- 可被 `AbortController` 立即中止；
- 由我们自己控制的退避重连策略。

::: warning 解析器只处理 `event` / `data` / `id` / `retry`
多行 `data:` 会按规范用 `\n` 连接后派发。未知字段被忽略。SSE 的 `data` 永远是**字符串**，
需要 JSON 请自行 `JSON.parse`（并处理异常）。
:::

### 实例与连接的关系

`Service.createSse(Ticker)` 会 `new Ticker()` **一次**，处理器绑定在这个实例上
（装饰器只能看到原型，绑定发生在 `createSse` 内部）。每次 `open()` 都创建一条**独立的**
连接，带自己的重连循环 —— 但它们共享同一个实例，所以写在实例上的字段是跨连接共享的。

如果类上没有 `@Sse`，`Service.createSse(...)` 会抛
`SnailDecoratorError`：`[snail] Ticker is missing the @Sse() decorator`。

## WebSocket

```ts
import { OnWsClose, OnWsError, OnWsMessage, OnWsOpen, WebSocket } from "@snail-js/api";

@WebSocket("/ws", { serializer: "json", queueWhileConnecting: true })
class ChatSocket {
  @OnWsOpen()    connected(): void {}
  @OnWsMessage() incoming(event: MessageEvent): void { console.log(event.data); }
  @OnWsClose()   gone(event: CloseEvent): void { console.log(event.code); }
  @OnWsError()   failed(event: Event): void {}
}

const chat = Service.createWebSocket(ChatSocket);
const socket = chat.open();

socket.send({ hello: "world" });  // 握手还没完成也不会抛错 —— 先入队
await socket.opened;
socket.close();
```

`@Ws` 是 `@WebSocket` 的短别名。

### `@WebSocket` 的选项

| 选项 | 类型 | 默认行为 | 说明 |
| --- | --- | --- | --- |
| `protocols` | `string \| string[]` | 未设置 | 传给 `new WebSocket(url, protocols)` |
| `reconnect` | `false \| SnailReconnectPolicy` | 启用，`retries: 3` | 与 SSE 使用同一套退避策略 |
| `serializer` | `"json" \| "text" \| { serialize?, deserialize? }` | `"json"` | `"json"` → `JSON.stringify` 发送、`JSON.parse` 接收；`"text"` → `String(value)`，接收原样 |
| `queueWhileConnecting` | `boolean` | `true` | socket 尚未连上时 `send()` 先入队而不是抛错 |

### 连接句柄

```ts
interface SnailSocketConnection {
  send(data: unknown): void;   // 未连上时按 queueWhileConnecting 决定入队或抛错
  close(): void;
  connected: boolean;
  opened: Promise<void>;
  closed: Promise<void>;
}
```

- `send()` 在连接已关闭时抛 `SnailRequestError`（`cannot send on a closed WebSocket`）；
- `queueWhileConnecting: false` 且未连上时抛 `SnailRequestError`（`WebSocket is not open yet`）；
- `close()` 会清空队列、以 code `1000` 与 reason `"client closed"` 关闭，并结束重连循环；
- 用 `"json"` 序列化时，处理器收到的是 **`MessageEvent` 形状的对象**，但 `event.data`
  已经是解析后的值；`serializer: "text"` 时保持原始 `MessageEvent`。

::: tip 处理器绑定到 `createWebSocket` 创建的实例
`Service.createWebSocket(ChatSocket)` 只 `new ChatSocket()` 一次，每次 `open()` 把处理器
`bind` 到这个实例上。因此实例字段可用来保存「当前连接」状态；但如果你需要**每连接独立**
的状态，请自己把状态放进返回的连接对象，或为每条连接各建一个端点。
:::

### url 的协议升级

WebSocket 用的是自己的协议，`http://` / `https://` 前缀会被自动转换：

```text
https://api.example.com/ws  →  wss://api.example.com/ws
http://localhost:3000/ws    →  ws://localhost:3000/ws
相对路径 /ws                 →  原样（由 new WebSocket 基于文档地址解析）
```

## HTTP 流

`@HttpStream` 是**方法**装饰器，写在 `@Api` 类里。被它标记的方法不再返回 `SnailMethod`，
而是直接返回一个流控制器 —— 流没有信封，所以**不进入插件管线**，也没有业务码校验。

```ts
import { Api, Data, HttpStream } from "@snail-js/api";

@Api("/ai")
class AiApi {
  @HttpStream("/chat", { method: "POST", lineDelimited: true })
  chat(@Data() prompt: { text: string }): void {}
}

const aiApi = Service.createApi(AiApi);

const stream = aiApi.chat({ text: "你好" });

for await (const chunk of stream) {
  render(chunk);                  // 每一行一个 chunk
}

// 或者一次性读完
const whole = await stream.text();
```

### `@HttpStream` 的选项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH"` | `"POST"`（实际取值时回落 `"POST"`） | 请求方法 |
| `headers` | `Record<string, string>` | 未设置 | 请求头，例如 `{ accept: "text/event-stream" }` |
| `decodeText` | `boolean` | `true` | 把每个 chunk 按 UTF-8 解码成文本，而不是原始字节 |
| `lineDelimited` | `boolean` | `false` | `true` 时按行切分（忽略空行），适合 NDJSON |

### 连接对象

```ts
interface SnailHttpStreamConnection {
  [Symbol.asyncIterator](): AsyncIterator<string>;  // for await ... of stream
  text(): Promise<string>;                          // 读完整流
  close(): void;
  connected: boolean;
  opened: Promise<void>;
  closed: Promise<void>;
}
```

- 请求头固定带上 `accept: text/event-stream, application/x-ndjson, text/plain`；有请求体时
  额外带 `content-type: application/json`（请求体是 `JSON.stringify(body)`；`method: "GET"`
  时不发送请求体）；
- 响应非 2xx 或没有可读 body 时抛 `SnailRequestError`；
- 提前退出 `for await` 循环会中止底层 `fetch`；
- `close()` 中止请求并结束连接。

::: warning 类型注释里提到的 `Symbol.asyncDispose` 尚未实现
`SnailConnection` 的注释描述了「可用 `await using` 驱动」，但在当前实现里连接对象**没有**
定义 `[Symbol.asyncDispose]`。请显式调用 `close()`（HTTP 流也可以 `await using` 之外的写法
提前 `break`）。
:::

### 参数装饰器仍然可用

虽然不进入插件管线，`@Query()` / `@Data()` / `@HeaderValue()` 在这个方法上依然工作：内部会
构造一个最小的上下文把参数写进请求配置，并按 `@Params()` 的值替换 `:placeholder`。

```ts
@Api("/log")
class LogApi {
  @HttpStream("/tail", { method: "POST" })
  tail(
    @Query("level") level: string,
    @HeaderValue("authorization") token: string
  ): void {}
}
// 调用：logApi.tail("error", "Bearer x")
```
