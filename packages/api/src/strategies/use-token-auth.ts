import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { SnailContext } from "../core/context";
import { createPlugin } from "../core/plugin";
import { deferred, noop } from "../utils/object";
import type { SnailNext, SnailPluginObject } from "../typings/plugin";

/**
 * The band the `useTokenAuth` plugin occupies.
 *
 * Above the default `0`, because the hook wraps the rest of the `beforeRequest`
 * chain so it can observe a 401 raised anywhere downstream. Exported so an
 * application that must sit *inside* that wrapper can say so by name instead of
 * guessing a number.
 */
export const TOKEN_AUTH_PRIORITY = 20;

/** Options accepted by {@link useTokenAuth}. */
export interface TokenAuthOptions {
  /**
   * Current token, from wherever the application keeps it.
   *
   * May be async (a secure store, a cookie API). Returning `null`/`undefined` is
   * normal — it means "not logged in", and the header is simply not injected.
   */
  token: () => string | null | undefined | Promise<string | null | undefined>;

  /**
   * Obtain a fresh token.
   *
   * Called **at most once** per wave of 401s; see the class documentation on
   * {@link useTokenAuth}. It must resolve with the new token; rejecting aborts the
   * whole queue.
   */
  refresh: () => Promise<string>;

  /** Header to write. Defaults to `"authorization"`. */
  header?: string;

  /** Prefix before the token. Defaults to `"Bearer"`; pass `""` for a raw token. */
  scheme?: string;

  /** Called when a 401 could not be recovered — the refresh failed, or the replay 401'd again. */
  onUnauthorized?: (error: unknown) => void;
}

/** What {@link useTokenAuth} hands back. */
export interface TokenAuthHandle {
  /** Install with `Service.use(auth.plugin)`. */
  readonly plugin: SnailPluginObject<TokenAuthOptions>;

  /** Replace the cached token, e.g. after a successful login. */
  setToken(token: string | null | undefined): void;

  /** The cached token. Synchronous: an async `token()` cannot be awaited here. */
  getToken(): string | undefined;

  /** Forget the cached token so `token()` is consulted again on the next request. */
  clearToken(): void;
}

/** Hooks the token plugin contributes. Typed explicitly so `setup` needs no casts. */
interface TokenAuthHooks {
  beforeRequest(ctx: SnailContext, next: SnailNext): Promise<void>;
}

/** `ctx.state` key holding the token one request was actually sent with. */
const USED_TOKEN = "token-auth:used";

/**
 * Read the HTTP status a failure carried, without assuming an axios error class.
 *
 * Only a transport-level 401 is recoverable here. A backend that answers HTTP 200
 * with `{ code: 401 }` produces its `SnailResponseError` in `SnailMethod.finalize`,
 * *after* the `beforeRequest` chain has already returned — and no hook can recover
 * a post-chain failure (`onError` is observe-only by design). Such a response is
 * left to the caller.
 */
function statusOf(error: unknown): number | undefined {
  const candidate = error as
    | { status?: unknown; response?: { status?: unknown } }
    | null
    | undefined;
  const status = candidate?.response?.status ?? candidate?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Bearer-token authentication with single-flight refresh, as a plugin.
 *
 * ```ts
 * const auth = useTokenAuth({
 *   token: () => localStorage.getItem("token"),
 *   refresh: async () => (await api.refresh().send()).token,
 *   onUnauthorized: () => router.push("/login")
 * });
 *
 * Service.use(auth.plugin);
 * auth.setToken("...");
 * ```
 *
 * ## Why a plugin and not a hook
 *
 * A token is global: every request of the service has to carry it, and a 401 on
 * any one of them has to invalidate the token for all of them. A per-method hook
 * could not see the other requests, so refresh coordination would be impossible.
 *
 * ## Exactly one refresh per wave of 401s
 *
 * Three parallel requests, one expired token, three 401s. Refreshing per request
 * would fire three refreshes and, with a rotating refresh token, two of them would
 * fail and log the user out. Two mechanisms prevent that:
 *
 * 1. a request that 401s while a refresh is already in flight **joins** it instead
 *    of starting a second one;
 * 2. a request whose 401 was produced by a token that has since been replaced
 *    replays directly, without refreshing again.
 *
 * The token each request was sent with is remembered in `ctx.state` (which the core
 * clears per send), and that is what makes rule 2 decidable without keeping
 * timers around.
 *
 * ## Replaying
 *
 * `onError` cannot recover a failure — the core rethrows after every `onError`
 * hook — so the recovery lives in `beforeRequest`, around `await next()`. The
 * replay re-runs the `requestInterceptor` reduce, the transport and the
 * `afterResponse` chain, so headers a plugin signs are recomputed for the retried
 * call. `beforeRequest` hooks are deliberately *not* re-entered: the refresh
 * decision has already been made, and re-entering could loop.
 *
 * ## What this cannot recover
 *
 * Only a **transport** 401 (HTTP 401). A backend that reports `{ code: 401 }` with
 * HTTP 200 fails in `finalize`, after the chain, where no hook can intervene; that
 * response reaches the caller as a `SnailResponseError`.
 */
export function useTokenAuth(options: TokenAuthOptions): TokenAuthHandle {
  const header = options.header ?? "authorization";
  const scheme = options.scheme ?? "Bearer";

  let cached: string | undefined;
  let refreshing: Promise<string> | undefined;
  let disposed = false;

  /** Resolves when the plugin is uninstalled; lets queued requests bail out. */
  const disposal = deferred<void>();

  async function readToken(): Promise<string | undefined> {
    if (cached !== undefined) return cached;

    const value = await options.token();
    if (typeof value === "string" && value.length > 0) cached = value;
    return cached;
  }

  function inject(ctx: SnailContext, token: string): void {
    ctx.request.headers.set(header, scheme ? `${scheme} ${token}` : token);
  }

  /** Start the one refresh this wave gets, or return the one already running. */
  function startRefresh(): Promise<string> {
    if (refreshing) return refreshing;

    const pending = Promise.resolve()
      .then(() => options.refresh())
      .then((token) => {
        if (typeof token === "string" && token.length > 0) cached = token;
        return cached ?? token;
      });

    const tracked = pending.finally(() => {
      if (refreshing === tracked) refreshing = undefined;
    });

    refreshing = tracked;
    // A refresh nobody awaits any more — every waiter was disposed — must not
    // surface as an unhandled rejection.
    void tracked.catch(noop);

    return tracked;
  }

  /**
   * Await a refresh, giving up early when the plugin is uninstalled.
   *
   * @returns `true` when a fresh token is available, `false` when the refresh
   * failed or the plugin went away — in both cases the caller rethrows the
   * **original** 401, because the refresh error is an implementation detail the
   * application cannot act on.
   */
  async function settleRefresh(pending: Promise<string>): Promise<boolean> {
    try {
      await Promise.race([pending, disposal.promise]);
    } catch {
      return false;
    }
    return !disposed;
  }

  /**
   * Re-send the request that 401'd, with the refreshed token.
   *
   * The replay reproduces `SnailMethod.dispatch` using public plugin-manager
   * surface. It intentionally skips the `beforeRequest` chain — see the hook
   * documentation.
   */
  async function replay(ctx: SnailContext): Promise<void> {
    const manager = ctx.server.pluginManager;
    const config = manager.reduce<InternalAxiosRequestConfig>(
      "requestInterceptor",
      ctx.request,
      ctx
    );
    ctx.request = config;

    const response: AxiosResponse = await ctx.server.axios.request(config);
    ctx.setResponse(response);

    await manager.runChain("afterResponse", ctx);
  }

  const factory = createPlugin<TokenAuthOptions, TokenAuthHooks>({
    name: "token-auth",
    priority: TOKEN_AUTH_PRIORITY,

    setup(_pluginOptions, api) {
      // Registered here, not on the hook, so an uninstall cannot leave a queue of
      // 401'd requests waiting on a refresh that will never be observed.
      api.onDispose(() => {
        disposed = true;
        disposal.resolve();
      });

      return {
        async beforeRequest(ctx: SnailContext, next: SnailNext): Promise<void> {
          if (disposed) {
            await next();
            return;
          }

          // A refresh in flight means the stored token is stale. Waiting here is
          // cheaper than sending a request that is certain to 401.
          if (refreshing) await settleRefresh(refreshing);

          const token = await readToken();
          if (token) inject(ctx, token);
          ctx.state.set(USED_TOKEN, token);

          try {
            await next();
          } catch (error) {
            if (disposed || statusOf(error) !== 401) throw error;

            const used = ctx.state.get(USED_TOKEN) as string | undefined;
            const superseded =
              cached !== undefined && used !== undefined && cached !== used;

            // Someone else already replaced the token this request failed with:
            // replay immediately instead of triggering another refresh.
            if (!superseded) {
              const pending = refreshing ?? startRefresh();
              const recovered = await settleRefresh(pending);
              if (!recovered) {
                options.onUnauthorized?.(error);
                throw error;
              }
            }

            const refreshed = await readToken();
            if (refreshed) inject(ctx, refreshed);

            try {
              await replay(ctx);
            } catch (replayError) {
              if (statusOf(replayError) === 401) options.onUnauthorized?.(replayError);
              throw replayError;
            }
          }
        }
      };
    }
  });

  return {
    plugin: factory(options),

    setToken(token: string | null | undefined): void {
      cached = typeof token === "string" && token.length > 0 ? token : undefined;
    },

    getToken(): string | undefined {
      return cached;
    },

    clearToken(): void {
      cached = undefined;
    }
  };
}
