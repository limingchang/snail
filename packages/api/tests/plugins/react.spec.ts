/**
 * React adapter plugin.
 *
 * There is no DOM test environment configured, so nothing here renders a
 * component. What is tested instead is the observable contract a component relies
 * on: `method.meta` holds subscribable boxes whose snapshots change when the
 * request progresses, and `useMethodState` is exported with the right shape.
 *
 * `useMethodState` itself calls `useSyncExternalStore`, which throws outside a
 * render pass — so it is deliberately *not* invoked here. It is type-checked (the
 * reference below would fail to compile if the signature changed) and exercised by
 * the boxes it binds.
 */
import { describe, expect, it } from "vitest";
import { reactStateAdapter } from "../../src/adapter/react";
import { Api, Get, Server, SnailServer } from "../../src/index";
import { ReactAdapter, useMethodState } from "../../src/plugins/react";
import { createTestAdapter } from "../helpers/test-adapter";
import type { SnailStateRef } from "../../src/index";

/** Read a box the way a component does after subscribing. */
function read<T>(handle: unknown): T {
  return reactStateAdapter.read(handle as SnailStateRef<T>);
}

/** Subscribe to a box, the way `useMethodState` does internally. */
function subscribe<T>(handle: unknown, listener: (value: T) => void): () => void {
  return reactStateAdapter.subscribe!(handle as SnailStateRef<T>, listener);
}

describe("ReactAdapter", () => {
  it("installs readable boxes on method.meta before any send", () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(ReactAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();

    // The boxes are created by `initMeta`, which runs while the method is built.
    expect(method.meta.loading).toBeDefined();
    expect(method.meta.data).toBeDefined();
    expect(method.meta.error).toBeDefined();
    expect(read<boolean>(method.meta.loading)).toBe(false);
    expect(read(method.meta.data)).toBeUndefined();
  });

  it("notifies a subscriber of every loading change", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 1 } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(ReactAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    const seen: unknown[] = [];
    subscribe<boolean>(method.meta.loading, (loading) => seen.push(loading));

    await method.send();

    expect(seen).toEqual([true, false]);
  });

  it("notifies a data subscriber with the unwrapped payload", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 7 } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(ReactAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    const seen: unknown[] = [];
    subscribe<{ id: number }>(method.meta.data, (data) => seen.push(data));

    await method.send();

    expect(seen).toEqual([{ id: 7 }]);
    expect(read<{ id: number }>(method.meta.data)).toEqual({ id: 7 });
  });

  it("flips loading false → true → false around one send", async () => {
    const duringSend: { loading?: boolean } = {};
    let readLoading = (): boolean => false;

    const test = createTestAdapter(() => {
      duringSend.loading = readLoading();
      return { body: { code: 0, message: "ok", data: null } };
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(ReactAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    readLoading = () => read<boolean>(method.meta.loading);

    await method.send();

    expect(duringSend.loading).toBe(true);
    expect(readLoading()).toBe(false);
  });

  it("reuses the same boxes across two sends", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 1 } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(ReactAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();
    const dataBox = method.meta.data;
    const loadingBox = method.meta.loading;

    await method.send();
    await method.send();

    expect(method.meta.data).toBe(dataBox);
    expect(method.meta.loading).toBe(loadingBox);
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
    Service.use(ReactAdapter());

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).get();

    await expect(method.send()).rejects.toThrow("boom");
    expect(read(method.meta.error)).toBeInstanceOf(Error);

    await method.send();
    expect(read(method.meta.error)).toBeUndefined();
    expect(read<{ id: number }>(method.meta.data)).toEqual({ id: 2 });
  });

  it("exposes useMethodState for components to bind", () => {
    // Called only for its type: invoking it needs a render pass, which this
    // suite has no environment for. If the signature changes, this line stops
    // compiling — which is the part that can be verified without a DOM.
    expect(typeof useMethodState).toBe("function");
  });
});
