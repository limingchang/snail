---
name: snail-js-api
description: Use proactively when writing, reviewing or debugging code that uses @snail-js/api — decorator-driven api classes (@Server/@Api/@Get/@Query/@Data), request plugins (cache, interceptor, versioning, validation, transform, request pool), Vue/React adapters, or request-strategy hooks (useRequest, usePagination, useWatcher, useDownload). Covers the correct decorator syntax, the {code,message,data} envelope, plugin lifecycle hooks, and the mistakes that produce invalid code.
---

# @snail-js/api

`@snail-js/api` is a decorator-driven HTTP client built on axios alone: you declare request
classes with Nest.js-style decorators (`@Server`, `@Api`, `@Get`, `@Query`, `@Data`) and the
library builds the axios config for you. Cache, interceptors, versioning, validation,
transformation, the request pool, Vue/React adapters and request strategies all come from subpaths
— never from the package root.

## Five rules that decide whether the code works

### 1. A decorated method's body never runs

Calling a proxied method only builds a request object. The body is a declaration of argument
and return types, and **the declared return type is the payload type**.

```ts
import { Api, Get, Params, Query } from "@snail-js/api";

interface User { id: string; name: string }

// ✅ the only body you ever write — `return null!` never executes
@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string, @Query("full") full?: boolean): Promise<User> {
    return null!;
  }
}

const userApi = Service.createApi(UserApi);              // Service: see "Minimal setup"
const result = await userApi.getUser("1").send();        // result.data is typed User
```

```ts
// ❌ real logic in the body: dead code, silently never executed
@Get("/:id")
getUser(@Params("id") id: string): Promise<User> {
  return http.get(`/user/${id}`).then((r) => r.data);
}

// ❌ no return annotation: the payload collapses to `unknown`
@Get("/:id")
getUser(@Params("id") id: string) { return null!; }
```

### 2. `send()` resolves to a `SnailResult`, not the envelope

```ts
const result = await userApi.getUser("1").send();

result.data        // ✅ the payload, ALREADY unwrapped (envelope.data)
result.data.data   // ❌ there is no second envelope — undefined at runtime
result.envelope    // ✅ the raw { code, message, data } the server sent
result.response    // ✅ the axios response
result.code        // ✅ business code; also result.message, result.fromCache
```

### 3. `@Header` and `@HeaderValue` are different decorators

```ts
@Api("/user")
@Header({ "x-client": "web" })          // ✅ static record — on the class or a method
class UserApi {
  @Get("/me")
  me(@HeaderValue("authorization") token: string): Promise<User> {
    return null!;
  }   //      ^^^^^^^^^^^ ✅ parameter decorator — one argument value per header
}
```

```ts
@Header("x-client")                      // ❌ @Header takes a record, not a name
@HeaderValue({ authorization: "..." })   // ❌ @HeaderValue takes a header name
```

Class-level and method-level `@Header` records merge, and the method wins.

### 4. Keyed parameters take one value; key-less parameters spread an object

```ts
@Get("/list")
list(
  @Query("page") page: number,               // ✅ keyed → params.page = page
  @Query() filters: { status?: string }      // ✅ key-less → spread a plain object
): Promise<Row[]> { return null!; }
```

```ts
@Get("/list")
bad(@Query() filters: string): Promise<void> { return null!; }
// ❌ throws SnailDecoratorError when send() applies the argument — key-less
//    @Query/@Params/@Data/@HeaderValue require a plain object
```

`@Data()` is the one asymmetry: a key-less **plain object** merges into the JSON body,
while any other value (`FormData`, `Blob`, a string, an array) **replaces** the body, so
uploads stay possible.

```ts
@Post("/upload")
upload(@Data() form: FormData): Promise<void> { return null!; }             // ✅ replaces
@Post("/user")
create(@Data() p: { name: string }): Promise<User> { return null!; }        // ✅ merges
update(@Data("name") name: string): Promise<User> { return null!; }         // ✅ one key
```

### 5. No metadata library is involved

The only compiler option this library needs is `experimentalDecorators`. It reads the metadata
its own decorators write, never TypeScript's design-time metadata, so nothing else is needed.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

Do not add `emitDecoratorMetadata` (TypeScript 7 ignores it for this library's purpose). Do not
install `reflect-metadata` or list it in `types` — nothing imports or registers it. Do not add
`baseUrl` to any tsconfig either: TypeScript 7 removed the option.

## Minimal working setup

```ts
// src/server.ts — one server instance per app, created at module load
import { SnailServer, Server } from "@snail-js/api";

@Server({ baseURL: "/api", timeout: 10000 })
class BackEnd extends SnailServer {}
export const Service = new BackEnd();
```

```ts
// src/api/user.ts
import { Api, Data, Get, HeaderValue, Params, Post, Query } from "@snail-js/api";
import { Service } from "../server";

export interface User { id: string; name: string }

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string, @Query("full") full?: boolean): Promise<User> {
    return null!;
  }
  @Post("/")
  create(@Data() payload: { name: string }, @HeaderValue("authorization") token: string): Promise<User> {
    return null!;
  }
}

export const userApi = Service.createApi(UserApi);
```

```ts
// call site — the method call sends nothing; send() does
import { SnailResponseError } from "@snail-js/api";
import { userApi } from "./api/user";

try {
  const result = await userApi.getUser("42", true).send();
  console.log(result.data.name);        // string
} catch (error) {
  if (error instanceof SnailResponseError) {
    console.warn(error.businessCode, error.payload);  // rejected business code
  }
}
```

`Service.createApi(Class)` is required: a decorated class only *describes* requests, and
`createApi` returns the proxy whose methods build `SnailMethod` objects.

## Read this next

| Open | When |
| --- | --- |
| [reference/decorators.md](reference/decorators.md) | server/api class options, every decorator, custom decorator factories |
| [reference/parameters.md](reference/parameters.md) | `@Params`/`@Query`/`@Data`/`@HeaderValue` shapes, path placeholders, argument order |
| [reference/responses.md](reference/responses.md) | `SnailResult`, envelope keys, code validation, error classes, events |
| [reference/plugins.md](reference/plugins.md) | installing built-in plugins, subpath imports, plugin ordering |
| [reference/strategies.md](reference/strategies.md) | `useRequest`/`usePagination`/`useWatcher`/`useDownload` hooks and Vue/React/plain state |
| [reference/plugin-authoring.md](reference/plugin-authoring.md) | writing a plugin: `createPlugin`, hooks, chain rules, `ctx.state` |
| [reference/streaming.md](reference/streaming.md) | `@Sse`, `@WebSocket`, `@HttpStream`, reconnect options |
| [reference/troubleshooting.md](reference/troubleshooting.md) | a request silently does nothing, or code that throws at definition time |
| [assets/api-template.ts](assets/api-template.ts) | copy-paste skeleton for a new server + api class + call site |

This skill is authoritative over any older `@snail-js/api` example you remember: `@UseStrategy`,
`Strategy extends`, `SnailApi` and `defineServiceConfig` were **removed** — see
[reference/troubleshooting.md](reference/troubleshooting.md) for what replaced each one.
