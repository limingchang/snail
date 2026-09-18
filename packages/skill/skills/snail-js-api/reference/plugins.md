# Plugins

Every built-in plugin comes from a subpath — never the package root, which carries only the core
(server, decorators, metadata, errors, localization, types). `@snail-js/api/plugins` exports exactly
`Cache`, `Cacheable`, `NoCache`, `Invalidates`, `HitSource`, `Interceptor`, `BeforeRequest`,
`AfterResponse`, `Versioning`, `Version`, `Validate`, `ValidateResponse`, `Transform`, `PropertyType`,
`ExposeName`, `RequestPool`, `RequestPoolScheduler`, `poolStats`, `clearPool`, `isPoolError`,
`SnailPoolError`, `POOL_ERROR_CODES`, the six `*_PRIORITY` constants, plus cache adapters and types.

**Every plugin here is framework-agnostic, and no framework adapter is here.** `VueRef` and
`ReactState` are `SnailStateAdapter` values — not plugins — imported from `@snail-js/api/adapter/vue`
and `@snail-js/api/adapter/react` and declared as `@Server({ stateAdapter })`; core builds the five
`method.meta` handles (`data`/`code`/`message` plus `loading`/`error`) from it when a `SnailMethod`
is built, so `initMeta` now only extends them. Re-exporting a framework would statically import
`vue`/`react` — see [troubleshooting.md](troubleshooting.md).

| Entry point | Contents |
| --- | --- |
| `@snail-js/api/plugins` | cache, interceptor, versioning, validate, transform, request pool |

Strategy hooks come from `@snail-js/api/strategies`; their adapters are in [strategies.md](strategies.md).

## Ordering

Plugins sort by `priority` **descending**; ties keep registration order, so `use()` order does not
change the result. `Service.use(p)` is synchronous and chainable, and throws `SnailPluginError`
immediately for a missing name, a duplicate or an unsatisfied `dependsOn`. `await Service.remove(name)`
and `await Service.dispose()` are asynchronous, so an unawaited `remove()` races the next request;
`Service.hasPlugin(name)` and `Service.plugins` inspect the registry.

| Priority | Plugin |
| --- | --- |
| `100` | `Interceptor` |
| `50` | `Versioning` |
| `20` | `useTokenAuth` (returned by the call, not a built-in to install) |
| `0` | `Transform`, and your plugins by default |
| `-50` | `Validate` |
| `-100` | `Cache` |
| `-150` | `RequestPool` |

Forward hooks (`beforeRequest`) run highest first, unwind hooks (`afterResponse`) lowest first: the
cache keys the final url and body and is first to see the response (raw envelope, before validation
and transformation), while the pool — last forward — gates only what the cache could not answer.
Bands are **named references, not slots**: `priority` is unbounded, only exact ties matter (they keep
registration order), and each band is exported — `INTERCEPTOR_PRIORITY`, `VERSIONING_PRIORITY`,
`TRANSFORM_PRIORITY`, `VALIDATE_PRIORITY`, `CACHE_PRIORITY`, `POOL_PRIORITY`, plus
`TOKEN_AUTH_PRIORITY` in `@snail-js/api/strategies` — so position against a neighbour, not a magic
number (`CACHE_PRIORITY + 1`). Chain: [plugin-authoring.md](plugin-authoring.md).

## Cache — `Cache(options?)`, priority `-100`

`import { Cache, Cacheable, NoCache, Invalidates, HitSource } from "@snail-js/api/plugins";`

* `ttl` — `60` — seconds; a non-positive value falls back to 60. `maxSize` — `100` — L1 LRU size;
  `l1` — `true` — the in-memory LRU layer on/off. `l2` — none — a persistent store:
  `"localStorage"` | `"sessionStorage"` | `"indexedDB"` | a `CacheAdapter` object. A missing
  environment global warns once and degrades to L1; an unknown string throws `SnailPluginError`
  from `use()`.
* `cacheFor` — `["GET"]` — verbs cached when no decorator decides; `"all"` is allowed. `prefix` — the
  server name — key prefix. `staleWhileRevalidate` — `false` — serve the stale entry now, refresh in
  the background. `dedupe` — `true` — collapse concurrent identical requests.

All four decorators apply to a class **and** a method:

* `@Cacheable({ ttl?, tags?, key? })` — opt in. It caches even a verb `cacheFor` omits, so caching
  a POST requires it. `key` makes every call of that method share one entry.
* `@NoCache()` — opt out. `@Invalidates(...tags)` — purge tagged entries once this request succeeds
  (a failure invalidates nothing); the purge runs before the store, so a method may invalidate a tag
  it writes. `@HitSource(name)` — alias of `@Invalidates(name)`.

**Precedence:** method `@NoCache` → method `@Cacheable` → class `@NoCache` → class `@Cacheable` →
`cacheFor`. Tags merge (class then method); `ttl`/`key` do not — the most specific wins. A hit
stores `response.data` (the raw envelope), never reaches axios, and still flows through the unwind
hooks. `Cache()` exposes `manager` once installed: `await cache.manager?.invalidateAll()`.

```ts
Service.use(Cache({ ttl: 30, l2: "localStorage" }));
@Api("/user")
class UserApi {
  @Get("/")
  @Cacheable({ tags: ["users"] })
  list(): Promise<User[]> { return null!; }    // the second send() never touches axios
  @Post("/")
  @Invalidates("users")                        // a write purges the list
  create(@Data() body: NewUser): Promise<User> { return null!; }
}
```

## RequestPool — `RequestPool(options?)`, priority `-150`

`import { RequestPool, poolStats, isPoolError } from "@snail-js/api/plugins";`

Bounds how many requests are in flight: the last forward hook before the transport, **below** the
cache (`-100`), so a request the cache answers never spends a slot. The slot covers the transport
only — a failure, a validation throw and a cancellation all return it in a `finally`.

* `concurrency` — `6` — in flight at once. `maxQueue` — `Infinity` — how many may *wait*, a finite
  value refusing any extra at once. `queueTimeout` — `0` (no limit) — ms a queued request may wait.
* `priority` — none — `(ctx) => number`, **lower runs first**; ties keep arrival order, a request
  that finds a free slot never queues, and a throwing callback counts as `0`.

`poolStats(plugin)` reads `{ active, queued, concurrency }`, `plugin.scheduler?.setConcurrency(n)`
raises the ceiling, and `clearPool(plugin, reason?)` drops the queued requests (uninstalling too).
A refusal rejects with `SnailPoolError` **before the network** — hence `isPoolError(error)`, and hence
a retry is safe; `error.code` is one of `POOL_ERROR_CODES` (`queueFull`, `queueTimeout`, `aborted`,
`cleared`). `RequestPoolScheduler` is exported as well.

```ts
Service.use(RequestPool({ concurrency: 6, maxQueue: 50, queueTimeout: 10_000 }));
try { await reportApi.create(query).send(); } catch (e) { if (isPoolError(e)) retryLater(); }
```

## Interceptor — `Interceptor(options?)`, priority `100`

`import { Interceptor, BeforeRequest, AfterResponse } from "@snail-js/api/plugins";`

* `request` — `[]` / `response` — `[]` — server-wide request/response entries, after the class/method
  ones. An entry is `{ onFulfilled?(value, ctx), onRejected?(error, ctx) }`, where `value` is the
  live `InternalAxiosRequestConfig` or the `AxiosResponse`. Returning `undefined` keeps the value
  received; `onRejected` returning a **value** adopts it and continues — the only recovery point.
* `@BeforeRequest(onFulfilled, onRejected?)` — class and method; class entries run before method
  entries, then the server-wide list. An unrecoverable failure stops the request before the network.
* `@AfterResponse(onFulfilled, onRejected?)` — class and method, against the response that exists;
  it can replace the response but never stop the request.

```ts
const interceptors = Interceptor();
Service.use(interceptors);
interceptors.request.use({ onFulfilled: (c) => { c.timeout = 5000; } });
@Api("/user")
class UserApi {
  @Get("/:id")
  @BeforeRequest((config, ctx) => { config.headers.set("x-trace", ctx.fullName); })
  getUser(@Params("id") id: string): Promise<User> { return null!; }
}
```

`use(entry)` returns an id for `eject(id)`; `clear()` drops every entry.

## Versioning — `Versioning(options)`, priority `50`

`import { Versioning, Version } from "@snail-js/api/plugins";`

* `type` — `"url"` — `"url"` | `"header"` | `"query"` | `"custom"`. `key` — `"v"` (url/query),
  `"x-api-version"` (header), `""` (custom). `extractor` — none — `(version, ctx) => { url?, headers?,
  params? }`, required for `"custom"`.
* `defaultVersion` — **required** — the version when nothing declares one; non-empty, or `use()` throws.

`@Version("1.2.0")` declares a version on a class or method; resolution is method → class →
`defaultVersion`. `url` mode prepends `<key><version>` as the first path segment (`/user/1` →
`/v1.2.0/user/1`); absolute urls and urls already carrying the segment are left alone. The rewrite
touches the live request only — never `baseURL`.

```ts
Service.use(Versioning({ type: "url", defaultVersion: "1.0.0" }));
@Api("/user")
@Version("1.2.0")
class UserApi {
  @Get("/legacy")
  @Version("0.9.0")                            // this method only
  legacy(): Promise<void> { return null!; }
}
```

## Validate — `Validate(options?)` / `@Validate(schema)`, priority `-50`

`import { Validate, ValidateResponse, SnailValidationError } from "@snail-js/api/plugins";`

One name, two roles, told apart by the argument: a zod schema (an object with `safeParse`) returns
the decorator, anything else the plugin. `zod` is an optional peer — install and import it yourself.

* `request` — none — fallback request schema. `response` — none — fallback response schema.
  `strict` — `true` — an invalid **request** aborts the call.
* `@Validate(schema)` / `@ValidateResponse(schema)` work on a class or method; the method wins, and
  a decorator always beats the fallback. The request schema validates `ctx.request.data` when a body
  exists, else `ctx.request.params`; neither present means skipped.

**An invalid request fails hard**: `send()` rejects with `SnailValidationError` (`.issues` is zod's
list) and axios is never reached. **An invalid response only warns** and the payload is still
delivered. `Validate({ strict: false })` downgrades the request check to a warning too.

```ts
import { z } from "zod"; Service.use(Validate());
@Post("/")
@Validate(z.object({ name: z.string().min(1) }))
@ValidateResponse(z.object({ id: z.number() }))
create(@Data() body: CreateUser): Promise<User> { return null!; }
```

## Transform — `Transform(options?)` / `@Transform(DtoClass)`, priority `0`

`import { Transform, PropertyType, ExposeName } from "@snail-js/api/plugins";`

Same dual-name pattern: a constructor function returns the decorator, an options object the plugin.
It replaces `result.data` with DTO instances, so `instanceof` holds. No third-party dependency.

* `dto` — none — fallback DTO. `keepUnknown` — `false` — copy JSON keys the DTO does not declare.
  `maxDepth` — `32` — recursion bound for nested or cyclic JSON.
* `@Transform(DtoClass)` works on a class or method (method wins) and beats the fallback.
  `@PropertyType(() => ChildDto, { array?: boolean })` declares one property's runtime type — the
  resolver is lazy so two DTOs may reference each other; primitives need no declaration.
  `@ExposeName("json_key")` reads a property from a differently named JSON key; nothing is needed to
  *exclude* a key.

Undeclared keys are dropped once the DTO declares any property (a decorated one, or a field the
constructor initialises); a DTO declaring none receives every key. A DTO's own
`static fromJSON(raw, ctx)` wins over automatic hydration, and a hydration failure warns and leaves
the raw JSON. On unwind Transform runs *after* Validate, so a schema compares the backend's JSON.

```ts
Service.use(Transform());
class UserDto {
  @ExposeName("user_name") userName!: string;
  @PropertyType(() => Date) createdAt!: Date;
}
// on the api class or on one method: @Transform(UserDto)
const user = (await userApi.getUser("1").send()).data;
user instanceof UserDto;            // true
user.createdAt instanceof Date;     // true
```

Writing your own plugin — `createPlugin`, the hook order, the chain rules, `ctx.state` — is in
[plugin-authoring.md](plugin-authoring.md).
