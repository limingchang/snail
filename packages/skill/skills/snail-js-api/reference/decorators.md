# Decorators

Every decorator this package ships, in the order you meet them. All of them are exported from the
package root (`@snail-js/api`); nothing here needs a subpath import.

```ts
import {
  Server, SnailServer, Api,
  Get, Post, Put, Delete, Patch, Head, Options, Request,
  Params, Query, Data, HeaderValue, HeaderParam, Header,
  UploadProgress, DownloadProgress,
  Sse, SseEvent, OnSseOpen, OnSseError, WebSocket, Ws, OnWsOpen, OnWsMessage, OnWsClose, OnWsError,
  HttpStream,
  createClassDecorator, createMethodDecorator, createParamDecorator, createPropertyDecorator,
  customMetadataKey, getClassMetadata, getMethodMetadata, getOwnMethodMetadata
} from "@snail-js/api";
```

`@Sse`, `@WebSocket` and `@HttpStream` are covered in [streaming.md](streaming.md).

## `@Server` — declare a server class

```ts
import { Server, SnailServer } from "@snail-js/api";

@Server({ baseURL: "/api", timeout: 10000, name: "main" })
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

The string shorthand is `{ baseURL }`:

```ts
@Server("/api")
class BackEnd extends SnailServer {}
```

Applying `@Server` twice merges the objects, the inner one winning, which makes
`@Server(base)` + `@Server(overrides)` composable. **A subclass without `@Server` throws
`SnailOptionsError` when it is instantiated** — `resolveServerOptions` has no metadata to
resolve.

`SnailServerOptions` (all optional, defaults in parentheses):

| Option | Meaning |
| --- | --- |
| `name` | server id, namespaces logging/cache (decorated class name) |
| `baseURL` | prefix every url resolves against (`"/"`) |
| `timeout` | milliseconds (`10000`) |
| `adapter` | axios adapter; unset = axios' own detection |
| `stateAdapter` | framework state bridge — `SnailAdapter` (default), or `VueRef` / `ReactState` from `@snail-js/api/adapter/vue|react` |
| `headers`, `params` | merged into every request |
| `responseType` | axios `responseType` for every request |
| `withCredentials` | cookies / cross-site auth headers |
| `codeKey`, `messageKey`, `dataKey` | envelope keys (`"code"`, `"message"`, `"data"`) |
| `validateCode` | `(code, envelope) => boolean`; default accepts `0` and `200` |
| `logLevel` | `"silent"` \| `"error"` \| `"warn"` \| `"info"` \| `"debug"` (`"silent"`) |
| `coerceJSONString` | parse a JSON body sent as text (`true`) |

See [responses.md](responses.md) for the envelope keys and code validation.

## The `SnailServer` instance

| Member | Purpose |
| --- | --- |
| `use(plugin)` | register a plugin; **synchronous and chainable** |
| `remove(plugin \| "name")` | unregister; **async**, returns `boolean` |
| `hasPlugin(name)`, `plugins` | inspect the registry |
| `createApi(Class)` | turn a decorated class into a proxy (the only way to send) |
| `createSse(Class)`, `createWebSocket(Class)` | stream endpoints |
| `request(config)` | one-off axios request that still runs plugins; resolves the **raw `AxiosResponse`**, not a `SnailResult` |
| `dispose()` | uninstall every plugin |
| `describe()` | resolved options + registered plugins, for tooling |
| `name`, `options`, `axios`, `pluginManager` | the resolved server |

```ts
import { definePlugin } from "@snail-js/api";

const Timing = definePlugin(() => ({
  name: "timing",
  beforeRequest: (ctx) => { ctx.state.set("t0", Date.now()); },
  afterRequest: (ctx) => console.log("took", ctx.elapsed)
}));

Service.use(Timing());                              // use() chains and is synchronous
const api = Service.createApi(UserApi);             // cached per class
const method = api.getUser("1");                    // nothing sent yet
const result = await method.send();                 // now it is
```

## `@Api` — declare an api class

```ts
@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> { return null!; }
}
```

The url is a **prefix**, joined `server.baseURL` + `@Api` url + method path, in that order.
`@Api()` with no argument is legal and declares the class without a prefix, but **the
decorator itself is required** — it marks the class as an api and names it for logging and
cache namespacing.

Object form: `@Api({ url, name, timeout, adapter, responseType, withCredentials })`.

## Request-method decorators

```ts
@Api("/user")
class UserApi {
  @Get("/:id")        getUser(): Promise<User> { return null!; }
  @Post("/")          create(): Promise<User> { return null!; }
  @Put("/:id")        replace(): Promise<User> { return null!; }
  @Patch("/:id")      update(): Promise<User> { return null!; }
  @Delete("/:id")     remove(): Promise<void> { return null!; }
  @Head("/:id")       exists(): Promise<void> { return null!; }
  @Options("/")       options(): Promise<void> { return null!; }
}
```

* The first argument is the path; the optional second argument is any axios request config
  (`timeout`, `headers`, `responseType`, `signal`, …) plus `params` and `data`.
* `Request` is the shared factory, so `Request("GET")("/x")` is `Get("/x")`.
* **Two request-method decorators on one method throw `SnailDecoratorError` while the class
  is being defined.** Applying one to a property or a class also throws.
* A method with **no** request-method decorator is passed through the proxy untouched, so an
  api class may keep helpers next to its endpoints:

```ts
@Api("/mix")
class MixApi {
  @Get("/")  get(): Promise<void> { return null!; }
  helper(): string { return "plain"; }        // callable, sends nothing
}
```

## `@Header` vs `@HeaderValue`

```ts
@Api("/user")
@Header({ "x-client": "web", "x-shared": "class" })     // static record
class UserApi {
  @Get("/secret")
  @Header({ "x-shared": "method" })                     // method record wins
  secret(@HeaderValue("authorization") token: string): Promise<User> {
    return null!;
  }
}
// → x-client: web, x-shared: method, authorization: <the argument value>
```

* `@Header({...})` takes a **record** and may decorate a class or a method; the two levels
  merge with the method winning.
* `@HeaderValue("authorization")` is a **parameter** decorator: one argument value per
  header. Key-less `@HeaderValue()` expects a plain object and spreads it.
* `HeaderParam` is an exported alias of `HeaderValue`.

## Progress decorators

```ts
@Post("/upload")
@UploadProgress((event) => { if (event.total) bar.value = event.loaded / event.total; })
upload(@Data() file: FormData): Promise<Uploaded> { return null!; }
```

`@DownloadProgress(cb)` is the mirror image. Progress events need the `xhr` adapter:
axios' `fetch` adapter cannot report them, so set `adapter: "xhr"` on the method or the
server when using these in a browser.

## Custom decorator factories

Third-party decorators are built from the same factories the library uses.

```ts
import {
  createClassDecorator, createMethodDecorator, createPropertyDecorator,
  createParamDecorator, customMetadataKey, getMethodMetadata, getClassMetadata
} from "@snail-js/api";

export const Entity = createClassDecorator<string>("acme/entity");   // @Entity("orders")
export const Retry = createMethodDecorator<number>("acme/retry");    // @Retry(3)

@Entity("orders")
class OrderApi {
  @Retry(3)
  @Get("/:id")
  get(@Params("id") id: string): Promise<Order> { return null!; }
}

getClassMetadata<string>("acme/entity", OrderApi);        // "orders"
getMethodMetadata<number>("acme/retry", OrderApi, "get"); // 3
```

Namespace the key with your package: `customMetadataKey("acme/tenant")` becomes
`Symbol.for("@snail-js/api:custom:acme/tenant")`. `createParamDecorator(source, resolver?)` needs a
registered parameter source — see [plugin-authoring.md](plugin-authoring.md).

