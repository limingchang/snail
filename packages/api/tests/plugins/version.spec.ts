/**
 * Version management plugin.
 *
 * The suite covers the three built-in transports, the three levels a version can
 * be declared at, the custom extractor, and — most importantly — that one method's
 * version cannot leak into another's request. The pre-rewrite plugin wrote the
 * version into `server.defaults.baseURL` once, so the first request of a server
 * decided the version of every later one; the regression test at the bottom is
 * what keeps that from coming back.
 */
import { describe, expect, it, vi } from "vitest";
import {
  Api,
  Get,
  Params,
  Query,
  Server,
  SnailPluginError,
  SnailServer
} from "../../src/index";
import { Version, Versioning } from "../../src/plugins/version";
import { createTestAdapter } from "../helpers/test-adapter";
import type { SnailPluginObject } from "../../src/index";
import type { VersioningOptions } from "../../src/plugins/version";

function buildServer(options: VersioningOptions) {
  const test = createTestAdapter();

  @Server({ baseURL: "/api", adapter: test.adapter })
  class TestServer extends SnailServer {}

  const Service = new TestServer();
  Service.use(Versioning(options));

  return { Service, test };
}

/**
 * Read a recorded header case-insensitively.
 *
 * `AxiosHeaders` keeps the casing a header was *first* set with, and axios already
 * defaults `Accept`, so a plugin that writes `accept` lands on the existing
 * `Accept` key. Asserting the exact casing would test axios, not this plugin.
 */
function headerOf(headers: Record<string, unknown>, name: string): unknown {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase()
  );
  return key === undefined ? undefined : headers[key];
}

describe("url mode", () => {
  it("prepends the version segment declared on the method", async () => {
    const { Service, test } = buildServer({ type: "url", defaultVersion: "1.0.0" });

    @Api("/user")
    class UserApi {
      @Get("/:id")
      @Version("1.2.0")
      getUser(@Params("id") id: string): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).getUser("1").send();

    expect(test.requests[0]!.url).toBe("/v1.2.0/user/1");
  });

  it("applies the default version when neither level declares one", async () => {
    const { Service, test } = buildServer({ type: "url", defaultVersion: "1.0.0" });

    @Api("/user")
    class UserApi {
      @Get("/list")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests[0]!.url).toBe("/v1.0.0/user/list");
  });

  it("keeps the server baseURL untouched", async () => {
    const { Service } = buildServer({ type: "url", defaultVersion: "1.0.0" });

    @Api("/user")
    class UserApi {
      @Get("/list")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(Service.options.baseURL).toBe("/api");
  });

  it("is idempotent when the url already carries the segment", async () => {
    const { Service, test } = buildServer({ type: "url", defaultVersion: "1.0.0" });

    @Api("")
    class UserApi {
      @Get("/v1.0.0/list")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests[0]!.url).toBe("/v1.0.0/list");
  });

  it("honours an empty key for a bare version segment", async () => {
    const { Service, test } = buildServer({
      type: "url",
      defaultVersion: "1.0.0",
      key: ""
    });

    @Api("/user")
    class UserApi {
      @Get("/list")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests[0]!.url).toBe("/1.0.0/user/list");
  });
});

describe("header and query modes", () => {
  it("writes the default x-api-version header", async () => {
    const { Service, test } = buildServer({
      type: "header",
      defaultVersion: "1.0.0"
    });

    @Api("/user")
    class UserApi {
      @Get("/list")
      @Version("2.0.0")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests[0]!.headers["x-api-version"]).toBe("2.0.0");
  });

  it("honours a custom header name", async () => {
    const { Service, test } = buildServer({
      type: "header",
      defaultVersion: "1.0.0",
      key: "x-service-version"
    });

    @Api("/user")
    class UserApi {
      @Get("/list")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests[0]!.headers["x-service-version"]).toBe("1.0.0");
  });

  it("merges the version into the query without dropping existing params", async () => {
    const { Service, test } = buildServer({ type: "query", defaultVersion: "1.0.0" });

    @Api("/list")
    class ListApi {
      @Get("/")
      @Version("3.1.0")
      list(@Query("page") page: number): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(ListApi).list(2).send();

    expect(test.requests[0]!.params).toMatchObject({ page: 2, v: "3.1.0" });
  });
});

describe("version resolution order", () => {
  it("method wins over class, class wins over the default", async () => {
    const { Service, test } = buildServer({ type: "url", defaultVersion: "1.0.0" });

    @Api("/mix")
    @Version("1.5.0")
    class MixedApi {
      @Get("/class-level")
      classLevel(): Promise<void> {
        return null!;
      }

      @Get("/method-level")
      @Version("2.5.0")
      methodLevel(): Promise<void> {
        return null!;
      }
    }

    @Api("/plain")
    class PlainApi {
      @Get("/default")
      fallback(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(MixedApi).classLevel().send();
    await Service.createApi(MixedApi).methodLevel().send();
    await Service.createApi(PlainApi).fallback().send();

    expect(test.requests.map((request) => request.url)).toEqual([
      "/v1.5.0/mix/class-level",
      "/v2.5.0/mix/method-level",
      "/v1.0.0/plain/default"
    ]);
  });

  it("logs a non-default version through the logger", async () => {
    const test = createTestAdapter();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class LoudServer extends SnailServer {}
    const Service = new LoudServer();
    Service.use(Versioning({ type: "url", defaultVersion: "1.0.0" }));

    @Api("/user")
    class UserApi {
      @Get("/list")
      @Version("2.0.0")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("2.0.0");
    warn.mockRestore();
  });
});

describe("custom mode", () => {
  it("applies the patch the extractor returns", async () => {
    const seen: string[] = [];

    const { Service, test } = buildServer({
      type: "custom",
      defaultVersion: "1.0.0",
      extractor: (version, ctx) => {
        seen.push(`${version}@${ctx.request.url ?? ""}`);
        return {
          headers: { accept: `application/vnd.acme.v${version}+json` },
          params: { apiVersion: version }
        };
      }
    });

    @Api("/user")
    class UserApi {
      @Get("/:id")
      @Version("4.0.0")
      getUser(@Params("id") id: string): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).getUser("7").send();

    expect(seen).toEqual(["4.0.0@/user/7"]);
    expect(headerOf(test.requests[0]!.headers, "accept")).toBe(
      "application/vnd.acme.v4.0.0+json"
    );
    expect(test.requests[0]!.params).toMatchObject({ apiVersion: "4.0.0" });
  });

  it("throws when a custom type has no extractor", () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();

    expect(() =>
      Service.use(Versioning({ type: "custom", defaultVersion: "1.0.0" }))
    ).toThrow(SnailPluginError);
  });
});

describe("isolation", () => {
  it("does not let one method's version contaminate another's", async () => {
    const { Service, test } = buildServer({ type: "url", defaultVersion: "1.0.0" });

    @Api("/v")
    class VersionedApi {
      @Get("/a")
      @Version("2.0.0")
      a(): Promise<void> {
        return null!;
      }

      @Get("/b")
      @Version("3.0.0")
      b(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(VersionedApi);
    await api.a().send();
    await api.b().send();
    await api.a().send();

    expect(test.requests.map((request) => request.url)).toEqual([
      "/v2.0.0/v/a",
      "/v3.0.0/v/b",
      "/v2.0.0/v/a"
    ]);
    expect(Service.options.baseURL).toBe("/api");
  });

  it("rewrites the url before a lower-priority plugin can read it", async () => {
    const observed: (string | undefined)[] = [];
    const observer: SnailPluginObject = {
      name: "url-observer",
      priority: -100,
      beforeRequest(ctx, next) {
        observed.push(ctx.request.url);
        return next();
      }
    };

    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Versioning({ type: "url", defaultVersion: "1.0.0" }));
    Service.use(observer);

    @Api("/user")
    class UserApi {
      @Get("/:id")
      @Version("1.2.0")
      getUser(@Params("id") id: string): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).getUser("1").send();

    expect(observed).toEqual(["/v1.2.0/user/1"]);
  });
});
