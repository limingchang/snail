# Plugin lifecycle

English | [中文](./plugin-lifecycle.md)

> The complete contract for `@snail-js/api` plugins. If you are writing a plugin, this
> document is the specification. If you are reading the core, it is the map.

---

## 1. The rule that shapes everything

**The core owns three things and nothing else:**

1. the metadata written by decorators,
2. the request pipeline,
3. the lifecycle described below.

Caching, versioning, interceptors, zod validation, JSON→class transformation and the
request pool are **all plugins**, built on exactly the API a third party gets. There
is no privileged internal path. If a built-in plugin needs a hook that does not
exist, the hook is added to the public contract, not faked internally.

The framework adapters (`SnailAdapter` / `VueRef` / `ReactState`) are the exception to
that rule: an adapter is **not** a plugin, it is the `@Server({ stateAdapter })` server
option. Core builds the five handles on `method.meta` from it, so no plugin has to
install one any more.

A plugin is a plain object:

```ts
interface SnailPluginObject<O = unknown> {
  readonly name: string;          // unique per server
  readonly priority?: number;     // higher runs first in the forward phase
  readonly dependsOn?: readonly string[];
  // …optional hooks, see §4
}
```

A **plugin factory** turns options into that object:

```ts
type SnailPlugin<O = unknown> = (options?: O) => SnailPluginObject<O>;
```

---

## 2. The request pipeline

One `send()` call walks exactly this sequence. Every hook in §4 belongs to one
arrow.

```
                       userApi.getUser("1")
                                │
                                ▼
                  ┌──── SnailMethod constructed ────┐
                  │  ctx created (state, meta,      │
                  │  request config, descriptors)   │
                  │  core creates the five meta     │
                  │  handles from stateAdapter;     │
                  │  initMeta only adds plugin ones │
                  └─────────────────────────────────┘
                                │
                       method.send(...args)
                                │
                  await pluginManager.ready          ← async `install` hooks settle
                                │
                          beforeCreate               ← effect, forward
                                │
                    apply @Params/@Query/@Data/@Header
                     finalize url (:placeholders)
                                │
              ╔═════════ beforeRequest (CHAIN) ═════════╗
              ║  highest priority ──────────────────▶   ║
              ║  a plugin may stop the chain here by    ║
              ║  not calling next()                     ║
              ╚═════════════════════════════════════════╝
                                │
                                │  ┌── short-circuit: a plugin set ctx.response
                                │  │   and declined next() (a cache hit)
                                │  │
                                ▼  ▼
                    ┌───────────────────────────┐
                    │ network step (skipped on a │
                    │ hit, see §2.3):            │
                    │  requestInterceptor        │
                    │  axios.request             │
                    │  JSON string coercion      │
                    │  responseInterceptor       │
                    └───────────────────────────┘
                                │
              ╔═════════ afterResponse (CHAIN) ═════════╗
              ║  lowest priority ───────────────────▶   ║
              ║  runs for a network response AND for a  ║
              ║  response served from a cache           ║
              ╚═════════════════════════════════════════╝
                                │
                  envelope + business code validation
                     build SnailResult, emit events
                                │
              ┌─────────────────┴─────────────────┐
        success path                        failure path
              │                                   │
        emit "success"                      onError (effect, unwind)
              │                            emit "error" / "codeError"
              └─────────────────┬─────────────────┘
                                ▼
                    afterRequest (effect, unwind)   ← always, in `finally`
                                │
                          emit "finish"
```

### 2.1 Priority and direction

Plugins sort by `priority` **descending**; ties break by registration order.

| Phase | Direction | Why |
| --- | --- | --- |
| `configureServer`, `configureApi`, `configureMethod`, `initMeta`, `beforeCreate`, `beforeRequest`, `requestInterceptor` | **forward** — highest priority first | an interceptor (`100`) must rewrite the request before the cache (`-100`) hashes it |
| `afterResponse`, `responseInterceptor`, `onError`, `afterRequest` | **unwind** — lowest priority first | closes the onion: the plugin nearest the network sees the response first |

Named reference bands — each one has an exported constant — so third-party plugins can
slot between built-ins:

| Priority | Constant | Plugin |
| --- | --- | --- |
| `100` | `INTERCEPTOR_PRIORITY` | interceptor |
| `50` | `VERSIONING_PRIORITY` | versioning |
| `20` | `TOKEN_AUTH_PRIORITY` | the plugin returned by `useTokenAuth` |
| `0` | `TRANSFORM_PRIORITY` | user plugins, transform |
| `-50` | `VALIDATE_PRIORITY` | validate |
| `-100` | `CACHE_PRIORITY` | cache |
| `-150` | `POOL_PRIORITY` | request pool |

The six plugin constants come from `@snail-js/api/plugins`; `TOKEN_AUTH_PRIORITY` comes
from `@snail-js/api/strategies`.

`priority` is an **open, unbounded number**: any integer is valid, and two dozen
plugins still do not collide, because only an *exact* tie matters and a tie breaks by
registration order. The table describes reference positions, not a closed set of
seven slots. To sit next to a built-in, position yourself relative to it:

```ts
import { CACHE_PRIORITY } from "@snail-js/api/plugins";

createPlugin({
  name: "key-rewrite",
  priority: CACHE_PRIORITY + 1,   // just before the cache going forward, just after it unwinding
  /* … */
});
```

The framework adapters are not in that table — an adapter is not a plugin.
`SnailAdapter` / `VueRef` / `ReactState` are chosen by `@Server({ stateAdapter })`, and
core builds the five handles on `method.meta` from it. See
[framework adapters](/guide/adapters).

### 2.2 Why two orderings and not one

A single onion would put `afterResponse` in forward order too, which is wrong for
the cache: the cache plugin is *last* to see the request (it only runs after the
url and body are final) but must be *first* to see the response (it stores the
raw envelope before validation and transformation touch it). Two directions, one
rule: **forward hooks run outermost-in, unwind hooks run innermost-out.**

### 2.3 A short-circuit is not a bypass

When a plugin supplies the response itself — the cache plugin on a hit is the only
built-in that does — the network step is skipped, but **`afterResponse` still
runs**.

That is deliberate, and the reason is worth stating because the obvious
implementation gets it wrong. `afterResponse` is where payload plugins live: zod
response validation and the JSON→class transform. Skipping it on a hit made the
*same call* return a hydrated DTO the first time and a plain object the second.
The chain belongs to the response, not to the transport.

What genuinely does not run on a hit is the network step: `requestInterceptor`,
`axios.request` and `responseInterceptor`. Those exist to rewrite a real request
and a real response.

Two consequences a plugin author must respect:

- A plugin that reacts to a hit should check `ctx.isCacheHit`. The cache plugin
  does exactly that: on a hit it neither stores nor purges tags, because the
  operation that was supposed to reach the server never happened. Without that
  check a stale-while-revalidate hit would overwrite the fresh value its own
  background refresh had just fetched.
- Anything a plugin hands back must be **copied** if it also stores it. The cache
  clones both on write and on read; sharing one object between the cache and the
  caller means a caller's in-place edit silently rewrites the cached entry.

---

## 3. Registration

```ts
const Service = new BackEnd();

Service.use(Interceptor()).use(Version({ defaultVersion: "1.0.0" }));
```

`use()` is **synchronous and chainable**. It validates immediately — a nameless
plugin, a duplicate name or an unsatisfied `dependsOn` throws `SnailPluginError`
before anything is mutated.

`install` may be synchronous or asynchronous:

- a **sync** `install` runs during `use()`, so anything it sets up is in place before
  the first `createApi()` call;
- an **async** `install` is recorded and awaited once, via `pluginManager.ready`,
  before the first request runs.

Use `remove(name)` / `remove(plugin)` to unregister (running `uninstall`), and
`Service.dispose()` to unregister everything.

```ts
await Service.remove("cache");
```

---

## 4. The hooks

### 4.1 Registration hooks

#### `install(context, options)`

Runs **once**, when the plugin is added to a server.

```ts
install?(context: SnailPluginInstallContext, options: O): void | Promise<void>;
```

```ts
interface SnailPluginInstallContext {
  readonly serverName: string;
  readonly serverOptions: ResolvedServerOptions;
  readonly pluginNames: readonly string[];
}
```

Use it to register parameter sources, contribute messages, open resources or
capture options in a closure. A throwing `install` rolls the registration back, so
a half-installed plugin is never observable.

#### `uninstall(context, options)`

Runs once, when the plugin is removed. Release timers, sockets and listeners here.

### 4.2 Configuration hooks

These run **once per decorated target**, not per request. Reach for them to adjust
options — never for per-request work.

#### `configureServer(options)`

Runs while the server instance is constructed. `options` is the resolved
`ResolvedServerOptions` and may be mutated in place.

```ts
configureServer(options) {
  options.timeout ??= 30000;
}
```

#### `configureApi(options, apiClass)`

Runs the first time `createApi(apiClass)` is called for a class.

#### `configureMethod(options, methodName, apiName)`

Runs the first time a decorated method is proxied. `options` is the merged method
options (axios config fields plus `url`).

### 4.3 Per-request hooks

#### `initMeta(ctx)` — synchronous, forward

**Purely an extension point**: core has already created the five standard handles
(`dataKey` / `codeKey` / `messageKey`, plus the fixed `loading` / `error`) from
`@Server({ stateAdapter })` when the `SnailMethod` was built, so no plugin installs an
adapter any more. Only a plugin that wants to add a handle of its **own** to
`ctx.meta` needs this hook:

```ts
initMeta(ctx) {
  ctx.meta.progress = ctx.serverOptions.stateAdapter.create(0);
}
```

It runs once, when the `SnailMethod` is constructed — **not** once per `send()` —
so the handles the UI captured stay identical across re-sends. `ctx.state` is
cleared per send; `ctx.meta` is not.

#### `beforeCreate(ctx)` — synchronous, forward

Runs at the start of every `send()`, after `initMeta`, before the argument
decorators are applied. The place to reset per-call bookkeeping:

```ts
beforeCreate(ctx) {
  ctx.serverOptions.stateAdapter.write(ctx.meta.loading, true);
}
```

#### `beforeRequest(ctx, next)` — **CHAIN**, forward

The request gate.

```ts
async beforeRequest(ctx, next) {
  await next();               // continue
}
```

- **Not calling `next()`** stops the pipeline. If `ctx.response` was set, that
  response is used; otherwise `send()` rejects with `SnailCancelledError`.
- **Setting `ctx.response` and calling `ctx.interrupt(response)`** serves a
  response without any network call — this is precisely a cache hit:

  ```ts
  beforeRequest(ctx) {
    const cached = cache.get(key);
    if (cached) {
      ctx.markCacheHit();
      ctx.interrupt(makeResponse(cached, ctx.request));
      return;                 // no next() → axios never runs
    }
    return next();
  }
  ```

- Calling `next()` more than once throws `SnailHookError` (§6).

#### `requestInterceptor(config, ctx)` — synchronous, **reduce**, forward

The last chance to rewrite the outgoing axios config. Each plugin receives the
config returned by the previous one; returning `undefined` keeps it.

```ts
requestInterceptor(config, ctx) {
  config.headers.set("x-request-id", crypto.randomUUID());
}
```

Unlike `beforeRequest`, this cannot stop the request — by the time it runs the
decision to send has been made. Prefer `beforeRequest` for control flow and this
for pure rewriting.

#### `afterResponse(ctx, next)` — **CHAIN**, unwind

Runs after a response exists and before the envelope is validated. Same `next()`
rules as `beforeRequest`; a plugin that skips `next()` ends the response chain
early, and later plugins plus envelope validation see whatever `ctx.response`
holds.

Because this is an *unwind* hook, the cache plugin (`-100`) runs first and the
interceptor (`100`) runs last.

#### `responseInterceptor(response, ctx)` — **reduce**, unwind

Rewrites the axios response. Returning `undefined` keeps the previous value.

#### `onError(ctx, error)` — effect, unwind

Observes a failure. It **cannot** recover one: the error is rethrown after every
`onError` hook has run. Recovering is `beforeRequest`'s job.

A throwing `onError` hook is logged and swallowed, so one broken error handler
cannot mask the original failure.

#### `afterRequest(ctx)` — effect, unwind

Runs in a `finally`, for success, failure and cancellation alike. Release
per-request resources here.

```ts
afterRequest(ctx) {
  clearTimeout(ctx.state.get("timer"));
}
```

Core resets `meta.loading` itself, after every `afterRequest` hook has run and before
the `finish` event; a plugin neither needs to nor should write it here.

---

## 5. Writing a plugin

`createPlugin` is the supported entry point. It validates the name, wires
`install`/`uninstall`, and hands your `setup` a scoped API.

```ts
import { createPlugin } from "@snail-js/api";

export interface TraceOptions {
  /** Header to write. Defaults to `x-trace-id`. */
  header?: string;
}

export const Trace = createPlugin<TraceOptions>({
  name: "trace",
  priority: 20,

  setup(options, api) {
    const header = options?.header ?? "x-trace-id";

    api.addMessages({ "trace.generated": "[%s] trace id %s" });

    return {
      requestInterceptor(config, ctx) {
        config.headers.set(header, ctx.state.get("traceId") ?? crypto.randomUUID());
      },
      afterRequest(ctx) {
        ctx.state.delete(header);
      }
    };
  }
});

Service.use(Trace({ header: "x-trace-id" }));
```

### The `setup` API

| Member | Purpose |
| --- | --- |
| `serverName` | name of the server the plugin was installed on |
| `serverOptions` | resolved server options |
| `installedPlugins` | names registered before this one |
| `defineParamSource(source, resolver)` | register a `@Source("key")` parameter source |
| `addMessages(messages)` | contribute translated messages |
| `onDispose(fn)` | register cleanup, run by `uninstall` |

### Adding a decorator

Third-party decorators are built from the same factories the core uses.

```ts
// 1. inside setup: register the source
api.defineParamSource("tenant", ({ ctx, value, key }) => {
  ctx.request.headers.set(key ?? "x-tenant", String(value));
});

// 2. expose a decorator
import { createParamDecorator } from "@snail-js/api";
export const Tenant = createParamDecorator("tenant");

// 3. use it
@Get("/orders")
orders(@Tenant("x-org-tenant") tenantId: string) {}
```

`defineParamSource` alone is enough — `createParamDecorator("tenant")` picks the
resolver up from the registry, which keeps the decorator and the plugin decoupled.

Also available: `createClassDecorator`, `createMethodDecorator`,
`createPropertyDecorator`, and `customMetadataKey(name)` for namespacing your own
keys (`"acme/tenant"` → `Symbol.for("@snail-js/api:custom:acme/tenant")`).

---

## 6. Chain invariants

`composeChain` enforces the Koa contract:

1. **`next()` may be called at most once per hook.** A second call throws
   `SnailHookError` naming the offending plugin. Without this guard the rest of
   the chain silently runs twice — a bug that presents as a duplicated request.
2. **`next()` must be awaited for the remainder to complete.** Returning before
   the `await` resolves lets `send()` proceed with a half-processed context.
3. **A hook that never calls `next()` ends the chain.** For `beforeRequest` that
   means no HTTP request; the result is whatever `ctx.response` holds, or a
   `SnailCancelledError`.

---

## 7. `ctx` reference

| Member | Notes |
| --- | --- |
| `ctx.server`, `ctx.serverOptions` | the owning server and its resolved options |
| `ctx.apiClass`, `ctx.api`, `ctx.apiName`, `ctx.apiOptions` | the decorated api |
| `ctx.methodName`, `ctx.methodType`, `ctx.route`, `ctx.fullName` | the request identity |
| `ctx.request` | the **live** `InternalAxiosRequestConfig`; mutate in place |
| `ctx.pathParams` | values collected by `@Params()` |
| `ctx.descriptors` | every parameter decorator application, sorted by index |
| `ctx.response` / `setResponse` / `getResponse` / `requireResponse` | the axios response |
| `ctx.result` / `setResult` | the assembled `SnailResult` |
| `ctx.error` | set on the failure path |
| `ctx.meta` | caller-visible reactive values; core creates the five standard handles from `stateAdapter`, and `initMeta` only adds a plugin's own |
| `ctx.state` | plugin scratch space (`StateBag`), cleared per send |
| `ctx.logger` | level-gated logger honouring `@Server({ logLevel })` |
| `ctx.interrupt(response?)` | stop the request, optionally serving a response |
| `ctx.isInterrupted` | whether the chain was stopped |
| `ctx.markCacheHit()` / `ctx.isCacheHit` | flags the `fromCache` result field |
| `ctx.elapsed` | milliseconds since `send()` started |
| `ctx.describe()` | shallow snapshot for logging |

`ctx.state` is per `send()`; `ctx.meta` lives for the whole `SnailMethod`. Putting
bookkeeping in `meta` leaks internal state into what the UI renders — use
`state`.

---

## 8. Testing a plugin

A plugin is testable without a network: install it on a server whose adapter is a
function, and assert on the recorded requests.

```ts
import { Server, SnailServer, Api, Get } from "@snail-js/api";

const requests: unknown[] = [];

@Server({
  baseURL: "/api",
  adapter: async (config) => {
    requests.push(config);
    return {
      data: { code: 0, message: "ok", data: { id: 1 } },
      status: 200,
      statusText: "OK",
      headers: {},
      config
    };
  }
})
class TestServer extends SnailServer {}
const Service = new TestServer();

Service.use(Trace());

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(): Promise<{ id: number }> {
    return null!;
  }
}

await Service.createApi(UserApi).getUser("1").send();
expect(requests).toHaveLength(1);
```

Recommended cases for any plugin: runs in the expected direction relative to a
second plugin at a known priority; is a no-op when its own condition is not met;
releases its resources in `afterRequest`; and throws nothing in the failure path.

---

## 9. Localization

Messages use `%s` placeholders and live in `locale/zh.ts` / `locale/en.ts`. A
plugin contributes its own with `api.addMessages({...})` from `setup`, or
`registerMessages({...})` from anywhere.

```ts
api.addMessages({
  "cache.hit": "[%s] 缓存命中",
  "cache.set": "[%s] 写入缓存"
});
```

A missing key returns the key itself rather than an empty string, so a typo is
visible instead of rendering a blank error message.

---

## 10. Version history of this contract

| Change | Reason |
| --- | --- |
| `PluginManager` became per-server | the old global manager plus a mutable `switchServer()` pointer let two concurrent servers read each other's plugins |
| Two chain directions (forward / unwind) | one onion cannot express "cache last in, first out" |
| `next()` may be called at most once | the old dispatcher re-ran the tail of the chain silently |
| `state` split from `meta` | plugin bookkeeping was leaking into the caller's reactive state |
| `install` may be sync | a plugin must be registered before the first `createApi()`, which a deferred install cannot guarantee |
| The five `meta` handles moved into core | they used to be created by an adapter plugin while strategy handles went through a separate process-wide registry; one framework had to be declared twice, and the global half was an import side effect. Now one `@Server({ stateAdapter })` drives both, and `initMeta` only adds a plugin's own handles |
| Framework adapters are no longer plugins | the old two adapters and three strategies entries made two servers with different frameworks impossible; an adapter is now a server option that supplies handles to `method.meta` and the strategies |
| `createPlugin` added | plugin authors had to hand-roll the object shape and got no validation |
| `afterResponse` moved out of the transport step | a cache hit skipped it, so response validation and transformation silently did nothing on the second call |
| The cache clones on write and on read | the cache and the caller shared one object, so an in-place edit by either rewrote the other (§2.3) |
| The cache skips store and tag purge on a hit | a stale hit was re-storing the old body over the fresh one its own background refresh had just fetched |
| `afterRequest` runs before the `finish` event | core resets `meta.loading` in that window, and `onFinish` was seeing a stale `loading === true` |
