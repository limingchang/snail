import { afterEach, describe, expect, it, vi } from "vitest";
import { Api, Get, Params } from "../../src/index";
import { useAutoRequest } from "../../src/strategies";
import { buildServer, delay, until } from "./support";

/**
 * `useAutoRequest`.
 *
 * Polling has three ways to go wrong and the suite pins all three: overlapping
 * requests, a timer that outlives `stop()`, and a listener that is added but never
 * removed. It also runs without a DOM, which is the environment these tests are in.
 */

const OK = { body: { code: 0, message: "ok", data: { ok: true } } };

@Api("/ping")
class PingApi {
  @Get("/")
  ping(): Promise<{ ok: boolean }> {
    return null!;
  }

  @Get("/:id")
  getUser(@Params("id") id: string): Promise<{ id: string }> {
    return null!;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoRequest", () => {
  it("polls repeatedly and stops on stop()", async () => {
    const { Service, test } = buildServer(OK);
    const auto = useAutoRequest(Service.createApi(PingApi).ping, { pollingInterval: 5 });

    auto.start();
    expect(auto.running.value).toBe(true);
    await until(() => test.requests.length >= 3);

    auto.stop();
    expect(auto.running.value).toBe(false);

    const settled = test.requests.length;
    await delay(30);
    expect(test.requests).toHaveLength(settled);
  });

  it("clears the polling timer so it cannot keep the process alive", async () => {
    vi.useFakeTimers();
    const { Service } = buildServer(OK);
    const auto = useAutoRequest(Service.createApi(PingApi).ping, { pollingInterval: 1000 });

    auto.start();

    // Let the first request settle (its chain is all microtasks) so the next tick
    // is actually scheduled; then prove `stop()` removed it.
    for (let index = 0; index < 10 && vi.getTimerCount() === 0; index += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(vi.getTimerCount()).toBe(1);

    auto.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never overlaps two requests", async () => {
    let inFlight = 0;
    let peak = 0;

    const { Service, test } = buildServer(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(20);
      inFlight -= 1;
      return OK;
    });

    const auto = useAutoRequest(Service.createApi(PingApi).ping, { pollingInterval: 5 });
    auto.start();

    await until(() => test.requests.length >= 3);
    auto.stop();

    // The interval is 5ms and one request takes 20ms: without the "schedule after
    // settle" rule this would peak at four.
    expect(peak).toBe(1);
  });

  it("registers and removes every listener without a DOM present", () => {
    const added: string[] = [];
    const removed: string[] = [];

    const target = {
      addEventListener: (type: string) => {
        added.push(type);
      },
      removeEventListener: (type: string) => {
        removed.push(type);
      }
    };

    const globals = globalThis as { window?: unknown; document?: unknown };
    globals.window = target;
    globals.document = { ...target, visibilityState: "visible" };

    try {
      const { Service } = buildServer(OK);
      const auto = useAutoRequest(Service.createApi(PingApi).ping, {
        enableFocusRefresh: true,
        enableReconnectRefresh: true,
        refreshOnVisible: true
      });

      expect(added).toEqual(["focus", "online", "visibilitychange"]);

      auto.stop();
      // Removal order is the reverse of registration (LIFO), which is what makes
      // one `removeAll()` safe to call from anywhere.
      expect([...removed].sort()).toEqual([...added].sort());
      expect(added).toHaveLength(removed.length);

      auto.start();
      expect(added).toHaveLength(6);

      auto.dispose();
      expect(added).toHaveLength(removed.length);

      // A disposed hook stays disposed: `start()` must not resurrect listeners.
      auto.start();
      expect(added).toHaveLength(6);
      expect(auto.running.value).toBe(false);
    } finally {
      delete globals.window;
      delete globals.document;
    }
  });

  it("survives creation in a DOM-less process", async () => {
    const { Service, test } = buildServer(OK);
    const auto = useAutoRequest(Service.createApi(PingApi).ping, {
      enableFocusRefresh: true,
      refreshOnVisible: true
    });

    // No listener could be attached, but the hook is fully usable.
    await auto.refresh();
    expect(test.requests).toHaveLength(1);
    auto.dispose();
  });

  it("re-runs the previous arguments on refresh()", async () => {
    const { Service, test } = buildServer({ body: { code: 0, message: "ok", data: { id: "3" } } });
    const auto = useAutoRequest(Service.createApi(PingApi).getUser);

    await auto.send("3");
    await auto.refresh();

    expect(test.requests.map((entry) => entry.url)).toEqual(["/ping/3", "/ping/3"]);
    expect(auto.data.value).toEqual({ id: "3" });
  });

  it("starts polling on creation with immediate: true", async () => {
    const { Service, test } = buildServer(OK);
    const auto = useAutoRequest(Service.createApi(PingApi).ping, {
      pollingInterval: 5,
      immediate: true
    });

    expect(auto.running.value).toBe(true);
    await until(() => test.requests.length >= 2);
    auto.dispose();
  });
});
