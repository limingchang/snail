import type { SnailStateAdapter, SnailStateRef, SnailStrategyCommonOptions } from "../typings/adapter";
import type { SnailConnection, SnailSseEndpoint, SnailSseMessage } from "../typings/stream";
import { noop } from "../utils/object";
import { bindRef, resolveStateAdapter } from "./shared/adapter";

/**
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
  /** Register a message listener. Returns an unsubscribe function. */
  onMessage?(listener: (message: SnailSseMessage) => void): () => void;
}

/** A `SnailSseEndpoint` that can also hand out messages directly. */
export interface SseEndpoint extends SnailSseEndpoint {
  /**
   * Register a message listener for the connections this endpoint opens.
   *
   * Preferred over {@link SseConnectionTap} because it can be called once, before
   * `open()`, which is the only way to be sure no message between the connect and
   * the subscription is lost.
   */
  subscribe?(listener: (message: SnailSseMessage) => void): () => void;
}

/** Options accepted by {@link useSSE}. */
export interface UseSseOptions {
  /** State adapter. Defaults to the globally registered one. */
  adapter?: SnailStateAdapter;

  /**
   * Open the connection as soon as the hook is created. Defaults to `false`,
   * matching `SnailSseEndpoint`'s "nothing connects until `open()`" contract.
   */
  immediate?: boolean;

  /**
   * Maximum buffered messages. Defaults to `100`, dropping the oldest first.
   *
   * Bounded on purpose: an SSE feed that runs for hours with an unbounded array
   * is a memory leak that ends in a frozen tab, and no view can render a hundred
   * thousand rows anyway.
   */
  maxMessages?: number;

  /** Keep only the messages this returns `true` for. */
  filter?: (message: SnailSseMessage) => boolean;

  /** Called for every accepted message, after the buffer was updated. */
  onMessage?: (message: SnailSseMessage) => void;
}

/** What {@link useSSE} returns. */
export interface UseSseResult {
  /** Buffered messages, oldest first. */
  readonly messages: SnailStateRef<SnailSseMessage[]>;

  /** The most recent accepted message. */
  readonly lastMessage: SnailStateRef<SnailSseMessage | undefined>;

  /** `true` between a successful connect and the next close. */
  readonly connected: SnailStateRef<boolean>;

  /** Why the connection failed, or why a filter/handler threw. */
  readonly error: SnailStateRef<unknown>;

  /** Connect. A no-op while an open connection is already live. */
  open(): void;

  /** Disconnect, stop the reconnect loop and detach the listener. */
  close(): void;

  /** Empty the message buffer. Leaves the connection alone. */
  clear(): void;

  /** Resolved values, subscribing the current component when the adapter supports it. */
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
 */
export function useSSE(endpoint: SseEndpoint, options: UseSseOptions = {}): UseSseResult {
  const adapter = resolveStateAdapter(options);
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
