import { describe, expect, it } from "vitest";
import { isRef } from "vue";
import { Api, Get, Params, Server, SnailAdapter, SnailServer, Sse, SseEvent } from "../../src/index";
import type { SnailSseMessage } from "../../src/index";
import { ReactState } from "../../src/adapter/react";
import { VueRef } from "../../src/adapter/vue";
import { useAutoRequest, useRequest, useSSE } from "../../src/strategies";
import type { SnailStateAdapter, SnailStateRef } from "../../src/typings/adapter";
import { createTestAdapter } from "../helpers/test-adapter";

/**
 * The state adapter — the single declaration that decides what a request's state
 * *is*: a Vue ref, a React box, or a plain `{ value }`.
 *
 * ## What these tests protect
 *
 * The framework used to be a process-wide registry (`setStateAdapter`) that the
 * three strategies entry points installed as an import side effect. That made
 * "this app is Vue" an import-order accident, and two servers with different
 * frameworks could not coexist in one process. Every case below is one of the
 * guarantees that replaced it:
 *
 *   - the adapter is a *server* option, resolved per server, defaulting to
 *     `SnailAdapter`, so declaring nothing is safe
 *   - it drives **both** projections — the handles on `method.meta` and the state
 *     every `use*` hook returns — from that one declaration
 *   - a hook may override it locally, and that override must not leak back onto
 *     the method's own handles
 */

@Api("/thing")
class ThingApi {
  @Get("/:id")
  get(@Params("id") id: string): Promise<{ id: string }> {
    return null!;
  }
}

@Sse("/events")
class Events {
  @SseEvent()
  onMessage(message: SnailSseMessage): void {
    void message;
  }
}

/**
 * A server whose transport echoes the last path segment back as the payload.
 *
 * Echoing rather than a canned body is what makes "this server used *that* adapter"
 * observable: two servers driven in one test then hold visibly different values.
 */
function buildServer(options: { stateAdapter?: SnailStateAdapter } = {}) {
  const test = createTestAdapter((request) => ({
    body: {
      code: 0,
      message: "ok",
      data: { id: request.url.split("/").pop() ?? "" }
    }
  }));

  @Server({ baseURL: "/api", adapter: test.adapter, ...options })
  class TestServer extends SnailServer {}

  return { Service: new TestServer(), test };
}

describe("state adapters", () => {
  it("defaults to SnailAdapter when the server declares none", async () => {
    const { Service } = buildServer();

    expect(Service.options.stateAdapter).toBe(SnailAdapter);
    expect(SnailAdapter.name).toBe("plain");

    const request = useRequest(Service.createApi(ThingApi).get);
    await request.send("1");

    expect(request.data.value).toEqual({ id: "1" });
    expect(request.loading.value).toBe(false);
  });

  it("gives a Vue server Vue refs on both projections", async () => {
    const { Service } = buildServer({ stateAdapter: VueRef });

    const request = useRequest(Service.createApi(ThingApi).get);
    await request.send("v");

    // The hook's own handles.
    expect(isRef(request.data)).toBe(true);
    expect(request.data.value).toEqual({ id: "v" });
    expect(isRef(request.loading)).toBe(true);

    // …and the handles core created on the method itself. Both come from the one
    // server option; there is no second place to configure.
    const method = Service.createApi(ThingApi).get("v");
    await method.send("v");

    const handle = method.meta[method.context.serverOptions.dataKey] as SnailStateRef;
    expect(isRef(handle)).toBe(true);
    expect(handle.value).toEqual({ id: "v" });
  });

  it("gives a React server boxes that notify a subscriber when written", async () => {
    const { Service } = buildServer({ stateAdapter: ReactState });

    const method = Service.createApi(ThingApi).get("r");
    const handle = method.meta[method.context.serverOptions.dataKey] as SnailStateRef;

    // A React box carries a version snapshot and a listener set; a bare `{ value }`
    // box would make `useSyncExternalStore` bail out of the re-render.
    expect(isRef(handle)).toBe(false);
    expect((handle as unknown as { version: number }).version).toBe(0);

    const versions: number[] = [];
    const unsubscribe = ReactState.subscribe!(handle, () => {
      versions.push((handle as unknown as { version: number }).version);
    });
    expect(typeof unsubscribe).toBe("function");

    await method.send("r");
    unsubscribe();

    expect(handle.value).toEqual({ id: "r" });
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.at(-1)).toBeGreaterThan(0);
  });

  it("keeps two servers with different adapters apart in one process", async () => {
    // The regression: whichever adapter module was imported last used to own every
    // server in the bundle. Both servers here are built and driven in the same file.
    const vue = buildServer({ stateAdapter: VueRef });
    const react = buildServer({ stateAdapter: ReactState });

    const vueRequest = useRequest(vue.Service.createApi(ThingApi).get);
    const reactRequest = useRequest(react.Service.createApi(ThingApi).get);

    await vueRequest.send("v");
    await reactRequest.send("r");

    expect(isRef(vueRequest.data)).toBe(true);
    expect(vueRequest.data.value).toEqual({ id: "v" });

    expect(isRef(reactRequest.data)).toBe(false);
    expect(reactRequest.data.value).toEqual({ id: "r" });
    expect((reactRequest.data as unknown as { version: number }).version).toBeGreaterThan(0);

    expect(vue.Service.options.stateAdapter).toBe(VueRef);
    expect(react.Service.options.stateAdapter).toBe(ReactState);
  });

  it("lets a hook override the adapter without changing the method's handles", async () => {
    const { Service } = buildServer({ stateAdapter: ReactState });
    const api = Service.createApi(ThingApi);

    const request = useRequest(api.get, { adapter: VueRef });
    await request.send("x");

    // The hook's state is Vue…
    expect(isRef(request.data)).toBe(true);
    expect(request.data.value).toEqual({ id: "x" });

    // …while the method it drove keeps the server's adapter.
    const method = api.get("x");
    await method.send("x");
    expect(isRef(method.meta[method.context.serverOptions.dataKey])).toBe(false);
  });

  it("routes every read and write through the adapter interface", async () => {
    const created: string[] = [];
    const writes: unknown[] = [];

    const recording: SnailStateAdapter = {
      name: "recording",
      create<T>(initial: T): SnailStateRef<T> {
        created.push("create");
        return { value: initial };
      },
      read<T>(state: SnailStateRef<T>): T {
        return state.value;
      },
      write<T>(state: SnailStateRef<T>, value: T): void {
        writes.push(value);
        state.value = value;
      }
    };

    const { Service } = buildServer({ stateAdapter: recording });
    const request = useRequest(Service.createApi(ThingApi).get);

    // Five handles for the hook, plus the five core makes on the method.
    expect(created.length).toBeGreaterThanOrEqual(5);

    await request.send("c");
    expect(writes).toContain(true);
    expect(writes).toContain(false);
    expect(request.data.value).toEqual({ id: "c" });
  });

  it("lets useAutoRequest track `running` in the server's framework", () => {
    const { Service } = buildServer({ stateAdapter: VueRef });
    const auto = useAutoRequest(Service.createApi(ThingApi).get);

    // `running` is a separate handle from the request state, so it has to resolve the
    // adapter from the same method — otherwise it would be a plain box next to Vue refs.
    expect(isRef(auto.running)).toBe(true);
    expect(isRef(auto.data)).toBe(true);

    auto.stop();
  });

  it("lets useSSE inherit the adapter of the server that made the endpoint", () => {
    const { Service } = buildServer({ stateAdapter: VueRef });

    // `createSse` records its server on the endpoint it returns, because an endpoint
    // is not a method and has no other way to report its framework.
    const endpoint = Service.createSse(Events);
    const events = useSSE(endpoint);

    expect(isRef(events.connected)).toBe(true);
    expect(isRef(events.messages)).toBe(true);
    expect(isRef(events.lastMessage)).toBe(true);

    // A hook-level override still wins.
    const forced = useSSE(Service.createSse(Events), { adapter: ReactState });
    expect(isRef(forced.connected)).toBe(false);
    expect((forced.connected as unknown as { version: number }).version).toBe(0);

    events.close();
    forced.close();
  });
});
