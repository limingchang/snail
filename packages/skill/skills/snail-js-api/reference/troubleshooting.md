# Troubleshooting

Each entry is **symptom → cause → fix**. Read the symptom you are seeing; the fix is almost always a
one-line change.

## `userApi.getUser("1")` sends nothing

**Cause** — a decorated method is a *factory*. Calling it builds a `SnailMethod`; nothing reaches the
network until `.send()`.

```ts
const method = userApi.getUser("1");                // ❌ no request
const result = await userApi.getUser("1").send();   // ✅
```

`method.pending`, `method.result` and `method.onSuccess(...)` exist precisely because you are
expected to hold the object and send it yourself.

## `undefined.send()`, or the real method body runs instead

**Cause** — the method has no request-method decorator, or the class has no `@Api()`. A method
without `@Get`/`@Post`/… is **passed through untouched** by the proxy, so the original body (usually
just `return null!`) runs and `.send()` is a `TypeError`. A missing `@Api()` is silently accepted,
but the class loses its url prefix and its name.

```ts
@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> { return null!; }   // ✅
}
```

## `SnailDecoratorError: route [/user/:id] has no value for placeholder [:id]`

**Cause** — the path has a `:placeholder` that no `@Params("...")` supplies. The parameter decorator
is what registers the value:

```ts
getUser(id: string): Promise<User> { return null!; }                 // ❌
getUser(@Params("id") id: string): Promise<User> { return null!; }   // ✅
```

## A rejected business code is not recovered by `onCodeError`

**Cause** — `onCodeError` is an **observer**, like every `on*` handler: they all run, then the promise
rejects with `SnailResponseError` regardless. To turn a bad code into a value, intervene earlier — a
plugin's `beforeRequest` can rewrite or serve `ctx.response`.

```ts
method.onCodeError((event) => toast(String(event.code)));   // ✅ observer only
try { await method.send(); }                                // ❌ still rejects — catch it
catch (error) { if (error instanceof SnailResponseError) toast(String(error.businessCode)); }
```

## `Module has no exported member 'Cache'` (or any other plugin)

**Cause** — plugins are not on the package root. Core comes from `@snail-js/api`; optional behaviour
comes from its own subpath.

```ts
import { Cache } from "@snail-js/api";                    // ❌
import { Cache } from "@snail-js/api/plugins";            // ✅
import { useRequest } from "@snail-js/api/strategies";    // ✅
```

## `VueAdapter` / `ReactAdapter` is not exported by `@snail-js/api/plugins`

**Cause** — they are not in that barrel, and cannot be: a re-export would make it statically import
`vue` and `react`, so importing `Cache` would demand both frameworks installed. They have their own
subpaths, and importing them from the barrel is a compile error, not a fallback.

```ts
import { VueAdapter } from "@snail-js/api/plugins";             // ❌ no such export
import { VueAdapter } from "@snail-js/api/plugins/vue";         // ✅
import { ReactAdapter, useMethodState } from "@snail-js/api/plugins/react";   // ✅
```

The barrel exports only cache, interceptor, versioning, validate and transform — see
[plugins.md](plugins.md).

## A second identical request never reaches the network

**Cause** — that is the cache plugin working. A hit is served from `beforeRequest` (L1, then L2), so
axios and every transport interceptor are skipped and the server never sees the request.

```ts
const first = await userApi.list().send();    // network
const second = await userApi.list().send();   // no network
second.fromCache;                             // ✅ true — check this, not a server log
```

To force a request, change something that takes part in the key (url/params/body), mark the method
`@NoCache()`, or call a method carrying `@Invalidates(...)`. See [plugins.md](plugins.md).

## Nothing is logged

**Cause** — `logLevel` defaults to `"silent"`; set it in the `@Server` options:
`@Server({ baseURL: "/api", logLevel: "debug" })`. Levels, in increasing verbosity: `silent`
(default), `error`, `warn`, `info`, `debug`.

## `SnailDecoratorError: method [x] already has a request-method decorator`

**Cause** — two verbs on one method. It throws **while the class is defined**, not at runtime.

```ts
@Get("/x")
@Post("/y")
both(): Promise<void> { return null!; }   // ❌ split it into two methods
```

## `@UseStrategy`, `Strategy extends`, `SnailApi`, `defineServiceConfig` do not exist

**Cause** — those are **0.1.x APIs that were removed**. Rename and restructure rather than shimming.

| Removed | Replacement |
| --- | --- |
| `@UseStrategy(MyStrategy)` | `use*` hooks from `@snail-js/api/strategies` |
| `class MyApi extends Strategy` | a plain class plus `@Api()` and `Service.createApi()` |
| `class MyService extends SnailApi` | `@Server({...}) class X extends SnailServer {}` |
| `defineServiceConfig({...})` | the `@Server({...})` options object |
| `switchServer(...)` / a global plugin manager | every server owns its own `pluginManager` |

## `result.data` is `undefined`, or `result.data.data` is undefined

**Cause** — `send()` resolves a `SnailResult`, and its `data` is already unwrapped; there is no second
envelope. If `result.data` itself is undefined, the body had no `dataKey` and the payload was passed
through unchanged — check `result.envelope` for what actually arrived.

## Options passed to `send()` are ignored

**Cause** — `send(...args)` re-supplies the **method arguments**, in order. It does not take an
options object, so an object argument lands wherever the signature puts it.

```ts
await userApi.getUser("1").send();                 // ✅
userApi.getUser("1").send({ full: true });         // ❌ that object becomes argument 0
```

Bake per-call overrides into the decorator options (`@Get("/x", { headers, timeout })`) or add a
decorated parameter to the signature.

## `Service.request(...)` did not unwrap the envelope

**Cause** — `Service.request(config)` is the "no decorated class" escape hatch. It runs the plugin
pipeline but resolves the **raw `AxiosResponse`**: no `SnailResult`, no business-code validation. Use
`createApi` when you want `{ code, message, data }` handling.

## A 4xx/5xx rejects with an `AxiosError`, not a `Snail` error

**Cause** — axios rejects on a non-2xx status, and the library only *translates* cancellation
(`SnailCancelledError`) and timeout (`SnailTimeoutError`). Branch on `isAxiosError(error)` (exported
by axios, not by this package) and read `error.response?.status`; `SnailResponseError` is only for a
2xx response whose **business code** was rejected.

## `new BackEnd()` throws `SnailOptionsError` (missing `@Server()`)

**Cause** — the server options are read from decorator metadata when the instance is built. A
`SnailServer` subclass without `@Server` has none, and a `baseURL` that is not a non-empty string
throws too.

```ts
class BackEnd extends SnailServer {}              // ❌ throws on `new BackEnd()`
@Server({ baseURL: "/api" })
class BackEnd extends SnailServer {}              // ✅
```

## Decorators do nothing at all

**Cause** — `experimentalDecorators` is off, and it is the only compiler option this library needs.
There is no metadata library to install: the library reads the metadata its own decorators write and
never consults TypeScript's design-time metadata, so `emitDecoratorMetadata` is pointless and must
not be enabled. Do not install `reflect-metadata` and do not add it to `types`; do not add `baseUrl`
to a tsconfig either — TypeScript 7 removed it. Enable `"experimentalDecorators": true` and leave
everything else at its default.

## A plugin is registered but never runs

**Cause** — three ways: `use()` ran on a **different** server instance than `createApi` came from
(plugins are per server, there is no global registry); the plugin hooks a phase your call never
reaches (`@HttpStream` bypasses the plugin pipeline — see [streaming.md](streaming.md)); or
`await Service.remove("x")` was never awaited, or `dispose()` ran before the request. Also check the
priority: unwind hooks (`afterResponse`, `afterRequest`) run in **ascending** priority order, the
opposite of forward hooks.

## A download is buffered with `responseType: "blob"`

**Cause** — `await`ing a blob loads the whole file into JavaScript memory (twice: body plus object
url), with no progress, no resume and an out-of-memory tab on a large export. Let the server mint a
temporary url instead and navigate to it, so the browser streams to disk:

```ts
const { url, filename } = (await reportApi.create(query).send()).data;   // no bytes yet
triggerDownload(url, { filename });                                      // root export
// or await only that request and keep loading/error state:
const { download } = useDownload(reportApi.create);
await download(query);
```
