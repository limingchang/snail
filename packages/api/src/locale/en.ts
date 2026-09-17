import type { SnailMessages } from "./types";

/** English message catalogue. */
const en: SnailMessages = {
  // decorator misuse
  "error.decorator.method.duplicate": "method [%s] already has a request-method decorator (@Get/@Post/...)",
  "error.decorator.method.missing": "method [%s] has no request-method decorator (@Get/@Post/...), cannot send a request",
  "error.decorator.param.context": "@%s may only be used on an instance method parameter",
  "error.decorator.param.empty": "bad parameter on method [%s]: a key-less @%s argument must be a plain object",
  "error.decorator.param.untyped": "@%s needs a string key, or no key at all to spread the whole object",
  "error.decorator.class.target": "@%s may only be applied to a class",
  "error.decorator.server.notFound": "api class [%s] is missing the @Api() decorator",
  "error.decorator.stream.duplicate": "class [%s] already has a connection decorator (@Sse/@WebSocket)",

  // options
  "error.options.server.missing": "server class [%s] is missing the @Server() decorator",
  "error.options.server.baseURL": "@Server() baseURL must be a non-empty string",
  "error.options.api.url": "@Api() url must be a string",
  "error.options.plugin.notFound": "plugin [%s] is not registered on server [%s]",
  "error.options.plugin.missing": "plugin [%s] depends on [%s], which has not been registered yet — call use() first",
  "error.options.plugin.exists": "plugin [%s] is already registered on server [%s]",

  // hooks
  "error.hook.next.multiple": "plugin [%s] called next() more than once inside the %s hook",
  "error.hook.unknown": "unknown plugin lifecycle hook [%s]",

  // request / response
  "error.request.failed": "[%s] request failed: %s",
  "error.request.timeout": "[%s] request timed out (%sms)",
  "error.request.cancelled": "[%s] request cancelled",
  "error.response.code": "[%s] business status code rejected: code=%s",
  "error.response.shape": "[%s] response does not match the agreed envelope: missing [%s]",
  "error.response.json": "[%s] failed to parse the JSON response: %s",

  // path params
  "error.path.missing": "route [%s] has no value for placeholder [:%s] — add @Params('%s') to the method parameter",

  // plugins
  "error.plugin.validate.request": "[%s] request payload failed validation",
  "error.plugin.validate.response": "[%s] response payload failed validation",
  "error.plugin.transform": "[%s] payload transform failed: %s",
  "error.plugin.cache.adapter": "unknown cache adapter [%s]; expected one of memory, localStorage, sessionStorage, indexedDB",

  // info
  "info.request.start": "→ %s %s [%s]",
  "info.request.success": "← %s %s [%s] %s",
  "info.request.codeError": "← %s %s [%s] bad business code %s",
  "info.request.error": "← %s %s [%s] %s",
  "info.cache.hit": "[%s] cache hit",
  "info.cache.set": "[%s] cached",
  "info.cache.invalidate": "[%s] cache invalidated (source: %s)",
  "info.version.default": "[%s] using default version %s",
  "info.version.change": "[%s] version switched to %s",
  "warn.version.change": "[%s] version differs from the default: %s → %s",
  "info.sse.open": "[%s] SSE connection opened",
  "info.sse.close": "[%s] SSE connection closed",
  "info.ws.open": "[%s] WebSocket connection opened",
  "info.ws.close": "[%s] WebSocket connection closed (code=%s)"
};

export default en;
