/**
 * @snail-js/api — copy-paste starter skeleton.
 *
 * Rules this file demonstrates (see ../../SKILL.md):
 *   1. a decorated method's body never runs; `return null!` declares the types only;
 *   2. the declared return type IS `result.data`'s type;
 *   3. `@Header` is a static record, `@HeaderValue` is a parameter decorator;
 *   4. `@Query("x")` takes one value, `@Query()` spreads a plain object;
 *   5. only `experimentalDecorators` is needed in tsconfig — no metadata library.
 *
 * Split this into `server.ts`, `api/<resource>.ts` and your call site in real code.
 */
import {
  Api,
  Data,
  Get,
  Header,
  HeaderValue,
  Params,
  Post,
  Query,
  Server,
  SnailServer
} from "@snail-js/api";

// ── server ──────────────────────────────────────────────────────────────────
// One instance per application, created at module load so `use()` stays sync.

@Server({ baseURL: "/api", timeout: 10000, logLevel: "error" })
class BackEnd extends SnailServer {}

export const Service = new BackEnd();

// Optional behaviour is registered here, imported from its own entry point —
// `Service.use(...)` with the plugins that `@snail-js/api/plugins` exports:
//   import { Interceptor, Cache } from "@snail-js/api/plugins";
// The framework adapter is NOT a plugin; it is a server option:
//   import { VueRef } from "@snail-js/api/adapter/vue";
//   @Server({ baseURL: "/api", stateAdapter: VueRef })
//   // React: import { ReactState } from "@snail-js/api/adapter/react"

// ── shared types ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
}

export interface Page<T> {
  items: T[];
  total: number;
}

// ── api class ───────────────────────────────────────────────────────────────

@Api("/user")
@Header({ "x-client": "web" }) // static header, class-wide; method-level wins
class UserApi {
  /** GET /api/user/:id?full=true */
  @Get("/:id")
  getUser(@Params("id") id: string, @Query("full") full?: boolean): Promise<User> {
    return null!;
  }

  /** GET /api/user/list?page=1&size=20&status=active */
  @Get("/list")
  list(
    @Query() filters: { page: number; size: number },
    @Query("status") status: "active" | "archived"
  ): Promise<Page<User>> {
    return null!;
  }

  /** POST /api/user — JSON body built from the payload object */
  @Post("/")
  create(
    @Data() payload: Pick<User, "name">,
    @HeaderValue("authorization") token: string
  ): Promise<User> {
    return null!;
  }

  /** POST /api/user/avatar — a non-plain-object body replaces the JSON body */
  @Post("/avatar")
  uploadAvatar(@Data() form: FormData): Promise<{ url: string }> {
    return null!;
  }

  /** A method with no request decorator stays callable and sends nothing. */
  displayName(user: User): string {
    return user.name;
  }
}

export const userApi = Service.createApi(UserApi);

// ── call site ───────────────────────────────────────────────────────────────
// The method call sends nothing. `.send()` is the request.

export async function loadUser(id: string): Promise<User> {
  const result = await userApi.getUser(id, true).send();

  // result.data       → User, already unwrapped (never `result.data.data`)
  // result.envelope   → { code, message, data } exactly as sent
  // result.code       → business code
  // result.message    → business message
  // result.response   → the axios response
  // result.fromCache  → true only when a cache plugin served this send()
  return result.data;
}

export function watchUser(
  id: string,
  handlers: { onDone: () => void; onError: (error: unknown) => void }
): () => void {
  const method = userApi.getUser(id);

  const offSuccess = method.onSuccess(() => handlers.onDone());
  const offError = method.onError((error) => handlers.onError(error));
  const offCodeError = method.onCodeError((event) => handlers.onError(event.error));

  void method.send();

  return () => {
    offSuccess();
    offError();
    offCodeError();
  };
}
