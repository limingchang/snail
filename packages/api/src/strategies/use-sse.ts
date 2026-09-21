import type { SnailStateAdapter, SnailStateRef, SnailStrategyCommonOptions } from "../typings/adapter";
import type { SnailConnection, SnailSseEndpoint, SnailSseMessage } from "../typings/stream";
import { noop } from "../utils/object";
import { bindRef, resolveStateAdapter } from "./shared/adapter";

/**
 * 一个能报告自己解析出的事件的连接。
 *
 * `SnailConnection` 刻意只暴露 `close`/`connected`/`opened`/`closed`，因为消息被投递给端点类
 * 上 `@SseEvent()` 处理器的连接不需要别的接口面。`useSSE` 没有那样的类，因此它在连接上寻找
 * 这个扩展，找不到就在端点上找。两者都没有时，`connected` 仍能跟踪传输层，但 `messages`
 * 会一直是空的——见 {@link useSSE} 的说明。
 *
 * A connection that can report the events it parsed.
 *
 * `SnailConnection` deliberately exposes only `close`/`connected`/`opened`/
 * `closed`, because a connection whose messages are delivered to `@SseEvent()`
 * handlers on the endpoint class needs no other surface. `useSSE` has no such
 * class, so it looks for this extension on the connection and, failing that, on
 * the endpoint. Without either, `connected` still tracks the transport but
 * `messages` stays empty — see the note on {@link useSSE}.
 */
export interface SseConnectionTap {
  /**
   * 注册消息监听器。返回取消订阅函数。
   *
   * Register a message listener. Returns an unsubscribe function.
   */
  onMessage?(listener: (message: SnailSseMessage) => void): () => void;
}

/**
 * 还能直接交出消息的 `SnailSseEndpoint`。
 *
 * A `SnailSseEndpoint` that can also hand out messages directly.
 */
export interface SseEndpoint extends SnailSseEndpoint {
  /**
   * 为这个端点开启的连接注册消息监听器。
   *
   * 优先于 {@link SseConnectionTap}，因为它可以在 `open()` 之前调用一次，这是确保连接与订阅
   * 之间没有消息丢失的唯一办法。
   *
   * Register a message listener for the connections this endpoint opens.
   *
   * Preferred over {@link SseConnectionTap} because it can be called once, before
   * `open()`, which is the only way to be sure no message between the connect and
   * the subscription is lost.
   */
  subscribe?(listener: (message: SnailSseMessage) => void): () => void;
}

/**
 * {@link useSSE} 接受的选项。
 *
 * Options accepted by {@link useSSE}.
 */
export interface UseSseOptions {
  /**
   * 本 hook 句柄使用的 state adapter。
   *
   * 默认取创建该端点的 server 的 `stateAdapter`，回退到 `SnailAdapter`。
   * `Service.createSse()` 把它的 server 记录在返回的端点上，正是为了让这里可以继承，而不必
   * 重复。
   *
   * State adapter for this hook's handles.
   *
   * Defaults to the `stateAdapter` of the server that created the endpoint, falling
   * back to `SnailAdapter`. `Service.createSse()` records its server on the endpoint
   * it returns precisely so this can be inherited rather than repeated.
   */
  adapter?: SnailStateAdapter;

  /**
   * hook 创建时立刻打开连接。默认 `false`，与 `SnailSseEndpoint`「`open()` 之前不连接」
   * 的契约一致。
   *
   * Open the connection as soon as the hook is created. Defaults to `false`,
   * matching `SnailSseEndpoint`'s "nothing connects until `open()`" contract.
   */
  immediate?: boolean;

  /**
   * 缓冲消息上限。默认 `100`，超出时丢弃最旧的。
   *
   * 刻意设界：一条跑上几小时的 SSE 流配上无界数组就是内存泄漏，最终会让标签页卡死，而任何
   * 视图也渲染不了十万行。
   *
   * Maximum buffered messages. Defaults to `100`, dropping the oldest first.
   *
   * Bounded on purpose: an SSE feed that runs for hours with an unbounded array
   * is a memory leak that ends in a frozen tab, and no view can render a hundred
   * thousand rows anyway.
   */
  maxMessages?: number;

  /**
   * 只保留返回 `true` 的消息。
   *
   * Keep only the messages this returns `true` for.
   */
  filter?: (message: SnailSseMessage) => boolean;

  /**
   * 每条被接受的消息都会调用，在缓冲区更新之后。
   *
   * Called for every accepted message, after the buffer was updated.
   */
  onMessage?: (message: SnailSseMessage) => void;
}

/**
 * {@link useSSE} 的返回值。
 *
 * What {@link useSSE} returns.
 */
export interface UseSseResult {
  /**
   * 缓冲的消息，最旧的在前。
   *
   * Buffered messages, oldest first.
   */
  readonly messages: SnailStateRef<SnailSseMessage[]>;

  /**
   * 最近一条被接受的消息。
   *
   * The most recent accepted message.
   */
  readonly lastMessage: SnailStateRef<SnailSseMessage | undefined>;

  /**
   * 从连接成功到下一次关闭之间为 `true`。
   *
   * `true` between a successful connect and the next close.
   */
  readonly connected: SnailStateRef<boolean>;

  /**
   * 连接失败的原因，或过滤器/处理器抛出的错误。
   *
   * Why the connection failed, or why a filter/handler threw.
   */
  readonly error: SnailStateRef<unknown>;

  /**
   * 建立连接。已有连接存活时是空操作。
   *
   * Connect. A no-op while an open connection is already live.
   */
  open(): void;

  /**
   * 断开连接、停止重连循环并摘下监听器。
   *
   * Disconnect, stop the reconnect loop and detach the listener.
   */
  close(): void;

  /**
   * 清空消息缓冲。不影响连接。
   *
   * Empty the message buffer. Leaves the connection alone.
   */
  clear(): void;

  /**
   * 解析后的值；adapter 支持时会订阅当前组件。
   *
   * Resolved values, subscribing the current component when the adapter supports it.
   */
  bind(): {
    messages: SnailSseMessage[];
    lastMessage: SnailSseMessage | undefined;
    connected: boolean;
    error: unknown;
  };
}

/** Find the message tap an endpoint or its connection offers, if any. */
function attachTap(
  endpoint: SseEndpoint,
  connection: SnailConnection,
  listener: (message: SnailSseMessage) => void
): () => void {
  if (typeof endpoint.subscribe === "function") {
    return endpoint.subscribe(listener) ?? noop;
  }

  const onMessage = (connection as SnailConnection & SseConnectionTap).onMessage;
  if (typeof onMessage === "function") {
    return onMessage.call(connection, listener) ?? noop;
  }

  // No tap: the connection still works, its messages just go to the endpoint
  // class's `@SseEvent()` handlers instead of to this hook's buffer.
  return noop;
}

/**
 * 把 Server-Sent Events 端点当作响应式状态消费。
 *
 * ## 消息接入点
 *
 * `Service.createSse()` 返回的对象只有一个成员 `open()`，它解析出的消息被派发给装饰过的类
 * 的方法（`@SseEvent()`），而不是调用方。因此 `useSSE` 接受额外实现了 `subscribe(listener)`
 * 的端点，或实现了 `onMessage(listener)` 的连接。两者都在不改变核心契约的前提下扩展它；
 * 两者都没实现的端点仍然可靠地报告 `connected`/`error`，只是永远不填充 `messages`。
 *
 * ## 绝不产生未处理的拒绝
 *
 * 失败的 SSE 连接正是通过被拒绝的 `opened` promise 报告的，而应用里不会有别的东西去 await
 * 它。这里同时处理了 `opened` 和 `closed`，因此一个死掉的服务器不会用未处理的拒绝把进程
 * 拖垮。
 *
 * Consume a Server-Sent Events endpoint as reactive state.
 *
 * ```ts
 * const events = Service.createSse(Events);
 * const feed = useSSE(events, { maxMessages: 50 });
 * feed.open();
 * feed.messages.value;   // SnailSseMessage[]
 * feed.close();
 * ```
 *
 * ## The message tap
 *
 * `Service.createSse()` returns an object whose only member is `open()`, and the
 * messages it parses are dispatched to the decorated class's methods
 * (`@SseEvent()`), not to the caller. `useSSE` therefore accepts an endpoint that
 * additionally implements `subscribe(listener)`, or a connection that implements
 * `onMessage(listener)`. Both extend the core contract without changing it; an
 * endpoint that implements neither still reports `connected`/`error` faithfully,
 * it just never fills `messages`.
 *
 * ## Never an unhandled rejection
 *
 * A rejected `opened` promise is exactly how a failed SSE connect is reported, and
 * nothing else in the application will ever await it. Both `opened` and `closed`
 * are handled here, so a dead server cannot take the process down with an
 * unhandled rejection.
 *
 * @param endpoint 要消费的 SSE 端点 / The SSE endpoint to consume.
 * @param options SSE 选项 / The SSE options.
 * @returns 消息、连接状态与 `open`/`close` 等操作 / Messages, connection state and the
 *   `open`/`close` operations.
 */
export function useSSE(endpoint: SseEndpoint, options: UseSseOptions = {}): UseSseResult {
  // `endpoint` is passed so the hook inherits the server's adapter: `createSse`
  // records this server's options on the endpoint it hands back.
  const adapter = resolveStateAdapter(options, endpoint);
  const maxMessages = Number.isFinite(options.maxMessages)
    ? Math.max(1, Math.floor(options.maxMessages as number))
    : 100;

  const messages = adapter.create<SnailSseMessage[]>([]);
  const lastMessage = adapter.create<SnailSseMessage | undefined>(undefined);
  const connected = adapter.create<boolean>(false);
  const error = adapter.create<unknown>(undefined);

  let connection: SnailConnection | undefined;
  let detach: (() => void) | undefined;
  let listening = false;

  function handle(message: SnailSseMessage): void {
    try {
      if (options.filter && !options.filter(message)) return;

      const buffered = [...adapter.read(messages), message];
      if (buffered.length > maxMessages) buffered.splice(0, buffered.length - maxMessages);

      adapter.write(messages, buffered);
      adapter.write(lastMessage, message);
      options.onMessage?.(message);
    } catch (cause) {
      // A throwing filter or handler is the caller's bug; it must not kill the
      // stream, but it must be visible rather than swallowed.
      adapter.write(error, cause);
    }

    // A transport that dropped and reconnected reports it through `connected`;
    // reading it on every message is what keeps the flag honest without a timer.
    adapter.write(connected, connection?.connected ?? adapter.read(connected));
  }

  function open(): void {
    if (listening) return;

    // A previous connection that dropped on its own was never `close()`d, so its
    // tap is still registered. Releasing it here is what stops a reconnect from
    // delivering every message twice.
    detach?.();
    detach = undefined;

    const next = endpoint.open();
    connection = next;
    listening = true;

    // Attached before `opened` is awaited so no message is missed between the
    // connect and the first render.
    detach = attachTap(endpoint, next, handle);

    adapter.write(connected, next.connected);
    adapter.write(error, undefined);

    void next.opened.then(
      () => {
        if (connection !== next) return;
        adapter.write(connected, true);
        adapter.write(error, undefined);
      },
      (cause: unknown) => {
        if (connection !== next) return;
        adapter.write(connected, false);
        adapter.write(error, cause);
      }
    );

    void next.closed.then(
      () => {
        if (connection !== next) return;
        listening = false;
        adapter.write(connected, false);
      },
      () => {
        if (connection !== next) return;
        listening = false;
        adapter.write(connected, false);
      }
    );
  }

  function close(): void {
    const current = connection;
    connection = undefined;
    listening = false;
    adapter.write(connected, false);

    detach?.();
    detach = undefined;

    // `close()` on the transport aborts the request and resolves `closed`, which is
    // what actually stops the reconnect loop.
    current?.close();
  }

  function clear(): void {
    adapter.write(messages, []);
    adapter.write(lastMessage, undefined);
  }

  if (options.immediate) open();

  return {
    messages,
    lastMessage,
    connected,
    error,
    open,
    close,
    clear,
    bind() {
      return {
        messages: bindRef(adapter, messages),
        lastMessage: bindRef(adapter, lastMessage),
        connected: bindRef(adapter, connected),
        error: bindRef(adapter, error)
      };
    }
  };
}
