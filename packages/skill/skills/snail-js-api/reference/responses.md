# Responses

The library assumes every JSON endpoint answers with one envelope:

```json
{ "code": 0, "message": "ok", "data": { "id": 7 } }
```

Both the **key names** and the **shape** are configurable. Read the keys off the resolved
server options — never hardcode `"code"`/`"message"`/`"data"` in application code without
checking `@Server`.

## What `send()` resolves to

```ts
const result = await api.getUser("1").send();
```

| Field | Type | Notes |
| --- | --- | --- |
| `result.data` | the method's declared return type | **already unwrapped** — `envelope[dataKey]` |
| `result.envelope` | `{ code, message, data }` | exactly what the server sent, untouched |
| `result.code` | `number \| string \| undefined` | the business code |
| `result.message` | `string \| undefined` | the business message |
| `result.response` | `AxiosResponse` | the axios response |
| `result.fromCache` | `boolean` | `true` only when the cache plugin served it |
| `result.config` | `InternalAxiosRequestConfig` | the final request config |

```ts
const { data, code, message, fromCache } = await api.getUser("1").send();
data.id            // ✅
data.data          // ❌ undefined — there is no second envelope
```

A bare payload (no `dataKey` in the body) is passed through: `unwrapEnvelope` returns the body
itself when the response is not envelope-shaped, so a plain text or array response still ends
up on `result.data`.

## Business-code validation

`assertBusinessCode` rejects the request with `SnailResponseError` when the configured rule
returns `false`. The default rule accepts `0` and `200`.

```ts
@Server({
  baseURL: "/api",
  validateCode: (code, envelope) => code === 1      // your backend's convention
})
class BackEnd extends SnailServer {}
```

* A **missing** code key (`undefined`/`null`) passes validation — the library cannot judge a
  code that was not sent, so a bare payload never fails on a code.
* `SnailResponseError` carries `businessCode` and the full `payload`, so an error handler can
  still read `error.payload.message`.

```ts
try {
  await api.getUser("1").send();
} catch (error) {
  if (error instanceof SnailResponseError) {
    toast(error.payload.message);
    toast(String(error.businessCode));
  }
}
```

## Custom key names and a typed envelope

Key names travel together with the server's generics, positionally:
`SnailServer<ServerResponse, DataKey, CodeKey, MessageKey>`.

```ts
@Server({
  baseURL: "/api",
  codeKey: "status",
  messageKey: "msg",
  dataKey: "result",
  validateCode: (code) => code === 1
})
class BackEnd extends SnailServer<SnailEnvelopeSchema, "result", "status", "msg"> {}

const result = await Service.createApi(XApi).get().send();
result.data       // typed by the method's return annotation
result.code       // number  (envelope["status"])
result.envelope   // { status, msg, result, … }
```

To reshape the default envelope for the whole application, augment the interface once:

```ts
// env.d.ts
declare module "@snail-js/api" {
  interface SnailEnvelopeSchema {
    status: number;
    msg: string;
    result: unknown;
  }
}
```

`SnailResult<S, T, D, C, M>` is exported if you need to name the type yourself, e.g. for a
helper that returns `Promise<SnailResult<SnailEnvelopeSchema, User>>`.

## Raw payloads

`Blob`, `ArrayBuffer`, `ReadableStream<Uint8Array>`, `FormData` and `Document` have no
`code`/`message`/`data`, so `SnailRawPayload` / `IsRawPayload` make the result type the body
itself. Set the axios `responseType` per method:

```ts
@Get("/report", { responseType: "blob" })
download(): Promise<Blob> { return null!; }
// result.data is the Blob — do not look for an envelope
```

Use this for a genuinely raw payload (an avatar, an archive you are going to parse).
For a **file the user should save**, do not buffer it: have the server mint a
temporary url and hand that to `useDownload` / `triggerDownload` instead. See the
`responseType: "blob"` entry in `troubleshooting.md`.

## JSON string bodies

When `coerceJSONString` is on (the default) and the body is a `string` that starts with `{` or
`[`, the library parses it before validation. This repairs a gateway that answers
`Content-Type: text/plain` while sending a JSON envelope; a genuinely textual response stays a
string. Turn it off with `@Server({ coerceJSONString: false })`.

## Errors

```ts
import {
  SnailError,            // base: `.code` (stable string) and `.cause`
  SnailDecoratorError,   // bad decorator usage, missing :placeholder, key-less non-object
  SnailOptionsError,     // missing @Server, invalid baseURL, invalid @Api url
  SnailResponseError,    // rejected business code: `.businessCode`, `.payload`
  SnailRequestError,     // no response was produced at all
  SnailTimeoutError,     // exceeded `timeout`: `.timeout`
  SnailCancelledError,   // `method.abort()` or an AbortSignal
  SnailPluginError,      // plugin registration: name, duplicate, dependsOn
  SnailHookError,        // a plugin called next() twice
  SnailHttpError         // exported; a transport status carrier for plugin/strategy use
} from "@snail-js/api";
```

* A **non-2xx status** rejects with axios' own `AxiosError` — only cancellation and timeout are
  translated. Branch on `isAxiosError(error)` for 4xx/5xx.
* Every Snail error is an `instanceof SnailError`, and `SnailError.isSnailError(value)` narrows
  an unknown catch value.

```ts
import { isAxiosError } from "axios";
import { SnailCancelledError, SnailResponseError } from "@snail-js/api";

try {
  await api.getUser("1").send();
} catch (error) {
  if (error instanceof SnailCancelledError) return;             // expected control flow
  if (error instanceof SnailResponseError) return toast(error.payload.message);
  if (isAxiosError(error)) return toast(`${error.response?.status}`);
  throw error;
}
```

## Method events and introspection

```ts
const method = api.getUser("1");

method.onSuccess((result) => { /* result is a SnailResult */ });
method.onError((error) => { /* transport/decorator failures */ });
method.onCodeError((event) => {
  // OBSERVATION ONLY. event = { code, payload, error }.
  // The promise still rejects with SnailResponseError — use beforeRequest / a
  // plugin to recover, never this hook.
  toast(String(event.code));
});
method.onFinish(() => { /* always last, success or failure */ });
method.onHitCache(() => { /* the cache plugin served this send() */ });

const promise = method.send();
method.abort();                      // → promise rejects with SnailCancelledError

method.pending;                      // true while in flight
method.result;                       // last SnailResult
method.error;                        // last error
method.request;                      // final axios config of the last send()
method.meta;                         // reactive handles created by an adapter plugin
```

Event order is `success` → `finish` on success, and `codeError`/`error` → `finish` on failure.
Each `on*` returns an unsubscribe function.
