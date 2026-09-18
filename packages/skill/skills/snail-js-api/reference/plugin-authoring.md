# Writing a plugin

Every piece of optional behaviour in this library is a plugin, and a third-party plugin gets the same
API the built-ins use — there is no privileged internal path. This page is the practical form of
`docs/guide/plugin-lifecycle.md`, the authoritative contract.

```ts
import { createPlugin } from "@snail-js/api";

export const Trace = createPlugin<{ header?: string }>({
  name: "trace",                                    // unique per server
  priority: 20,                                     // higher runs first; default 0
  setup(options, api) {
    const header = options?.header ?? "x-trace-id";
    api.addMessages({ "trace.generated": "[%s] trace id %s" });
    return {
      requestInterceptor(config, ctx) {
        config.headers.set(header, ctx.state.get("traceId") ?? crypto.randomUUID());
      },
      afterRequest(ctx) { ctx.state.delete("traceId"); }
    };
  }
});

Service.use(Trace({ header: "x-trace-id" }));       // installs immediately
```

A plugin object is `{ name, priority?, dependsOn?, …hooks }`; a **factory** turns options into
that object (`SnailPlugin<O> = (options?: O) => SnailPluginObject<O>`). `definePlugin` is the same
thing without the name validation, for a plugin that takes no options.

## `setup` and the scoped API

`setup(options, api)` runs **once**, when the plugin is registered, and returns the hooks.

| Member | Purpose |
| --- | --- |
| `serverName` | name of the server the plugin was installed on |
| `serverOptions` | fully resolved server options |
| `installedPlugins` | names registered before this one |
| `defineParamSource(source, resolver)` | register a `@Source("key")` parameter source |
| `addMessages(messages)` | contribute translated messages for your own output |
| `onDispose(fn)` | register cleanup, run by `uninstall` |

`install` may be async; `pluginManager.ready` awaits every pending install once, before the first
request. A synchronous install runs inside `Service.use()`, which guarantees a plugin's `initMeta`
exists before the first `createApi()`. A throwing `install` rolls back.

## Where a hook runs

```text
send() → beforeCreate → apply @Params/@Query/@Data + :placeholders
       → beforeRequest (CHAIN) → requestInterceptor → axios.request
       → responseInterceptor → afterResponse (CHAIN) → code validation → "success"
       … onError on failure, afterRequest in finally → "finish"
```

| Hook | Kind | Direction | Runs |
| --- | --- | --- | --- |
| `configureServer(options)` | config | forward | once, when the server instance is built |
| `configureApi(options, apiClass)` | config | forward | once per api class, on first proxy |
| `configureMethod(options, methodName, apiName)` | config | forward | once per decorated method |
| `install` / `uninstall` | registration | — | once, on `use()` / `remove()` |
| `initMeta(ctx)` | effect, sync | forward | once per `SnailMethod`, **not** per `send()` |
| `beforeCreate(ctx)` | effect, sync | forward | start of every `send()` |
| `beforeRequest(ctx, next)` | **chain** | forward | request gate |
| `requestInterceptor(config, ctx)` | reduce | forward | last chance to rewrite the axios config |
| `afterResponse(ctx, next)` | **chain** | unwind | response exists, envelope not yet validated |
| `responseInterceptor(response, ctx)` | reduce | unwind | rewrite the axios response |
| `onError(ctx, error)` | effect | unwind | observes a failure, cannot recover it |
| `afterRequest(ctx)` | effect | unwind | `finally`: success, failure and cancellation |

Config hooks run once per decorated target, never per request; `initMeta` runs when the `SnailMethod` is constructed, so a UI that captured its handles keeps them across re-sends.

## Priority bands

`priority` is an unbounded number: any integer is valid, and only an exact tie falls back to
registration order, so any number of plugins can coexist. The bands below are named reference points
exported as constants, not slots — position yourself relative to a neighbour (`CACHE_PRIORITY + 1`)
instead of hardcoding a magic number.

| Priority | Constant | Band |
| --- | --- | --- |
| `100` | `INTERCEPTOR_PRIORITY` | interceptor |
| `50` | `VERSIONING_PRIORITY` | version |
| `20` | `TOKEN_AUTH_PRIORITY` | `useTokenAuth` (returned by the call, not installed) |
| `0` | `TRANSFORM_PRIORITY` | transform, and user plugins by default |
| `-50` | `VALIDATE_PRIORITY` | validate |
| `-100` | `CACHE_PRIORITY` | cache |
| `-150` | `POOL_PRIORITY` | request pool |

Forward hooks run highest-first, unwind hooks lowest-first: **forward hooks run outermost-in,
unwind hooks run innermost-out.** That is what makes the cache plugin last to see the request (url
and body are final) and first to see the response (it stores the raw envelope before validation).

## The two chain hooks

1. **`next()` may be called at most once per hook.** A second call throws `SnailHookError` naming
   the plugin; without that guard the rest of the chain would run twice — a duplicated request.
2. **`next()` must be awaited** for the remainder to complete.
3. **Not calling `next()` ends the chain.** For `beforeRequest` that means no HTTP call at all —
   the result is whatever `ctx.response` holds, or a `SnailCancelledError`.

Serving a response without the network — exactly a cache hit:

```ts
beforeRequest(ctx) {
  const cached = store.get(key(ctx));
  if (cached) {
    ctx.markCacheHit();
    ctx.interrupt(asAxiosResponse(cached, ctx.request));  // any helper that shapes
    return;                                                // { data, status, headers, config }
  }
  return next();
}
```

`afterResponse` follows the same rules; skipping `next()` ends the response chain early, and later
plugins plus envelope validation see whatever `ctx.response` holds. `requestInterceptor` /
`responseInterceptor` are **not** chain hooks: they are reduces in priority order, and returning
`undefined` keeps the previous value. They cannot stop a request — by then the decision to send has
been made, so use `beforeRequest` for control flow and these for pure rewriting. `onError` is
observation only: the error is rethrown after every `onError` ran, and a throwing `onError` is
logged and swallowed.

## `ctx.state` vs `ctx.meta`

```ts
initMeta(ctx) {                     // caller-visible: the UI's reactive handles
  ctx.meta.loading = ref(false);
},
beforeCreate(ctx) {                 // per-send bookkeeping: plugin-internal
  ctx.state.set("t0", Date.now());
  (ctx.meta.loading as Ref<boolean>).value = true;
}
```

* `ctx.state` is a `StateBag` (`get`/`require`/`set`/`setDefault`/`has`/`delete`/`clear`/`keys`/
  `snapshot`), **cleared on every `send()`**. Timers, cache keys and in-flight promises go here.
* `ctx.meta` lives as long as the `SnailMethod` and is what a caller renders; bookkeeping there
  leaks internal state into the UI.

Also on `ctx`: `request`, `response`, `result`, `error`, `pathParams`, `descriptors`, `logger`, `elapsed`, `interrupt(response?)`, `isInterrupted`, `markCacheHit()`, `describe()`.

## Adding a decorator

```ts
// 1. inside setup: register the source — this is what makes the decorator work
api.defineParamSource("tenant", ({ ctx, value, key }) => {
  ctx.request.headers.set(key ?? "x-tenant", String(value));
});
// 2. build the decorator on it, once, anywhere
import { createParamDecorator } from "@snail-js/api";
export const Tenant = createParamDecorator("tenant");
// 3. use it
@Get("/orders")
orders(@Tenant("x-org-tenant") tenantId: string): Promise<Order[]> { return null!; }
```

`defineParamSource` alone is enough: `createParamDecorator("tenant")` resolves the source from the
registry at decoration time, which keeps decorator and plugin decoupled. Passing a resolver to
`createParamDecorator(source, resolver)` skips the registry for a decorator that is not tied to a
plugin. The resolver receives `{ ctx, value, key, options, index, methodName }`, where `options` is
the object form of the decorator argument (`@Tenant({ key: "x-org" })`).

## Testing a plugin

Test without a network: install the plugin on a server whose axios adapter is a function.

```ts
import { Api, Get, Server, SnailServer } from "@snail-js/api";

const requests: unknown[] = [];

@Server({
  baseURL: "/api",
  adapter: async (config) => {
    requests.push(config);
    return { data: { code: 0, message: "ok", data: { id: 1 } }, status: 200,
             statusText: "OK", headers: {}, config };
  }
})
class TestServer extends SnailServer {}
const Service = new TestServer();
Service.use(Trace());

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(): Promise<{ id: number }> { return null!; }
}

await Service.createApi(UserApi).getUser().send();
// assert on `requests`
```

Four cases worth writing: the plugin runs in the expected direction relative to a second plugin at a
known priority; it is a no-op when its condition is not met; it releases resources in `afterRequest`;
and it throws nothing on the failure path.

## Before you register

* A name must be unique per server and every `dependsOn` name must already be registered — both
  throw `SnailPluginError` from `use()`, before anything is mutated.
* `remove()` runs `uninstall`, which drains every `onDispose` callback. Ship the factory from its
  own module, and keep its option object explicit rather than positional.
