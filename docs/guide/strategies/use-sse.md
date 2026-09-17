# 请求策略 `useSSE`

把一个 SSE 端点消费成响应式状态：消息缓冲、连接状态、错误。

```ts
function useSSE(endpoint: SseEndpoint, options?: UseSseOptions): UseSseResult;

interface SseEndpoint extends SnailSseEndpoint {
  subscribe?(listener: (message: SnailSseMessage) => void): () => void;
}
```

## 选项

```ts
interface UseSseOptions {
  adapter?: SnailStateAdapter;      // 默认全局注册的
  immediate?: boolean;              // 默认 false
  maxMessages?: number;             // 默认 100
  filter?: (message: SnailSseMessage) => boolean;
  onMessage?: (message: SnailSseMessage) => void;
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `adapter` | `SnailStateAdapter` | 全局注册的 | 状态适配器 |
| `immediate` | `boolean` | `false` | 创建时立刻 `open()`（与 `SnailSseEndpoint` 的「不调用就不连接」契约一致） |
| `maxMessages` | `number` | `100` | 缓冲上限，超出时丢**最旧**的；下限夹到 1。有界是故意的：跑几小时的 SSE 配一个无界数组就是一次最终会冻住标签页的内存泄漏 |
| `filter` | `(message) => boolean` | 未设置 | 只保留返回 `true` 的消息 |
| `onMessage` | `(message) => void` | 未设置 | 每条**被接受**的消息，在缓冲更新之后调用 |

## 返回

| 返回 | 类型 | 说明 |
| --- | --- | --- |
| `messages` | `SnailStateRef<SnailSseMessage[]>` | 缓冲的消息，旧的在前 |
| `lastMessage` | `SnailStateRef<SnailSseMessage \| undefined>` | 最近一条被接受的消息 |
| `connected` | `SnailStateRef<boolean>` | 从连接成功到下一次关闭之间为 `true` |
| `error` | `SnailStateRef<unknown>` | 连接失败，或 filter / 处理器抛错 |
| `open()` | `() => void` | 连接。已有活动连接时是 no-op |
| `close()` | `() => void` | 断开、停止重连循环、摘掉监听 |
| `clear()` | `() => void` | 清空消息缓冲，不动连接 |
| `bind()` | `() => { messages; lastMessage; connected; error }` | 解出当前值并在适配器支持时订阅组件 |

## 示例

```ts
import { useSSE } from "@snail-js/api/strategies";
import { Service, Events } from "./service";

const feed = useSSE(Service.createSse(Events), { maxMessages: 50 });

feed.open();
feed.messages.value;    // SnailSseMessage[]
feed.bind().connected;
feed.close();           // 释放：close()，不是 Symbol.asyncDispose
```

## 消息从哪里来

`Service.createSse()` 返回的对象只有一个成员 `open()`，它解析出来的消息是发给被装饰类上的
`@SseEvent()` 处理器的，不是给调用方的。所以 `useSSE` 会按顺序找一个**消息出口**：

1. `endpoint.subscribe(listener)` —— 最好的一种，因为它可以在 `open()` **之前**调用一次，这是唯一
   能保证「连接建立到订阅之间的消息不丢」的做法；
2. `connection.onMessage(listener)` —— 真实 `createSse()` 连接提供的方法（它同时提供按事件名订阅的
   `on(event, listener)`）；
3. 两者都没有：连接依然工作，`connected` / `error` 依然如实反映传输状态，只是 `messages` 永远为空。

::: warning `@Sse` 的 `options.events` 不是订阅机制
`@Sse(path, { events: [...] })` 里的 `events` 不会创建任何订阅，也无法替代 `@SseEvent(name)`。要接收
具名事件，请用 **`@SseEvent(name)` 装饰器**，或者在返回的连接上用 **`connection.on(name, fn)`** /
**`connection.onMessage(fn)`** 订阅（`SnailSseEndpoint.open()` 的声明返回类型是较窄的
`SnailConnection`，所以要用 `on` 时需要按 `SnailSseConnection` 收窄）。

同一份解析结果会同时分发给 `@SseEvent()` 处理器、`onMessage` 监听器和 `on(event)` 监听器，所以两套
写法可以共存。
:::

## 诚实地说，它的边界

- 一个自己掉线、从未被 `close()` 过的连接，它的出口还挂着；`open()` 会先 `detach` 上一个，这正是
  重连不会把每条消息都投递两次的原因。
- `opened` 与 `closed` 两个 promise 的拒绝都在这里被处理，因此一个死掉的服务器不会用 unhandled
  rejection 把进程带下去。
- filter 或 `onMessage` 抛错时，错误写进 `error` 而不会杀死流 —— 但它是可见的，不会被吞掉。
- 每条消息都会重新读一次 `connection.connected`，所以传输层自己掉了又连上时 `connected` 依然诚实，
  不需要定时器。
- `maxMessages` 超出时丢最旧的，**不区分**消息重要性；要按事件类型分流请用 `filter`。
- `clear()` 只清缓冲与 `lastMessage`，不会重置 `error`。

::: danger 没有 `Symbol.asyncDispose`
连接的释放方式是 **`close()`**，`SnailConnection` 上没有实现 `Symbol.asyncDispose`，所以
`await using connection = ...` 这种写法目前不成立。请在组件卸载 / 作用域结束时显式调用
`feed.close()`。
:::

## 相关

- [策略概览](../strategies.md)：状态形状、三个入口、公共选项
- [SSE / WebSocket / HTTP 流](../streaming.md)：`@Sse` 与连接契约
- [在服务端运行](../server-side.md)：SSE 依赖的 `fetch` / `ReadableStream` 是平台全局，不是 DOM API
