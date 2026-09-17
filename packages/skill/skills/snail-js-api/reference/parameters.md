# Parameters

Four built-in parameter sources, each with two shapes: **keyed** takes one value, **key-less**
spreads a plain object. Getting the shape wrong throws `SnailDecoratorError` (naming the
method) when `send()` applies the arguments.

| Decorator | Keyed form | Key-less form | Lands on |
| --- | --- | --- | --- |
| `@Params("id")` | `pathParams.id = value` | spread into `pathParams` | `:placeholder` in the url |
| `@Query("page")` | `params.page = value` | merged into `params` | query string |
| `@Data("name")` | `body.name = value` | merged **or replaced** | request body |
| `@HeaderValue("authorization")` | `headers.set(name, value)` | spread into headers | request headers |

The object form `@Query({ key: "page" })` is equivalent to `@Query("page")`; any other keys
of that object are forwarded to the resolver as `options` (that is how a plugin's own
decorator receives configuration).

```ts
@Api("/user")
class UserApi {
  @Get("/:id/:tab")
  get(
    @Params("id") id: string,
    @Params("tab") tab: string,
    @Query("full") full?: boolean,
    @Query() filters: { from?: string; to?: string },
    @HeaderValue("authorization") token: string
  ): Promise<User> {
    return null!;
  }
}

await Service.createApi(UserApi)
  .get("a b", "profile", true, { from: "2024-01" }, "Bearer token-123")
  .send();
```

## `@Params` — path placeholders

```ts
@Get("/files/:bucket/:name")
get(@Params("bucket") bucket: string, @Params("name") name: string): Promise<File> {
  return null!;
}
// GET /files/a%20b/x%2Fy   — every value is encodeURIComponent'd
```

A key-less `@Params()` spreads an object, which is the same thing for many placeholders:

```ts
@Get("/:id/:tab")
get(@Params() params: { id: string; tab: string }): Promise<User> { return null!; }
```

Every `:placeholder` in the final route — `server.baseURL` + `@Api` url + method path — must
have a matching value, or `send()` rejects with `SnailDecoratorError`:

```text
error.path.missing: route [/user/:id] has no value for placeholder [:id] —
add @Params('id') to the method parameter
```

A `:` inside a query string is not a placeholder, but avoid `:` in paths unless you mean one.

## `@Query` — query string

```ts
@Get("/list")
list(
  @Query() filters: { page: number; size: number },   // key-less: spread
  @Query("status") status: string                     // keyed: one param
): Promise<Page<Row>> { return null!; }

// → params: { page: 1, size: 20, status: "active" }
await Service.createApi(ListApi).list({ page: 1, size: 20 }, "active").send();
```

Values merge into the config in this order, later winning per key: server `params` →
`@Get(path, { params })` → each `@Query` argument in ascending parameter index. Arrays and
objects are serialised by axios, exactly as they are outside this library.

```ts
@Get("/list")
bad(@Query() filters: string): Promise<void> { return null!; }
// ❌ send() rejects: "bad parameter on method [list]: a key-less @Query argument
//    must be a plain object"
```

## `@Data` — request body

```ts
@Post("/user")
create(@Data("name") name: string, @Data("age") age: number): Promise<User> { return null!; }
// body: { name: "ada", age: 36 }

@Post("/user")
create(@Data() payload: { name: string; age: number }): Promise<User> { return null!; }
```

Keyed arguments always merge into an object body; a key-less **plain object** merges too.
Any other key-less value **replaces** the body outright, which is what keeps non-JSON
uploads possible:

```ts
@Post("/upload")
upload(@Data() form: FormData): Promise<void> { return null!; }        // body = the FormData
@Post("/raw")
raw(@Data() text: string): Promise<void> { return null!; }             // body = the string
@Post("/search")
search(@Data() terms: string[]): Promise<void> { return null!; }       // body = the array
```

`null` and `undefined` are not plain objects either, so `@Data() payload: undefined` wipes a
body that a keyed `@Data("x")` argument already built.

axios serialises an object body to JSON before the adapter runs, so a test/assertion sees the
encoded string. A `File`/`FormData` body is passed through untouched.

## `@HeaderValue` — one header per argument

```ts
@Get("/me")
me(@HeaderValue("authorization") token: string): Promise<User> { return null!; }

@Get("/search")
search(@HeaderValue() headers: { "x-tenant": string; "x-trace": string }): Promise<Row[]> {
  return null!;
}
```

Use `@Header({...})` for **static** headers and `@HeaderValue` for values that come from an
argument — see [decorators.md](decorators.md). `HeaderParam` is an alias of `HeaderValue`.

## Arguments, `send()` and re-sends

```ts
const bound = api.getUser("from-proxy");   // arguments captured, nothing sent
await bound.send();                        // GET /user/from-proxy
await bound.send("from-send");             // GET /user/from-send  ← args replaced
```

`send(...args)` re-supplies the method arguments; it does **not** take an options object.
Argument decorators are applied in ascending parameter index, regardless of the reverse order
TypeScript evaluates parameter decorators in.

## Misuse that throws at class-definition time

```ts
@Query(42) value: string          // ❌ SnailDecoratorError: needs a string key or no key
@Query("") value: string          // ❌ empty string key
@Query() value: string            // ❌ defined fine — throws later, inside send()
```

Registering a source of your own (`@Tenant("x-org")`) is a plugin concern:
[plugin-authoring.md](plugin-authoring.md).
