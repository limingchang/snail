import { describe, expect, it } from "vitest";
import { Api, Get, Server, SnailResponseError, SnailServer } from "../../src/index";
import { useTokenAuth } from "../../src/strategies/plain";
import { createTestAdapter } from "../helpers/test-adapter";
import type { RecordedRequest, TestReply } from "../helpers/test-adapter";
import { buildServer, delay, until } from "./support";

/**
 * `useTokenAuth`.
 *
 * The whole point of the hook is the refresh storm: without single-flight refresh,
 * three parallel 401s fire three refreshes and two of them lose the race. The
 * three-401 case below is the test that matters.
 */

@Api("/secure")
class SecureApi {
  @Get("/a")
  a(): Promise<{ ok: boolean }> {
    return null!;
  }

  @Get("/b")
  b(): Promise<{ ok: boolean }> {
    return null!;
  }

  @Get("/c")
  c(): Promise<{ ok: boolean }> {
    return null!;
  }
}

const OK = { body: { code: 0, message: "ok", data: { ok: true } } };

/** A 401-shaped failure. */
interface HttpError extends Error {
  response: { status: number };
}

/**
 * Exactly what axios produces for a non-2xx status: an error carrying the response.
 *
 * A custom test adapter bypasses axios' `validateStatus`, so a 401 body alone
 * would look like a successful round trip with a rejected business code. Throwing
 * the error is the honest way to reproduce the transport behaviour the plugin has
 * to react to.
 */
function httpError(status: number, message = "unauthorized"): HttpError {
  return Object.assign(new Error(message), { response: { status } });
}

/** 401 unless the request already carries the refreshed token. */
function expiredUnlessFresh(fresh: string): (request: RecordedRequest) => TestReply {
  return (request) =>
    request.headers["authorization"] === `Bearer ${fresh}`
      ? OK
      : { error: httpError(401) };
}

function headerOf(request: { headers: Record<string, unknown> }): unknown {
  return request.headers["authorization"];
}

describe("useTokenAuth", () => {
  it("injects the header on every request", async () => {
    const { Service, test } = buildServer(OK);
    const auth = useTokenAuth({ token: () => "t1", refresh: async () => "t2" });
    Service.use(auth.plugin);

    await Service.createApi(SecureApi).a().send();

    expect(headerOf(test.requests[0]!)).toBe("Bearer t1");
  });

  it("honours a custom header and disables the scheme with an empty string", async () => {
    const { Service, test } = buildServer(OK);
    const auth = useTokenAuth({
      token: () => "raw",
      refresh: async () => "raw",
      header: "x-api-key",
      scheme: ""
    });
    Service.use(auth.plugin);

    await Service.createApi(SecureApi).a().send();

    expect(test.requests[0]!.headers["x-api-key"]).toBe("raw");
    expect(test.requests[0]!.headers["authorization"]).toBeUndefined();
  });

  it("refreshes once and replays a single 401", async () => {
    let refreshes = 0;
    const { Service, test } = buildServer(expiredUnlessFresh("new"));

    const auth = useTokenAuth({
      token: () => "old",
      refresh: async () => {
        refreshes += 1;
        return "new";
      }
    });
    Service.use(auth.plugin);

    const result = await Service.createApi(SecureApi).a().send();

    expect(result.data).toEqual({ ok: true });
    expect(refreshes).toBe(1);
    expect(test.requests).toHaveLength(2);
    expect(headerOf(test.requests[1]!)).toBe("Bearer new");
    expect(auth.getToken()).toBe("new");
  });

  it("refreshes exactly once for three concurrent 401s and replays all of them", async () => {
    let refreshes = 0;
    const { Service, test } = buildServer(expiredUnlessFresh("new"));

    const auth = useTokenAuth({
      token: () => "old",
      refresh: async () => {
        refreshes += 1;
        // A real refresh is a network round trip: yield so all three 401s land
        // before it resolves, which is the race the hook must survive.
        await delay(5);
        return "new";
      }
    });
    Service.use(auth.plugin);

    const api = Service.createApi(SecureApi);
    const results = await Promise.all([api.a().send(), api.b().send(), api.c().send()]);

    expect(results.map((result) => result.data)).toEqual([
      { ok: true },
      { ok: true },
      { ok: true }
    ]);
    expect(refreshes).toBe(1);
    expect(test.requests).toHaveLength(6);
    expect(test.requests.slice(3).map((entry) => headerOf(entry))).toEqual([
      "Bearer new",
      "Bearer new",
      "Bearer new"
    ]);
  });

  it("lets a later 401 refresh again once the new token is itself rejected", async () => {
    let refreshes = 0;
    // Always 401: the replay fails, and only a second refresh can be attempted.
    const { Service, test } = buildServer({ error: httpError(401) });

    const auth = useTokenAuth({
      token: () => `token-${refreshes}`,
      refresh: async () => {
        refreshes += 1;
        return `token-${refreshes}`;
      }
    });
    Service.use(auth.plugin);

    const api = Service.createApi(SecureApi);
    await expect(api.a().send()).rejects.toThrow();
    const afterFirst = refreshes;

    await expect(api.a().send()).rejects.toThrow();

    expect(afterFirst).toBe(1);
    expect(refreshes).toBe(2);
    expect(test.requests.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects the queue with the original error when the refresh fails", async () => {
    const failures: unknown[] = [];
    const { Service } = buildServer({ error: httpError(401) });

    const auth = useTokenAuth({
      token: () => "old",
      refresh: async () => {
        await delay(5);
        throw new Error("refresh failed");
      },
      onUnauthorized: (error) => failures.push(error)
    });
    Service.use(auth.plugin);

    const api = Service.createApi(SecureApi);
    const results = await Promise.allSettled([api.a().send(), api.b().send()]);

    expect(auth.getToken()).toBe("old");
    expect(results.every((entry) => entry.status === "rejected")).toBe(true);
    expect(failures.length).toBeGreaterThanOrEqual(1);

    // The caller sees the 401, not the refresh failure: the refresh error is an
    // implementation detail it cannot act on.
    for (const entry of results) {
      const reason = (entry as PromiseRejectedResult).reason as {
        response?: { status?: number };
      };
      expect(reason.response?.status).toBe(401);
    }
  });

  it("reads an async token source and caches it", async () => {
    let reads = 0;
    const { Service, test } = buildServer(OK);

    const auth = useTokenAuth({
      token: async () => {
        reads += 1;
        return "async-token";
      },
      refresh: async () => "async-token"
    });
    Service.use(auth.plugin);

    const api = Service.createApi(SecureApi);
    await api.a().send();
    await api.b().send();

    expect(reads).toBe(1);
    expect(test.requests.map((entry) => headerOf(entry))).toEqual([
      "Bearer async-token",
      "Bearer async-token"
    ]);
  });

  it("supports setToken, getToken and clearToken", async () => {
    const { Service, test } = buildServer(OK);
    const auth = useTokenAuth({ token: () => "from-source", refresh: async () => "fresh" });
    Service.use(auth.plugin);
    const api = Service.createApi(SecureApi);

    auth.setToken("manual");
    expect(auth.getToken()).toBe("manual");
    await api.a().send();
    expect(headerOf(test.requests[0]!)).toBe("Bearer manual");

    auth.clearToken();
    expect(auth.getToken()).toBeUndefined();
    await api.b().send();
    expect(headerOf(test.requests[1]!)).toBe("Bearer from-source");
  });

  it("omits the header when the token source has nothing", async () => {
    const { Service, test } = buildServer(OK);
    const auth = useTokenAuth({ token: () => null, refresh: async () => "fresh" });
    Service.use(auth.plugin);

    await Service.createApi(SecureApi).a().send();
    expect(test.requests[0]!.headers["authorization"]).toBeUndefined();
  });

  it("leaves a business-code 401 to the caller", async () => {
    let refreshes = 0;
    // HTTP 200 with a rejected business code. `SnailMethod.finalize` raises this
    // *after* the `beforeRequest` chain returned, and the core offers no recovery
    // hook there, so the plugin cannot and must not claim to handle it.
    const { Service, test } = buildServer((request) =>
      request.headers["authorization"] === "Bearer new"
        ? OK
        : { body: { code: 401, message: "expired", data: null } }
    );

    const auth = useTokenAuth({
      token: () => "old",
      refresh: async () => {
        refreshes += 1;
        return "new";
      }
    });
    Service.use(auth.plugin);

    await expect(Service.createApi(SecureApi).a().send()).rejects.toBeInstanceOf(
      SnailResponseError
    );
    expect(refreshes).toBe(0);
    expect(test.requests).toHaveLength(1);
  });

  it("releases the queue when the plugin is uninstalled mid-refresh", async () => {
    let refreshing = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const test = createTestAdapter({ error: httpError(401) });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();

    const auth = useTokenAuth({
      token: () => "old",
      refresh: async () => {
        refreshing = true;
        await gate;
        return "new";
      }
    });
    Service.use(auth.plugin);

    const sending = Service.createApi(SecureApi).a().send();
    // The rejection is asserted further down; keep Node from flagging it as
    // unhandled while this test is still working.
    void sending.catch(() => undefined);

    await until(() => refreshing);

    await Service.remove("token-auth");
    release();

    // Without the dispose hook this promise would stay pending until the refresh
    // resolved and then replay against an uninstalled plugin.
    await expect(sending).rejects.toThrow();
  });
});
