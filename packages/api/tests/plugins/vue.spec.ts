/**
 * Vue adapter plugin.
 *
 * Everything here is observed through Vue's own `isRef` and through the refs the
 * plugin puts on `method.meta` — no component renderer is needed to know whether a
 * UI would have re-rendered, because a Vue ref *is* the reactive contract.
 *
 * The two cases that matter most are the ones this plugin got wrong in the
 * pre-rewrite code: the refs must exist before the first `send()`, and the very
 * same ref objects must survive every later send.
 */
import { describe, expect, it } from "vitest";
import { isRef, type Ref } from "vue";
import {
  Api,
  Get,
  Server,
  SnailCancelledError,
  SnailServer
} from "../../src/index";
import { VueAdapter } from "../../src/plugins/vue";
import { createTestAdapter } from "../helpers/test-adapter";

/** Read a ref the way a template does, without importing the internals. */
function value<T>(handle: unknown): T {
  return (handle as Ref<T>).value;
}

describe("VueAdapter", () => {
  it("creates the refs when the method is built, before any send", () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(VueAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();

    expect(isRef(method.meta.loading)).toBe(true);
    expect(isRef(method.meta.data)).toBe(true);
    expect(isRef(method.meta.error)).toBe(true);
    expect(value<boolean>(method.meta.loading)).toBe(false);
    expect(value(method.meta.data)).toBeUndefined();
    expect(value(method.meta.error)).toBeUndefined();
  });

  it("flips loading false → true → false around one send", async () => {
    const duringSend: { loading?: boolean } = {};
    let readLoading = (): boolean => false;

    const test = createTestAdapter(() => {
      duringSend.loading = readLoading();
      return { body: { code: 0, message: "ok", data: { id: 1 } } };
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(VueAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    readLoading = () => value<boolean>(method.meta.loading);

    expect(readLoading()).toBe(false);
    await method.send();

    expect(duringSend.loading).toBe(true);
    expect(readLoading()).toBe(false);
  });

  it("writes the unwrapped payload into the data ref", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 7, name: "ada" } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(VueAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number; name: string }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    const result = await method.send();

    // `ref()` wraps an object in a reactive proxy, so the ref holds the same
    // payload by value, not by reference.
    expect(value(method.meta.data)).toEqual({ id: 7, name: "ada" });
    expect(value(method.meta.data)).toEqual(result.data);
    expect(value(method.meta.code)).toBe(0);
    expect(value(method.meta.message)).toBe("ok");
  });

  it("sets error on failure and clears it on the next attempt", async () => {
    let attempt = 0;
    const test = createTestAdapter(() =>
      attempt++ === 0
        ? { error: new Error("boom") }
        : { body: { code: 0, message: "ok", data: { id: 2 } } }
    );

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(VueAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();

    await expect(method.send()).rejects.toThrow("boom");
    expect(value(method.meta.error)).toBeInstanceOf(Error);
    expect(value(method.meta.data)).toBeUndefined();
    expect(value<boolean>(method.meta.loading)).toBe(false);

    await method.send();
    expect(value(method.meta.error)).toBeUndefined();
    expect(value(method.meta.data)).toEqual({ id: 2 });
  });

  it("reuses the same ref objects across two sends", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 1 } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(VueAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    const dataRef = method.meta.data;
    const loadingRef = method.meta.loading;
    const errorRef = method.meta.error;

    await method.send();
    await method.send();

    expect(method.meta.data).toBe(dataRef);
    expect(method.meta.loading).toBe(loadingRef);
    expect(method.meta.error).toBe(errorRef);
    expect(value(method.meta.data)).toEqual({ id: 1 });
  });

  it("honours a custom dataKey declared on the server", async () => {
    const test = createTestAdapter({
      body: { status: 1, msg: "fine", result: { ok: true } }
    });

    @Server({
      baseURL: "/api",
      adapter: test.adapter,
      codeKey: "status",
      messageKey: "msg",
      dataKey: "result",
      validateCode: (code) => code === 1
    })
    class CustomServer extends SnailServer {}
    const Service = new CustomServer();
    Service.use(VueAdapter());

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<{ ok: boolean }> {
        return null!;
      }
    }

    const method = Service.createApi(XApi).get();
    await method.send();

    expect(value(method.meta.result)).toEqual({ ok: true });
    expect(value(method.meta.status)).toBe(1);
    expect(value(method.meta.msg)).toBe("fine");
    expect(method.meta.data).toBeUndefined();
  });

  it("does not treat a cancelled request as an error", async () => {
    const test = createTestAdapter({ delayMs: 60 });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(VueAdapter());

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
    expect(value(method.meta.error)).toBeUndefined();
    expect(value<boolean>(method.meta.loading)).toBe(false);
  });
});
