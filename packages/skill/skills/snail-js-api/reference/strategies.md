# Strategies

A request strategy owns one request instance and the state a component renders. Strategies are
**not** exported from the package root, and the core never imports a framework — import the entry
point for your framework, and only that one:

```ts
import { useRequest, usePagination, useWatcher } from "@snail-js/api/strategies";   // Vue (default)
import { useRequest } from "@snail-js/api/strategies/react";                       // React
import { useRequest } from "@snail-js/api/strategies/plain";                       // no framework
```

| Entry point | State primitive | Reading it |
| --- | --- | --- |
| `@snail-js/api/strategies` | Vue `ref()` | `.value` — the render effect tracks it |
| `@snail-js/api/strategies/react` | subscribable boxes (`useSyncExternalStore`) | call `bind()` during render |
| `@snail-js/api/strategies/plain` | plain `{ value }` boxes | `.value`; nothing re-renders |

Importing an entry point is the **only** thing that installs its adapter, and in the strategy layer
the only thing that pulls `vue` or `react` into a bundle. All three re-export exactly the same hooks,
so a hook named here exists at all three paths.

## The call convention

Pass the **proxied method factory**, not a built request and not a url:

```ts
useRequest(userApi.getUser)        // ✅ the factory; args are supplied per send
useRequest(userApi.getUser("1"))   // ❌ that is already a SnailMethod
useRequest("/user")                // ❌ a url is not a request
```

`send(...args)` takes the *method arguments* (there is no options object) and resolves the
**unwrapped payload** — `result.data`, not the `SnailResult`. The business `code`/`message` are on
the state handles instead.

## `StrategyState` — what every hook returns

| Member | Type | Meaning |
| --- | --- | --- |
| `loading` | `SnailStateRef<boolean>` | `true` from the start of a send until it settles |
| `data` | `SnailStateRef<T \| undefined>` | payload of the most recent successful send |
| `error` | `SnailStateRef<unknown>` | failure of the most recent send; never set for a cancellation |
| `code` | `SnailStateRef<number \| string \| undefined>` | business/HTTP code |
| `message` | `SnailStateRef<string \| undefined>` | business message |

* `SnailStateRef<T>` is just `{ value: T }` — a Vue `Ref` structurally is one.
* `abort()` cancels the in-flight request; `update(patch)` writes `data`/`loading`/`error`/`code`/
  `message` directly (optimistic updates); `bind()` returns those five as plain values and, on
  React, subscribes the current component.
* `onSuccess(cb)`, `onError(cb)` and `onFinish(cb)` subscribe and return an unsubscribe function.
  A cancellation is not a failure: it skips `onError` but still fires `onFinish`.

Every hook also accepts the shared options `immediate` (`false`), `adapter` (the entry point's) and
`onSuccess`/`onError`/`onFinish`; anything else is hook-specific.

## The hooks

### `useRequest(method, options?)`
Run one request: the state above plus `send(...args): Promise<TData>`. Options: `initialData`;
`resetOnSend` (`false` — clear `data` before each send instead of keeping the previous payload).
One hook owns one `SnailMethod`, so **one request at a time**: a second `send()` while one is in
flight supersedes the first, which settles cancelled. Call `abort()` first, or use `useWatcher`.

### `useWatcher(method, options)`
Re-run a request when the values it reads change. Adds `watching: SnailStateRef<boolean>` (default
`true`) — set it `false` to make every `send()` an unconditional refresh. Options: `watching()` —
**required**, returns the values to compare; `debounce` / `throttle` in ms collapse bursts of
`send()` calls (`debounce` wins when both are set). **`send()` is the evaluation trigger**: nothing
fires when a value changes, so a Vue/React integration calls `send()` from its own reactive effect
and a script calls it directly. An unchanged snapshot sends nothing and resolves with the current
`data`.

### `useFetcher(method, options?)`
Run a request without a view: `fetch(...args)` plus `abort()` and the `on*` subscriptions. State
handles exist only with `withState: true`, so a prefetch, an SSR pass or a silent background refresh
cannot make an unrelated spinner appear.

### `usePagination(method, options?)`
Page through a method whose single argument is `{ page, pageSize }` (declare it
`@Query() query: PageRequest`). Adds `page`, `pageSize`, `total`, `list`, `isLastPage` state and
`next()`, `prev()`, `goTo(page)`, `reload()`, `changePageSize(n)` — each resolving the payload or
`undefined`, never throwing at a bound. Options: `initialPage` (`1`), `initialPageSize` (`10`),
`total(payload)`, `list(payload)`, `append` (`false`, the infinite-scroll mode), `preloadNext`
(`false`). `total` defaults to `payload.total ?? payload.count ?? payload.length` and `list` to the
array payload or `payload.list ?? payload.items`. **The bounds need a total**: without one the hook
falls back to "a short page is the last page", which cannot detect a final page that happens to be
exactly full, and `next()` will stop one page late rather than early.

### `useAutoRequest(method, options?)`
Keep a request fresh by itself: `running` state plus `start()`, `stop()`, `refresh()` and
`dispose()` (permanent — a disposed hook ignores `start()`). Options: `pollingInterval`,
`enableFocusRefresh`, `enableReconnectRefresh`, `refreshOnVisible`. The next poll is scheduled only
**after** the previous request settles; `start()` also sends once immediately. The focus/online/
visibility listeners are attached when the hook is created, and polling runs only between `start()`
and `stop()`; `stop()` removes both. `window`/`document` are looked up lazily, so creating the hook
during SSR is harmless.

### `useRetriableRequest(method, options?)`
`useRequest` plus `attempts: SnailStateRef<number>` (starts at `0`). Options: `retries` (`3`),
`delayMs` (`1000`), `maxDelayMs` (`30000`), `factor` (`2`), `jitter` (`true`) and
`retryOn(error, attempt)` where `attempt` is the next 1-based try. A cancellation is never retried
and never written to `error`, and `abort()` during a backoff delay rejects immediately instead of
waiting out the timer.

### `useUploader(method, options?)`
Queue files to a `[FormData]` method: `upload(files)`, `files`, `progress`, `retry(id)`. `upload()`
**never rejects** — one bad file must not abort the batch, so per-file failures live on
`files[i].error`. Options: `concurrency` (`3`), `multiple` (`true`; `false` keeps only the first
file of a selection), `fieldName` (`"file"`), `onProgress({ progress, files })`. **`progress` is the
mean of the per-file values**, with a finished file counting as `1`, so a transport that reports no
progress (a mock or `fetch` adapter) leaves it effectively binary. `data`/`code`/`message` describe
the whole batch — the last file to finish — so read `files[i].response` for anything per-file.

### `useTokenAuth(options)`
Not a state hook: it returns `{ plugin, setToken, getToken, clearToken }`, installed with
`Service.use(auth.plugin)`. Options: `token()` — **required**, sync or async, `null` meaning "not
logged in"; `refresh()` — **required**, called at most once per wave of 401s; `header`
(`"authorization"`), `scheme` (`"Bearer"`; `""` sends a raw token) and `onUnauthorized(error)`.
It recovers **only a transport-level HTTP 401**. A backend that answers HTTP 200 with `{ code: 401 }`
fails in the core's finalize step, after the hook chain has returned, where no hook can recover it —
that response reaches the caller as a `SnailResponseError`.

### `useSSE(endpoint, options?)`
Consume `Service.createSse(Class)` as state: `messages`, `lastMessage`, `connected`, `error`, plus
`open()`, `close()` and `clear()`. Options: `immediate` (`false`), `maxMessages` (`100`, oldest
dropped first), `filter(message)` and `onMessage(message)`. `messages` is filled only when the
endpoint implements `subscribe(listener)` or its connection implements `onMessage(listener)`;
without either, `connected`/`error` still track the transport and nothing is buffered.

### `useDownload(method, options?)`
Drive a server-prepared download. The usual state plus `info` (the last resolved `{ url, filename? }`
descriptor) and `onDownload(cb)`; `download(...args)` resolves a `TriggerDownloadResult` once the
browser download has *started*. Options: `pick(payload)` — read the descriptor yourself; the default
takes a bare url string, or an object with `url` / `downloadUrl` / `fileUrl` plus `filename` / `name`,
and a payload without one rejects with a `TypeError`. `autoTrigger` (`true`) — `false` resolves the
descriptor into `info` without touching the DOM, and `onDownload` then never fires, so read `info`;
`openInNewTab` (open the url instead of downloading it), `filename` (overrides `pick`'s at the anchor
only — `info` still reports the server's), `container` (`document.body`) and `referrerPolicy`.

**A strategy, not a plugin**: a plugin is a cross-cutting concern for requests the application did not
write specially (caching, interceptors, validation), whereas a download is one explicit user action
with its own visible state and failure modes. **It never awaits the bytes** — `download()` awaits only
the request that mints a temporary url, then clicks an `<a>`, and the browser streams the file to disk
with progress and resume. `await`ing a `responseType: "blob"` instead buffers the whole payload in
memory — see [troubleshooting.md](troubleshooting.md). A cross-origin url ignores `filename` (the
browser honours the server's `Content-Disposition`). The framework-free half lives on the package
root: `triggerDownload(url, options?)` throws a `ReferenceError` on a server, where there is no DOM;
`triggerBlobDownload(blob, options?)` serves bytes already in hand, and
`filenameFromDisposition(header)` parses the server's header.

```ts
import { triggerDownload } from "@snail-js/api";              // root — no framework, no reactivity
import { useDownload } from "@snail-js/api/strategies";       // also /plain and /react
const { download, loading, error, info, onDownload } = useDownload(reportApi.create);
await download(query);   // only the url request is awaited; the file itself is the browser's
```

## Strategies and plugins together

A **plugin** changes how a request is sent and is registered once on the server; a **strategy** owns
a request *instance* and the state a component renders. Register the plugin first, then use the hook
at the call site — everything the plugin did (a cache hit, an extra header, a validation failure) is
already reflected in the state the strategy exposes.

```ts
Service.use(Cache({ ttl: 30 }));               // server-wide behaviour (plugins)
const user = useRequest(userApi.getUser);      // one request instance (strategies)
await user.send("1");                          // resolves the payload
user.data.value;                               // the same payload
```

Writing a plugin of your own, including one that registers a parameter source for a strategy, is
covered in [plugin-authoring.md](plugin-authoring.md); the plugins themselves are in
[plugins.md](plugins.md).
