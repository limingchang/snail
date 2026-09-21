import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type {
  SnailHttpStreamOptions,
  SnailSseOptions,
  SnailWsOptions
} from "../typings/stream";
import { defineMetadata, getOwnMetadata, mergeMetadata } from "../core/metadata";
import {
  SNAIL_HTTP_STREAM,
  SNAIL_SSE_HANDLERS,
  SNAIL_SSE_OPTIONS,
  SNAIL_WS_HANDLERS,
  SNAIL_WS_OPTIONS
} from "../core/metadata.keys";
import type { SnailMethodType } from "../typings/api";

/**
 * 流式 / 实时装饰器。
 *
 * 三种传输方式，一个思路：被装饰的成员只*描述*处理函数，再由
 * `Service.createSse(...)` / `createWebSocket(...)` / 一个 `@HttpStream` 方法把它们
 * 变成真实连接。
 *
 * Streaming / realtime decorators.
 *
 * Three transports, one idea: the decorated members only *describe* handlers,
 * and `Service.createSse(...)` / `createWebSocket(...)` / a `@HttpStream` method
 * turn them into a live connection.
 */

// ── SSE ─────────────────────────────────────────────────────────────────────

/**
 * 为一个 SSE 类记录的处理函数集合。
 *
 * Handler names recorded for an SSE class.
 */
export interface SnailSseHandlers {
  /**
   * 为 `open` 事件注册的处理函数，按注册顺序调用。
   *
   * Handlers registered for the `open` event, invoked in registration order.
   */
  open: Array<(event: Event) => void>;
  /**
   * 为 `error` 事件注册的处理函数，按注册顺序调用。
   *
   * Handlers registered for the `error` event, invoked in registration order.
   */
  error: Array<(event: Event) => void>;
  /**
   * 具名事件与对应的处理函数；未指定名称的事件记为默认的 `message`。
   *
   * Named events with their handlers; an unnamed event is recorded as the
   * default `message` event.
   */
  events: Array<{ event: string; handler: (message: unknown) => void }>;
}

/**
 * 声明一个 Server-Sent Events 端点。
 *
 * 传输层用 `fetch` 加流读取器，而不是 `EventSource`：正是这一点让请求头、`POST`
 * 和 `withCredentials` 成为可能，而这些 `EventSource` 都不支持。
 *
 * Declare a Server-Sent Events endpoint.
 *
 * ```ts
 * @Sse("/events")
 * class Ticker {
 *   @OnSseOpen()
 *   open() { console.log("connected"); }
 *
 *   @OnSseError()
 *   failed(event: Event) { console.warn("lost", event); }
 *
 *   @SseEvent()                       // the default `message` event
 *   message(message: SnailSseMessage) {}
 *
 *   @SseEvent("tick")
 *   tick(message: SnailSseMessage) {}
 * }
 *
 * const ticker = Service.createSse(Ticker);
 * const connection = ticker.open();
 *
 * // Decorate with @SseEvent, or subscribe on the connection itself:
 * const off = connection.on("tick", (message) => console.log(message.data));
 * connection.close();
 * ```
 *
 * The transport is `fetch` + a stream reader rather than `EventSource`: that is
 * what makes request headers, `POST` and `withCredentials` possible, none of which
 * `EventSource` supports.
 *
 * @param path SSE 端点路径 / SSE endpoint path
 * @param options 可选的 SSE 选项 / Optional SSE options
 */
export function Sse(path: string, options: SnailSseOptions = {}): ClassDecorator {
  return (target) => {
    if (typeof target !== "function") {
      throw new SnailDecoratorError(t("error.decorator.class.target", "Sse"));
    }
    if (getOwnMetadata(SNAIL_WS_OPTIONS, target)) {
      throw new SnailDecoratorError(
        t("error.decorator.stream.duplicate", target.name)
      );
    }
    mergeMetadata(SNAIL_SSE_OPTIONS, { ...options, url: path }, target);
  };
}

/**
 * 为 SSE `open` 事件注册一个处理函数。
 *
 * Register a handler for the SSE `open` event.
 */
export function OnSseOpen(): MethodDecorator {
  return (target, propertyKey) => {
    appendSseHandler(target, propertyKey, (handlers, fn) => handlers.open.push(fn));
  };
}

/**
 * 为 SSE `error` 事件注册一个处理函数。
 *
 * Register a handler for the SSE `error` event.
 */
export function OnSseError(): MethodDecorator {
  return (target, propertyKey) => {
    appendSseHandler(target, propertyKey, (handlers, fn) => handlers.error.push(fn));
  };
}

/**
 * 为具名 SSE 事件注册一个处理函数。
 *
 * Register a handler for a named SSE event.
 *
 * @param event 事件名；省略时为默认的 `message` 事件 /
 *   event name; omit for the default `message` event
 */
export function SseEvent(event = "message"): MethodDecorator {
  return (target, propertyKey) => {
    appendSseHandler(target, propertyKey, (handlers, fn) => {
      handlers.events.push({ event, handler: fn });
    });
  };
}

function appendSseHandler(
  target: any,
  propertyKey: string | symbol | undefined,
  push: (handlers: SnailSseHandlers, fn: any) => void
): void {
  if (propertyKey === undefined) {
    throw new SnailDecoratorError("[snail] SSE handler decorators must be used on methods");
  }
  const fn = target[propertyKey];
  if (typeof fn !== "function") {
    throw new SnailDecoratorError(
      `[snail] @SseEvent/@OnSseOpen/@OnSseError must decorate a method, got "${String(propertyKey)}"`
    );
  }

  const handlers: SnailSseHandlers =
    getOwnMetadata<SnailSseHandlers>(SNAIL_SSE_HANDLERS, target) ?? {
      open: [],
      error: [],
      events: []
    };

  // Stored unbound: the decorator only sees the prototype, and binding there
  // would make `this` the prototype instead of the instance. `createSse` binds
  // each handler to the instance it creates.
  push(handlers, fn);
  defineMetadata(SNAIL_SSE_HANDLERS, handlers, target);
}

// ── WebSocket ───────────────────────────────────────────────────────────────

/**
 * 为一个 WebSocket 类记录的处理函数集合。
 *
 * Handler names recorded for a WebSocket class.
 */
export interface SnailWsHandlers {
  /**
   * 为 socket `open` 事件注册的处理函数，按注册顺序调用。
   *
   * Handlers registered for the socket `open` event, invoked in registration order.
   */
  open: Array<(event: Event) => void>;
  /**
   * 为收到的每条消息注册的处理函数，按注册顺序调用。
   *
   * Handlers registered for every incoming message, invoked in registration order.
   */
  message: Array<(event: MessageEvent) => void>;
  /**
   * 为 socket `close` 事件注册的处理函数，按注册顺序调用。
   *
   * Handlers registered for the socket `close` event, invoked in registration order.
   */
  close: Array<(event: CloseEvent) => void>;
  /**
   * 为 socket `error` 事件注册的处理函数，按注册顺序调用。
   *
   * Handlers registered for the socket `error` event, invoked in registration order.
   */
  error: Array<(event: Event) => void>;
}

/**
 * 声明一个 WebSocket 端点。
 *
 * Declare a WebSocket endpoint.
 *
 * ```ts
 * @WebSocket("/ws")
 * class ChatSocket {
 *   @OnWsOpen()   connected() {}
 *   @OnWsMessage() incoming(event: MessageEvent) {}
 *   @OnWsClose()  gone(event: CloseEvent) {}
 *   @OnWsError()  failed(event: Event) {}
 * }
 *
 * const chat = Service.createWebSocket(ChatSocket);
 * const socket = chat.open();
 * socket.send({ hello: "world" });
 * ```
 *
 * @param path WebSocket 端点路径 / WebSocket endpoint path
 * @param options 可选的 WebSocket 选项 / Optional WebSocket options
 */
export function WebSocket(path: string, options: SnailWsOptions = {}): ClassDecorator {
  return (target) => {
    if (typeof target !== "function") {
      throw new SnailDecoratorError(t("error.decorator.class.target", "WebSocket"));
    }
    if (getOwnMetadata(SNAIL_SSE_OPTIONS, target)) {
      throw new SnailDecoratorError(
        t("error.decorator.stream.duplicate", target.name)
      );
    }
    mergeMetadata(SNAIL_WS_OPTIONS, { ...options, url: path }, target);
  };
}

/**
 * 为 socket `open` 事件注册一个处理函数。
 *
 * Register a handler for the socket `open` event.
 */
export function OnWsOpen(): MethodDecorator {
  return wsHandlerDecorator("open");
}

/**
 * 为收到的消息注册一个处理函数。
 *
 * Register a handler for incoming messages.
 */
export function OnWsMessage(): MethodDecorator {
  return wsHandlerDecorator("message");
}

/**
 * 为 socket `close` 事件注册一个处理函数。
 *
 * Register a handler for the socket `close` event.
 */
export function OnWsClose(): MethodDecorator {
  return wsHandlerDecorator("close");
}

/**
 * 为 socket `error` 事件注册一个处理函数。
 *
 * Register a handler for the socket `error` event.
 */
export function OnWsError(): MethodDecorator {
  return wsHandlerDecorator("error");
}

function wsHandlerDecorator(
  kind: keyof SnailWsHandlers
): MethodDecorator {
  return (target, propertyKey) => {
    if (propertyKey === undefined) {
      throw new SnailDecoratorError("[snail] WebSocket handler decorators must be used on methods");
    }
    const fn = (target as Record<string | symbol, unknown>)[propertyKey];
    if (typeof fn !== "function") {
      throw new SnailDecoratorError(
        `[snail] @OnWs* must decorate a method, got "${String(propertyKey)}"`
      );
    }

    const handlers: SnailWsHandlers =
      getOwnMetadata<SnailWsHandlers>(SNAIL_WS_HANDLERS, target) ?? {
        open: [],
        message: [],
        close: [],
        error: []
      };

    // Stored unbound, for the reason given in `appendSseHandler`.
    (handlers[kind] as Array<unknown>).push(fn);
    defineMetadata(SNAIL_WS_HANDLERS, handlers, target);
  };
}

/**
 * `{@link WebSocket}` 的简短别名。
 *
 * Short alias for {@link WebSocket}.
 */
export const Ws = WebSocket;

// ── HTTP stream ─────────────────────────────────────────────────────────────

/**
 * 声明一个流式 HTTP 端点。
 *
 * 与 `@Get`/`@Post` 不同，被代理的方法返回的是流控制器而不是 `SnailMethod`，
 * 因此不会做响应信封校验。
 *
 * Declare a streaming HTTP endpoint.
 *
 * ```ts
 * @Api("/ai")
 * class AiApi {
 *   @HttpStream("/chat", { method: "POST" })
 *   chat(@Data() prompt: { text: string }) {}
 * }
 *
 * const stream = aiApi.chat({ text: "hi" });
 * for await (const chunk of stream.stream()) { render(chunk); }
 * ```
 *
 * Unlike `@Get`/`@Post`, the proxied method returns a stream controller instead
 * of a `SnailMethod`, so no envelope validation happens.
 *
 * @param path 端点路径，默认为空字符串 / Endpoint path, empty by default
 * @param options 可选的流式选项 / Optional streaming options
 */
export function HttpStream(
  path = "",
  options: SnailHttpStreamOptions = {}
): MethodDecorator {
  return (target, propertyKey) => {
    if (propertyKey === undefined) {
      throw new SnailDecoratorError("[snail] @HttpStream must decorate a method");
    }
    defineMetadata(
      SNAIL_HTTP_STREAM,
      { ...options, url: path },
      target,
      propertyKey
    );
  };
}
