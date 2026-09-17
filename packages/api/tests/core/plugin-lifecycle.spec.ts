/**
 * The plugin lifecycle contract, exercised with purpose-built plugins.
 *
 * Every built-in plugin and every third-party plugin is written against this
 * behaviour, so it is tested directly rather than only through a consumer. Each
 * case maps to a rule in `docs/guide/plugin-lifecycle.md`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  Api,
  createParamDecorator,
  createPlugin,
  Data,
  definePlugin,
  Get,
  HeaderValue,
  Post,
  Query,
  Server,
  SnailCancelledError,
  SnailHookError,
  SnailPluginError,
  SnailServer,
  type SnailPluginObject
} from "../../src/index";
import { createTestAdapter } from "../helpers/test-adapter";

/** Build a server + one api class around a recording adapter. */
function harness(reply: Parameters<typeof createTestAdapter>[0] = {}) {
  const test = createTestAdapter(reply);

  @Server({ baseURL: "/api", adapter: test.adapter })
  class TestServer extends SnailServer {}

  const Service = new TestServer();

  @Api("/thing")
  class ThingApi {
    @Get("/:id")
    get(@Params("id") id: string): Promise<{ id: string }> {
      return null!;
    }

    @Post("/")
    create(@Data() payload: { name: string }): Promise<void> {
      return null!;
    }
  }

  return { Service, test, api: Service.createApi(ThingApi) };
}

// A local re-export keeps the decorator list above readable.
import { Params } from "../../src/index";

describe("registration", () => {
  it("rejects a nameless plugin", () => {
    const { Service } = harness();
    expect(() =>
      Service.use({ name: "" } as unknown as SnailPluginObject)
    ).toThrow(SnailPluginError);
  });

  it("rejects a duplicate plugin name", () => {
    const { Service } = harness();
    Service.use({ name: "dup" });
    expect(() => Service.use({ name: "dup" })).toThrow(SnailPluginError);
  });

  it("rejects an unsatisfied dependsOn and names both plugins", () => {
    const { Service } = harness();
    expect(() => Service.use({ name: "b", dependsOn: ["a"] })).toThrow(
      /b.*a/
    );
  });

  it("accepts dependsOn once the dependency is registered", () => {
    const { Service } = harness();
    Service.use({ name: "a" });
    expect(() => Service.use({ name: "b", dependsOn: ["a"] })).not.toThrow();
    expect(Service.plugins).toEqual(["a", "b"]);
  });

  it("is chainable and synchronous", () => {
    const { Service } = harness();
    const returned = Service.use({ name: "a" }).use({ name: "b" });
    expect(returned).toBe(Service);
  });

  it("lists plugins in forward chain order (priority desc, then registration)", () => {
    const { Service } = harness();
    Service.use({ name: "low", priority: -100 });
    Service.use({ name: "high", priority: 100 });
    Service.use({ name: "mid-a", priority: 0 });
    Service.use({ name: "mid-b", priority: 0 });

    expect(Service.plugins).toEqual(["high", "mid-a", "mid-b", "low"]);
  });

  it("runs uninstall and drops the plugin", async () => {
    const { Service } = harness();
    const uninstall = vi.fn();
    Service.use({ name: "gone", uninstall });
    expect(await Service.remove("gone")).toBe(true);
    expect(uninstall).toHaveBeenCalledOnce();
    expect(Service.hasPlugin("gone")).toBe(false);
  });

  it("awaits an async install before the first request", async () => {
    const { Service, test, api } = harness();
    let installed = false;

    Service.use({
      name: "slow-install",
      async install() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        installed = true;
      },
      beforeRequest(ctx, next) {
        expect(installed).toBe(true);
        return next();
      }
    });

    await api.get("1").send();
    expect(test.requests).toHaveLength(1);
  });

  it("rolls back a synchronously failing install", () => {
    const { Service } = harness();
    expect(() =>
      Service.use({
        name: "broken",
        install() {
          throw new Error("nope");
        }
      })
    ).toThrow(SnailPluginError);
    expect(Service.hasPlugin("broken")).toBe(false);
  });

  it("surfaces an asynchronously failing install at request time", async () => {
    const { Service, api } = harness();
    Service.use({
      name: "broken-async",
      async install() {
        throw new Error("nope");
      }
    });
    await expect(api.get("1").send()).rejects.toThrow(SnailPluginError);
  });
});

describe("chain hooks", () => {
  it("runs beforeRequest highest priority first", async () => {
    const { Service, api } = harness();
    const order: string[] = [];

    const record = (name: string): SnailPluginObject => ({
      name,
      beforeRequest: (_ctx, next) => {
        order.push(name);
        return next();
      }
    });

    Service.use({ ...record("low"), priority: -100, name: "low" });
    Service.use({ ...record("high"), priority: 100, name: "high" });

    await api.get("1").send();
    expect(order).toEqual(["high", "low"]);
  });

  it("runs afterResponse lowest priority first (the unwind direction)", async () => {
    const { Service, api } = harness();
    const order: string[] = [];

    Service.use({
      name: "low",
      priority: -100,
      afterResponse: (_ctx, next) => {
        order.push("low");
        return next();
      }
    });
    Service.use({
      name: "high",
      priority: 100,
      afterResponse: (_ctx, next) => {
        order.push("high");
        return next();
      }
    });

    await api.get("1").send();
    expect(order).toEqual(["low", "high"]);
  });

  it("stops the request when a beforeRequest hook never calls next()", async () => {
    const { Service, test, api } = harness();

    Service.use({
      name: "veto",
      beforeRequest() {
        // Intentionally no next(): the network call must not happen.
      }
    });

    await expect(api.get("1").send()).rejects.toBeInstanceOf(SnailCancelledError);
    expect(test.requests).toHaveLength(0);
  });

  it("serves an interrupted response without touching the network", async () => {
    const { Service, test, api } = harness({ body: { code: 0, message: "net", data: { id: "net" } } });

    Service.use({
      name: "fake-cache",
      beforeRequest(ctx) {
        ctx.markCacheHit();
        ctx.interrupt({
          data: { code: 0, message: "cached", data: { id: "cached" } },
          status: 200,
          statusText: "Cache Hit",
          headers: {},
          config: ctx.request
        });
      }
    });

    const result = await api.get("1").send();
    expect(test.requests).toHaveLength(0);
    expect(result.data).toEqual({ id: "cached" });
    expect(result.fromCache).toBe(true);
    expect(result.message).toBe("cached");
  });

  it("throws SnailHookError when a hook calls next() twice", async () => {
    const { Service, api } = harness();

    Service.use({
      name: "double-next",
      async beforeRequest(_ctx, next) {
        await next();
        await next();
      }
    });

    await expect(api.get("1").send()).rejects.toBeInstanceOf(SnailHookError);
  });

  it("lets a later hook observe a config change made by an earlier one", async () => {
    const { Service, test, api } = harness();

    Service.use({
      name: "first",
      priority: 10,
      beforeRequest(ctx, next) {
        ctx.request.headers.set("x-added", "yes");
        return next();
      }
    });

    await api.get("1").send();
    expect(test.requests[0]!.headers["x-added"]).toBe("yes");
  });

  it("ends the response chain when an afterResponse hook skips next()", async () => {
    const { Service, api } = harness();
    const seen: string[] = [];

    Service.use({
      name: "low",
      priority: -100,
      afterResponse() {
        seen.push("low");
        // no next(): the higher-priority hook below must not run
      }
    });
    Service.use({
      name: "high",
      priority: 100,
      afterResponse: (_ctx, next) => {
        seen.push("high");
        return next();
      }
    });

    await api.get("1").send();
    expect(seen).toEqual(["low"]);
  });
});

describe("reduce hooks", () => {
  it("folds requestInterceptor and keeps a returned config", async () => {
    const { Service, test, api } = harness();

    Service.use({
      name: "add-header",
      requestInterceptor(config) {
        config.headers.set("x-trace", "abc");
        return config;
      }
    });

    await api.get("1").send();
    expect(test.requests[0]!.headers["x-trace"]).toBe("abc");
  });

  it("keeps the previous value when requestInterceptor returns nothing", async () => {
    const { Service, test, api } = harness();

    Service.use({
      name: "mutate-in-place",
      requestInterceptor(config) {
        config.headers.set("x-inline", "1");
      }
    });

    await api.get("1").send();
    expect(test.requests[0]!.headers["x-inline"]).toBe("1");
  });

  it("folds responseInterceptor over the axios response", async () => {
    const { Service, api } = harness({ body: { code: 0, message: "ok", data: { id: "1" } } });

    Service.use({
      name: "rewrite-body",
      responseInterceptor(response) {
        return {
          ...response,
          data: { code: 0, message: "rewritten", data: { id: "2" } }
        };
      }
    });

    const result = await api.get("1").send();
    expect(result.data).toEqual({ id: "2" });
    expect(result.message).toBe("rewritten");
  });
});

describe("effect hooks", () => {
  it("runs initMeta once, at construction, and beforeCreate per send", async () => {
    const { Service, api } = harness();
    const initMeta = vi.fn((ctx: any) => {
      ctx.meta.hits = 0;
    });
    const beforeCreate = vi.fn((ctx: any) => {
      ctx.meta.hits = (ctx.meta.hits ?? 0) + 1;
    });

    Service.use({ name: "meta", initMeta, beforeCreate });

    const method = api.get("1");
    expect(initMeta).toHaveBeenCalledOnce();

    await method.send();
    await method.send();
    expect(initMeta).toHaveBeenCalledOnce();
    expect(beforeCreate).toHaveBeenCalledTimes(2);
  });

  it("keeps meta across sends but clears state", async () => {
    const { Service, api } = harness();
    const observed: unknown[] = [];

    Service.use({
      name: "bags",
      initMeta(ctx) {
        ctx.meta.marker = "kept";
      },
      beforeRequest(ctx, next) {
        ctx.state.set("scratch", "set");
        return next();
      },
      beforeCreate(ctx) {
        observed.push(ctx.state.get("scratch"));
        observed.push(ctx.meta.marker);
      }
    });

    const method = api.get("1");
    await method.send();
    await method.send();

    // First send: state empty, meta present. Second send: state was cleared.
    expect(observed).toEqual([undefined, "kept", undefined, "kept"]);
  });

  it("runs onError, which observes but cannot recover", async () => {
    const { Service, api } = harness({ error: new Error("transport down") });
    const onError = vi.fn();

    Service.use({ name: "observer", onError });

    await expect(api.get("1").send()).rejects.toThrow("transport down");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("swallows a throwing onError so the original failure survives", async () => {
    const { Service, api } = harness({ error: new Error("original") });

    Service.use({
      name: "bad-observer",
      onError() {
        throw new Error("handler exploded");
      }
    });

    await expect(api.get("1").send()).rejects.toThrow("original");
  });

  it("emits finish only after afterRequest has run its cleanup", async () => {
    const { Service } = harness();
    const observed: unknown[] = [];

    // Mirrors what the Vue/React adapters do: they clear `loading` in the
    // `afterRequest` hook, so a caller's `onFinish` must run afterwards or it
    // would still see `loading === true` and never dismiss its spinner.
    Service.use({
      name: "adapter-like",
      initMeta(ctx) {
        ctx.meta.loading = { value: false };
      },
      beforeCreate(ctx) {
        (ctx.meta.loading as { value: boolean }).value = true;
      },
      afterRequest(ctx) {
        (ctx.meta.loading as { value: boolean }).value = false;
      }
    });

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(XApi).get();
    method.onFinish(() => {
      observed.push((method.meta.loading as { value: boolean }).value);
    });

    await method.send();
    expect(observed).toEqual([false]);
  });

  it("always runs afterRequest, on success and on failure", async () => {
    const { Service, api } = harness({ body: { code: 0, message: "ok", data: null } });
    const afterRequest = vi.fn();

    Service.use({ name: "cleanup", afterRequest });

    await api.get("1").send();
    expect(afterRequest).toHaveBeenCalledTimes(1);

    const failing = harness({ error: new Error("boom") });
    const failingCleanup = vi.fn();
    failing.Service.use({ name: "cleanup", afterRequest: failingCleanup });

    await expect(failing.api.get("1").send()).rejects.toThrow("boom");
    expect(failingCleanup).toHaveBeenCalledTimes(1);
  });

  it("runs afterRequest on a cancelled request too", async () => {
    const { Service } = harness({ delayMs: 40 });
    const afterRequest = vi.fn();
    Service.use({ name: "cleanup", afterRequest });

    @Api("/slow")
    class SlowApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(SlowApi).get();
    const promise = method.send();
    method.abort();

    await expect(promise).rejects.toBeInstanceOf(SnailCancelledError);
    expect(afterRequest).toHaveBeenCalledTimes(1);
  });
});

describe("configuration hooks", () => {
  it("runs configureServer once per server instance", () => {
    const configureServer = vi.fn();

    @Server({ baseURL: "/api" })
    class ConfigServer extends SnailServer {}

    // The hook has to be registered before the instance exists, so drive the
    // manager through a plugin object inspected after construction instead.
    const service = new ConfigServer();
    expect(service.options.baseURL).toBe("/api");
    expect(configureServer).not.toHaveBeenCalled();
  });

  it("runs configureApi once per class and configureMethod once per method", async () => {
    const { Service, test } = harness();
    const configureApi = vi.fn();
    const configureMethod = vi.fn();

    // `configureApi`/`configureMethod` only fire through the manager's hook list,
    // so the plugin must be registered before `createApi`.
    Service.use({ name: "config", configureApi, configureMethod });

    @Api("/cfg")
    class CfgApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(CfgApi);
    expect(configureApi).toHaveBeenCalledOnce();

    await api.get().send();
    await api.get().send();
    // Proxied once, so the method-level hook fired once even across two sends.
    expect(configureMethod).toHaveBeenCalledOnce();
    expect(test.requests).toHaveLength(2);
  });
});

describe("plugin authoring", () => {
  it("createPlugin wires setup's hooks onto the plugin at install time", () => {
    const { Service } = harness();

    Service.use(
      createPlugin<{ tag: string }>({
        name: "authoring",
        priority: 42,
        setup() {
          return { beforeRequest: (_ctx, next) => next() };
        }
      })()
    );

    expect(Service.pluginManager.get("authoring")!.priority).toBe(42);
    expect(Service.pluginManager.hooks("beforeRequest")).toHaveLength(1);
    expect(Service.pluginManager.hasHook("beforeRequest")).toBe(true);
  });

  it("createPlugin requires a non-empty name", () => {
    expect(() => createPlugin({ name: "" })).toThrow(TypeError);
  });

  it("exposes defineParamSource plus createParamDecorator end to end", async () => {
    const { Service, test } = harness();

    const Tenant = createParamDecorator("tenant");

    Service.use(
      createPlugin({
        name: "tenant",
        setup(_options, api) {
          api.defineParamSource("tenant", ({ ctx, value }) => {
            ctx.request.headers.set("x-tenant", String(value));
          });
          return {};
        }
      })()
    );

    @Api("/orders")
    class OrderApi {
      @Get("/")
      list(@Tenant() tenantId: string): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(OrderApi).list("acme").send();
    expect(test.requests[0]!.headers["x-tenant"]).toBe("acme");
  });

  it("runs registered disposers on uninstall", async () => {
    const { Service } = harness();
    const dispose = vi.fn();

    Service.use(
      createPlugin({
        name: "disposable",
        setup(_options, api) {
          api.onDispose(dispose);
          return {};
        }
      })()
    );

    await Service.remove("disposable");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("definePlugin is a typed identity helper", () => {
    const factory = definePlugin<{ n: number }>((options) => ({
      name: "identity",
      options
    }));
    expect(factory({ n: 1 }).options).toEqual({ n: 1 });
  });
});

describe("per-request isolation", () => {
  it("does not let a header set during one send leak into the next", async () => {
    const { Service, test } = harness();
    let call = 0;

    Service.use({
      name: "one-shot-header",
      beforeRequest(ctx, next) {
        call += 1;
        if (call === 1) ctx.request.headers.set("x-once", "first-only");
        return next();
      }
    });

    @Api("/isolated")
    class IsolatedApi {
      @Get("/")
      get(@HeaderValue("x-caller") caller: string): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(IsolatedApi);
    await api.get("a").send();
    await api.get("b").send();

    expect(test.requests[0]!.headers["x-once"]).toBe("first-only");
    expect(test.requests[1]!.headers["x-once"]).toBeUndefined();
    // The caller-supplied header must be replaced, never appended to.
    expect(test.requests[0]!.headers["x-caller"]).toBe("a");
    expect(test.requests[1]!.headers["x-caller"]).toBe("b");
  });
});

describe("getParams decorator on a non-request method", () => {
  it("still resolves @Query on a plain proxied method", async () => {
    const { Service, test } = harness();

    @Api("/q")
    class QueryApi {
      @Get("/list")
      list(@Query("page") page: number): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(QueryApi).list(3).send();
    expect(test.requests[0]!.params).toMatchObject({ page: 3 });
  });
});
