<p>
  <img src="https://img.shields.io/badge/TypeScript-1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=axios&labelColor=1e80ff&color=67C23A"></img>
</p>

# @snail-js

English | [中文](./README.MD)

Monorepo for the `@snail-js/*` request tooling family.

| Package | Description |
| --- | --- |
| [`@snail-js/api`](./packages/api) | Decorator-driven, plugin-first HTTP client built on axios. |
| [`@snail-js/cli`](./packages/cli) | Generate typed front-end request code straight from an OpenAPI 3 document. |
| [`@snail-js/skill`](./packages/skill) | Agent skill that teaches an AI assistant to write `@snail-js/api` code correctly. |
| [`docs`](./docs) | VitePress documentation site. |

## Install

`npm install @snail-js/api`

## Quick look

```ts
// service.ts
import { Server, SnailServer } from "@snail-js/api";

@Server({ baseURL: "/api" })
class BackEnd extends SnailServer {}
export const service = new BackEnd();

// user.api.ts
import { Api, Get, Params, Query } from "@snail-js/api";
import { service } from "./service";

export interface User {
  id: number;
  name: string;
}

@Api("/user")
class UserApi {
  /** The body never runs — it declares the argument and return types. */
  @Get("/:id")
  getUser(
    @Params("id") id: string,
    @Query("withProfile") withProfile?: boolean
  ): Promise<User> {
    return null!;
  }
}

export const userApi = service.createApi(UserApi);
```

```ts
// `data` is inferred as `User` from the declared return type.
const { data } = await userApi.getUser("1").send();

// Or drive it with a request strategy (Vue by default).
import { useRequest } from "@snail-js/api/strategies";

const { data: current, loading, error, send } = useRequest(userApi.getUser);
await send("1");
```

## The two import rules

1. **The core always comes from the package root.**

   ```ts
   import { SnailServer, Server, Api, Get, Post, Query, Data, Params } from "@snail-js/api";
   ```

2. **Optional behaviour comes from a subpath, on demand.**

   ```ts
   import { Cache, Interceptor, RequestPool, Versioning, Validate, Transform } from "@snail-js/api/plugins";
   import { VueAdapter } from "@snail-js/api/plugins/vue";
   import { ReactAdapter } from "@snail-js/api/plugins/react";

   import { useRequest, usePagination } from "@snail-js/api/strategies"; // Vue
   import { useRequest } from "@snail-js/api/strategies/react";          // React
   import { useRequest } from "@snail-js/api/strategies/plain";          // no framework
   ```

   The framework adapters sit behind their own subpaths deliberately: if they were
   re-exported from `@snail-js/api/plugins`, that barrel would statically import
   both `vue` and `react`, so a React app that only wanted `Cache` would fail to
   resolve `vue` at all.

## Dependencies

`axios` is the only runtime dependency. `vue`, `react` and `zod` are **optional**
peer dependencies, needed only by the plugin or strategy that uses them.

`reflect-metadata` is **not** a dependency and is not needed. Legacy decorators
(`experimentalDecorators: true`) and parameter decorators are fully supported by
TypeScript 7; `emitDecoratorMetadata` emits nothing under TS 7, and this library
never relied on it — decorator metadata lives in an internal registry instead.

## Development

```bash
pnpm install
pnpm build        # build every package
pnpm typecheck    # type-check every package
pnpm test         # run every package's test suite
pnpm verify       # exercise the built @snail-js/api through its real exports map
pnpm docs:check   # fast link/anchor/fence check over the docs (no VitePress build)
pnpm docs:dev     # start the documentation site
```

Per package:

```bash
pnpm --filter @snail-js/api   test
pnpm --filter @snail-js/cli   build
pnpm --filter @snail-js/skill test
pnpm --filter @snail-js/docs  docs:build
```

## License

MIT
