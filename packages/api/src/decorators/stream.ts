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
 * Streaming / realtime decorators.
 *
 * Three transports, one idea: the decorated members only *describe* handlers,
 * and `Service.createSse(...)` / `createWebSocket(...)` / a `@HttpStream` method
 * turn them into a live connection.
 */

// ── SSE ─────────────────────────────────────────────────────────────────────

/** Handler names recorded for an SSE class. */
export interface SnailSseHandlers {
  open: Array<(event: Event) => void>;
  error: Array<(event: Event) => void>;
  events: Array<{ event: string; handler: (message: unknown) => void }>;
}

/**
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

/** Register a handler for the SSE `open` event. */
export function OnSseOpen(): MethodDecorator {
  return (target, propertyKey) => {
    appendSseHandler(target, propertyKey, (handlers, fn) => handlers.open.push(fn));
  };
}

/** Register a handler for the SSE `error` event. */
export function OnSseError(): MethodDecorator {
  return (target, propertyKey) => {
    appendSseHandler(target, propertyKey, (handlers, fn) => handlers.error.push(fn));
  };
}

/**
 * Register a handler for a named SSE event.
 *
 * @param event event name; omit for the default `message` event
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

/** Handler names recorded for a WebSocket class. */
export interface SnailWsHandlers {
  open: Array<(event: Event) => void>;
  message: Array<(event: MessageEvent) => void>;
  close: Array<(event: CloseEvent) => void>;
  error: Array<(event: Event) => void>;
}

/**
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

/** Register a handler for the socket `open` event. */
export function OnWsOpen(): MethodDecorator {
  return wsHandlerDecorator("open");
}

/** Register a handler for incoming messages. */
export function OnWsMessage(): MethodDecorator {
  return wsHandlerDecorator("message");
}

/** Register a handler for the socket `close` event. */
export function OnWsClose(): MethodDecorator {
  return wsHandlerDecorator("close");
}

/** Register a handler for the socket `error` event. */
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

/** Short alias for {@link WebSocket}. */
export const Ws = WebSocket;

// ── HTTP stream ─────────────────────────────────────────────────────────────

/**
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
