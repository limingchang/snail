/**
 * The interceptor plugin.
 *
 * Interceptors are deliberately *not* axios interceptors: axios keeps them per
 * instance, so it cannot express "this one method" nor order them against the
 * other plugins. These cases pin the plugin-lifecycle behaviour instead —
 * ordering (`priority: 100`), the fulfilled/rejected contract, and the fact that
 * a response interceptor receives a response rather than a `next`.
 */
import { describe, expect, it } from "vitest";
import { Api, Get, SnailServer, Server } from "../../src/index";
import {
  AfterResponse,
  BeforeRequest,
  Interceptor,
  InterceptorManager
} from "../../src/plugins/interceptor";
import type { InterceptorPlugin } from "../../src/plugins/interceptor";
import { createTestAdapter } from "../helpers/test-adapter";
import type { TestReply } from "../helpers/test-adapter";

function buildServer(
  reply: TestReply = {},
  plugin: InterceptorPlugin = Interceptor()
) {
  const test = createTestAdapter(reply);

  @Server({ baseURL: "/api", adapter: test.adapter })
  class TestServer extends SnailServer {}

  const Service = new TestServer();
  Service.use(plugin);

  return { Service, test, plugin };
}

describe("request interceptors", () => {
  it("runs a class-level interceptor against the outgoing config", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    @BeforeRequest((config) => {
      config.headers.set("x-trace", "trace-1");
    })
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests).toHaveLength(1);
    expect(test.requests[0]!.headers["x-trace"]).toBe("trace-1");
  });

  it("runs method interceptors after the class ones", async () => {
    const order: string[] = [];
    const { Service } = buildServer();

    @Api("/user")
    @BeforeRequest(() => {
      order.push("class");
    })
    class UserApi {
      @Get("/")
      @BeforeRequest(() => {
        order.push("method");
      })
      @BeforeRequest(() => {
        order.push("method-second");
      })
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    // Class first, then every method entry in application order.
    expect(order).toEqual(["class", "method-second", "method"]);
  });

  it("adopts a replacement config returned by an interceptor", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/")
      @BeforeRequest((config) => ({
        ...config,
        url: "/user/replaced",
        params: { page: 2 }
      }))
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(test.requests[0]!.url).toBe("/user/replaced");
    expect(test.requests[0]!.params).toEqual({ page: 2 });
  });

  it("recovers through onRejected and still sends the request", async () => {
    const { Service, test } = buildServer();
    let caught: unknown;

    @Api("/user")
    class UserApi {
      @Get("/")
      @BeforeRequest(
        () => {
          throw new Error("interceptor boom");
        },
        (error, ctx) => {
          caught = error;
          return ctx.getRequest();
        }
      )
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(String(caught)).toContain("interceptor boom");
    expect(test.requests).toHaveLength(1);
  });

  it("propagates the failure when onRejected rethrows", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/")
      @BeforeRequest(
        () => {
          throw new Error("first failure");
        },
        () => {
          throw new Error("second failure");
        }
      )
      list(): Promise<void> {
        return null!;
      }
    }

    await expect(Service.createApi(UserApi).list().send()).rejects.toThrow(
      "second failure"
    );
    // A request interceptor that fails unrecoverably stops the request before
    // transport, which is the whole point of running it in `beforeRequest`.
    expect(test.requests).toHaveLength(0);
  });

  it("propagates the original failure when onRejected returns undefined", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/")
      @BeforeRequest(
        () => {
          throw new Error("original failure");
        },
        () => undefined
      )
      list(): Promise<void> {
        return null!;
      }
    }

    await expect(Service.createApi(UserApi).list().send()).rejects.toThrow(
      "original failure"
    );
    expect(test.requests).toHaveLength(0);
  });
});

describe("response interceptors", () => {
  it("rewrites the body the caller receives", async () => {
    const { Service } = buildServer();

    @Api("/user")
    @AfterResponse((response) => ({
      ...response,
      data: { code: 0, message: "ok", data: { patched: true } }
    }))
    class UserApi {
      @Get("/")
      list(): Promise<{ patched: boolean }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).list().send();

    expect(result.data).toEqual({ patched: true });
    expect(result.code).toBe(0);
  });

  it("runs method interceptors after the class ones", async () => {
    const order: string[] = [];
    const { Service } = buildServer();

    @Api("/user")
    @AfterResponse(() => {
      order.push("class");
    })
    class UserApi {
      @Get("/")
      @AfterResponse(() => {
        order.push("method");
      })
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    expect(order).toEqual(["class", "method"]);
  });

  it("recovers a throwing response interceptor through onRejected", async () => {
    const { Service } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/")
      @AfterResponse(
        () => {
          throw new Error("response boom");
        },
        (_error, ctx) => ({
          ...ctx.requireResponse(),
          data: { code: 0, message: "recovered", data: { recovered: true } }
        })
      )
      list(): Promise<{ recovered: boolean }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).list().send();

    expect(result.data).toEqual({ recovered: true });
  });
});

describe("programmatic interceptors", () => {
  it("registers, lists, ejects and clears entries", () => {
    const manager = new InterceptorManager();

    const first = manager.use({ onFulfilled: (config) => config });
    const second = manager.use({ onFulfilled: (config) => config });

    expect(first).not.toBe(second);
    expect(manager.entries).toHaveLength(2);
    expect(manager.size).toBe(2);

    expect(manager.eject(first)).toBe(true);
    expect(manager.eject(first)).toBe(false);
    expect(manager.entries).toHaveLength(1);

    manager.clear();
    expect(manager.size).toBe(0);
  });

  it("applies entries added after the plugin was installed", async () => {
    const { Service, plugin } = buildServer();
    let applied = 0;

    const id = plugin.request.use({
      onFulfilled: () => {
        applied += 1;
      }
    });

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();
    expect(applied).toBe(1);

    expect(plugin.request.eject(id)).toBe(true);
    expect(plugin.request.entries).toHaveLength(0);

    await Service.createApi(UserApi).list().send();
    expect(applied).toBe(1);
  });

  it("runs server-wide entries after the class and method ones", async () => {
    const order: string[] = [];
    const { Service } = buildServer(
      {},
      Interceptor({
        request: [
          { onFulfilled: () => void order.push("server") },
          { onFulfilled: () => void order.push("server-second") }
        ]
      })
    );

    @Api("/user")
    @BeforeRequest(() => void order.push("class"))
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();
    expect(order).toEqual(["class", "server", "server-second"]);
  });
});

describe("plugin ordering", () => {
  it("runs before a priority-0 plugin's beforeRequest", async () => {
    const order: string[] = [];
    const { Service } = buildServer(
      {},
      Interceptor({
        request: [{ onFulfilled: () => void order.push("interceptor") }]
      })
    );

    Service.use({
      name: "marker",
      priority: 0,
      beforeRequest: (_ctx, next) => {
        order.push("marker");
        return next();
      }
    });

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).list().send();

    // `priority: 100` is the reserved interceptor band: it must see — and rewrite
    // — the request before any default-priority plugin does.
    expect(order).toEqual(["interceptor", "marker"]);
  });
});
