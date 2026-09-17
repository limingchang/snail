import type { SnailSseHandlers, SnailWsHandlers } from "../decorators/stream";
import type {
  SnailHttpStreamOptions,
  SnailSseOptions,
  SnailWsOptions
} from "../typings/stream";import { getMetadata } from "./metadata";
import {
  SNAIL_HTTP_STREAM,
  SNAIL_SSE_HANDLERS,
  SNAIL_SSE_OPTIONS,
  SNAIL_WS_HANDLERS,
  SNAIL_WS_OPTIONS
} from "./metadata.keys";

/** Resolved description of an `@Sse` endpoint. */
export interface ResolvedSseEndpoint {
  url: string;
  options: SnailSseOptions;
  handlers: SnailSseHandlers;
}

/** Resolved description of an `@WebSocket` endpoint. */
export interface ResolvedWsEndpoint {
  url: string;
  options: SnailWsOptions;
  handlers: SnailWsHandlers;
}

/** Resolved description of an `@HttpStream` method. */
export interface ResolvedHttpStreamEndpoint {
  url: string;
  options: SnailHttpStreamOptions;
}

const EMPTY_SSE_HANDLERS: SnailSseHandlers = { open: [], error: [], events: [] };
const EMPTY_WS_HANDLERS: SnailWsHandlers = {
  open: [],
  message: [],
  close: [],
  error: []
};

/** Read the `@Sse(...)` options and its registered handlers. */
export function resolveSseEndpoint(
  streamClass: unknown
): ResolvedSseEndpoint | undefined {
  const declared = getMetadata<SnailSseOptions & { url: string }>(
    SNAIL_SSE_OPTIONS,
    streamClass
  );
  if (!declared) return undefined;

  return {
    url: declared.url ?? "",
    options: declared,
    handlers:
      getMetadata<SnailSseHandlers>(SNAIL_SSE_HANDLERS, streamClass) ??
      EMPTY_SSE_HANDLERS
  };
}

/** Read the `@WebSocket(...)` options and its registered handlers. */
export function resolveWsEndpoint(
  streamClass: unknown
): ResolvedWsEndpoint | undefined {
  const declared = getMetadata<SnailWsOptions & { url: string }>(
    SNAIL_WS_OPTIONS,
    streamClass
  );
  if (!declared) return undefined;

  return {
    url: declared.url ?? "",
    options: declared,
    handlers:
      getMetadata<SnailWsHandlers>(SNAIL_WS_HANDLERS, streamClass) ??
      EMPTY_WS_HANDLERS
  };
}

/** Read the `@HttpStream(...)` options of one method. */
export function resolveHttpStreamEndpoint(
  apiClass: unknown,
  methodName: string
): ResolvedHttpStreamEndpoint | undefined {
  const declared = getMetadata<SnailHttpStreamOptions & { url: string }>(
    SNAIL_HTTP_STREAM,
    apiClass,
    methodName
  );
  if (!declared) return undefined;
  return { url: declared.url ?? "", options: declared };
}

/**
 * Turn an http(s) `baseURL` into the matching WebSocket origin.
 *
 * `https://api.example.com` → `wss://api.example.com`. A relative `baseURL`
 * (the common browser case) keeps working because `new WebSocket` resolves a
 * relative url against the document base — but the scheme still has to be
 * upgraded explicitly, which is what this does.
 */
export function toWebSocketURL(url: string): string {
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return url;
}

/**
 * Bind every SSE handler to the instance that will receive the events.
 *
 * Decorators only ever see the prototype, so the raw functions are stored and
 * bound here — one binding per `open()`, against the instance actually created by
 * `createSse`.
 */
export function rebindSseHandlers(
  handlers: SnailSseHandlers,
  instance: object
): SnailSseHandlers {
  return {
    open: handlers.open.map((fn) => fn.bind(instance)),
    error: handlers.error.map((fn) => fn.bind(instance)),
    events: handlers.events.map((entry) => ({
      event: entry.event,
      handler: entry.handler.bind(instance)
    }))
  };
}

/** Bind every WebSocket handler to the instance. @see rebindSseHandlers */
export function rebindWsHandlers(
  handlers: SnailWsHandlers,
  instance: object
): SnailWsHandlers {
  return {
    open: handlers.open.map((fn) => fn.bind(instance)),
    message: handlers.message.map((fn) => fn.bind(instance)),
    close: handlers.close.map((fn) => fn.bind(instance)),
    error: handlers.error.map((fn) => fn.bind(instance))
  };
}
