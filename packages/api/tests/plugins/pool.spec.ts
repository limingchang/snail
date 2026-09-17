/**
 * Request pool plugin.
 *
 * The scheduler is tested directly where the behaviour is about ordering, fairness
 * and the slot invariant — that keeps the hard cases (a full queue, a wait that
 * times out, a request abandoned mid-queue, a slot returned on failure) fast and
 * deterministic. It is tested through a real server where the behaviour is about
 * *where* the pool sits in the pipeline.
 */
import type { AxiosAdapter } from "axios";
import { describe, expect, it, vi } from "vitest";
import { Api, Get, Server, SnailServer } from "../../src/index";
import {
  Cache,
  Cacheable,
  POOL_ERROR_CODES,
  RequestPool,
  RequestPoolScheduler,
  SnailPoolError,
  clearPool,
  isPoolError,
  poolStats
} from "../../src/plugins";
import { createTestAdapter } from "../helpers/test-adapter";

/** A signal-shaped object the scheduler accepts. */
function abortSignal() {
  const listeners = new Set<() => void>();
  return {
    aborted: false,
    addEventListener(_type: "abort", listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "abort", listener: () => void) {
      listeners.delete(listener);
    },
    abort() {
      this.aborted = true;
      for (const listener of [...listeners]) listener();
    }
  };
}

/** Let every already-settled promise callback run. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("RequestPoolScheduler", () => {
  it("hands out slots up to the ceiling, then queues", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 2 });

    const a = await pool.acquire({});
    const b = await pool.acquire({});
    expect(pool.stats).toEqual({ active: 2, queued: 0, concurrency: 2 });

    let admitted = false;
    const c = pool.acquire({}).then((ticket) => {
      admitted = true;
      return ticket;
    });
    await tick();
    expect(admitted).toBe(false);
    expect(pool.stats.queued).toBe(1);

    a.release();
    const cTicket = await c;
    expect(admitted).toBe(true);
    expect(pool.stats.active).toBe(2);

    b.release();
    cTicket.release();
    expect(pool.stats.active).toBe(0);
  });

  it("returns a slot exactly once even if release is called repeatedly", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1 });

    const ticket = await pool.acquire({});
    ticket.release();
    ticket.release();
    ticket.release();

    expect(pool.stats.active).toBe(0);
    // A negative count would permanently deadlock the pool.
    await expect(pool.acquire({})).resolves.toBeDefined();
  });

  it("orders the queue by the priority function, not by arrival", async () => {
    // Lower weight = more urgent; the background request is queued *first*, so a
    // FIFO queue would admit it first and the test would fail.
    const pool = new RequestPoolScheduler({
      concurrency: 1,
      priority: (ctx) => (ctx as { weight: number }).weight
    });

    const holder = await pool.acquire({ weight: 0 });
    const order: string[] = [];

    // Each admitted ticket is released immediately: with `concurrency: 1` a waiter
    // that holds its slot forever would deadlock the ones behind it.
    const background = pool.acquire({ weight: 100 }).then((ticket) => {
      order.push("background");
      ticket.release();
    });
    const interactive = pool.acquire({ weight: 0 }).then((ticket) => {
      order.push("interactive");
      ticket.release();
    });

    holder.release();
    await Promise.all([background, interactive]);

    expect(order).toEqual(["interactive", "background"]);
  });

  it("keeps arrival order between equal priorities", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1, priority: () => 0 });
    const holder = await pool.acquire({});
    const order: string[] = [];

    const first = pool.acquire({}).then((ticket) => {
      order.push("first");
      ticket.release();
    });
    const second = pool.acquire({}).then((ticket) => {
      order.push("second");
      ticket.release();
    });

    holder.release();
    await Promise.all([first, second]);

    expect(order).toEqual(["first", "second"]);
  });

  it("rejects immediately once the queue is full", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1, maxQueue: 1 });

    const holder = await pool.acquire({});
    const queued = pool.acquire({});

    await expect(pool.acquire({})).rejects.toBeInstanceOf(SnailPoolError);
    await expect(pool.acquire({})).rejects.toMatchObject({
      code: POOL_ERROR_CODES.queueFull
    });

    holder.release();
    (await queued).release();
  });

  it("drops a waiter that exceeds queueTimeout", async () => {
    vi.useFakeTimers();
    try {
      const pool = new RequestPoolScheduler({ concurrency: 1, queueTimeout: 50 });
      const holder = await pool.acquire({});
      const queued = pool.acquire({});

      vi.advanceTimersByTime(50);

      await expect(queued).rejects.toMatchObject({
        code: POOL_ERROR_CODES.queueTimeout
      });
      // A dropped waiter must not keep its place in the queue.
      expect(pool.stats.queued).toBe(0);
      holder.release();
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes a waiter that is aborted while queued", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1 });
    const holder = await pool.acquire({});

    const signal = abortSignal();
    const queued = pool.acquire({}, signal);
    expect(pool.stats.queued).toBe(1);

    signal.abort();

    await expect(queued).rejects.toMatchObject({ code: POOL_ERROR_CODES.aborted });
    expect(pool.stats.queued).toBe(0);
    holder.release();
  });

  it("rejects an already-aborted signal without queueing", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1 });
    const signal = abortSignal();
    signal.abort();

    await expect(pool.acquire({}, signal)).rejects.toMatchObject({
      code: POOL_ERROR_CODES.aborted
    });
    expect(pool.stats).toEqual({ active: 0, queued: 0, concurrency: 1 });
  });

  it("clear() rejects every waiter and leaves the active count alone", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1 });
    const holder = await pool.acquire({});
    const first = pool.acquire({});
    const second = pool.acquire({});

    pool.clear();

    await expect(first).rejects.toMatchObject({ code: POOL_ERROR_CODES.cleared });
    await expect(second).rejects.toMatchObject({ code: POOL_ERROR_CODES.cleared });
    expect(pool.stats.active).toBe(1);
    holder.release();
    expect(pool.stats.active).toBe(0);
  });

  it("raising concurrency at runtime admits queued work", async () => {
    const pool = new RequestPoolScheduler({ concurrency: 1 });
    const holder = await pool.acquire({});
    let admitted = false;
    const queued = pool.acquire({}).then(() => {
      admitted = true;
    });

    pool.setConcurrency(2);
    await queued;

    expect(admitted).toBe(true);
    expect(pool.stats.active).toBe(2);
    holder.release();
  });

  it("survives a throwing priority function", async () => {
    const pool = new RequestPoolScheduler({
      concurrency: 1,
      priority: () => {
        throw new Error("caller bug");
      }
    });

    const holder = await pool.acquire({});
    const queued = pool.acquire({});
    holder.release();

    await expect(queued).resolves.toBeDefined();
  });
});

describe("request pool through a server", () => {
  /** Track how many requests overlap, and cap them with a pool. */
  function countingHarness(
    options: Parameters<typeof RequestPool>[0],
    delayMs: number
  ) {
    const test = createTestAdapter({ delayMs });
    let inFlight = 0;
    let peak = 0;

    const adapter: AxiosAdapter = async (config) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        return await test.adapter(config);
      } finally {
        inFlight -= 1;
      }
    };

    @Server({ baseURL: "/api", adapter })
    class TestServer extends SnailServer {}

    const Service = new TestServer();
    const plugin = RequestPool(options);
    Service.use(plugin);

    @Api("/thing")
    class ThingApi {
      @Get("/")
      list(): Promise<{ id: number }> {
        return null!;
      }
    }

    return {
      Service,
      api: Service.createApi(ThingApi),
      plugin,
      requests: test.requests,
      peak: () => peak
    };
  }

  it("never exceeds the configured concurrency", async () => {
    const { api, peak, requests } = countingHarness({ concurrency: 2 }, 15);

    await Promise.all(Array.from({ length: 6 }, () => api.list().send()));

    expect(requests).toHaveLength(6);
    expect(peak()).toBeLessThanOrEqual(2);
    // Proves the cap actually engaged rather than the requests happening to serialise.
    expect(peak()).toBeGreaterThan(1);
  });

  it("reports live stats while requests are queued", async () => {
    const { api, plugin } = countingHarness({ concurrency: 1 }, 10);

    const settled = Promise.all([api.list().send(), api.list().send(), api.list().send()]);
    await tick();

    const stats = poolStats(plugin);
    expect(stats?.concurrency).toBe(1);
    expect(stats?.queued).toBeGreaterThanOrEqual(1);

    await settled;
    expect(poolStats(plugin)?.active).toBe(0);
    expect(poolStats(plugin)?.queued).toBe(0);
  });

  it("refuses a request the queue has no room for, without sending it", async () => {
    // No queue at all: only the request already holding the slot may proceed.
    const { api, requests } = countingHarness({ concurrency: 1, maxQueue: 0 }, 10);

    const results = await Promise.allSettled([
      api.list().send(),
      api.list().send(),
      api.list().send()
    ]);

    const refused = results.filter(
      (entry) => entry.status === "rejected" && isPoolError(entry.reason)
    );
    expect(refused).toHaveLength(2);
    // The two refusals happened before the wire, so at most one request was sent.
    expect(requests.length).toBeLessThanOrEqual(1);
  });

  it("returns the slot when the request fails, so the pool does not shrink", async () => {
    const test = createTestAdapter({ error: new Error("transport down") });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    const plugin = RequestPool({ concurrency: 1 });
    Service.use(plugin);

    @Api("/thing")
    class ThingApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(ThingApi);
    for (let i = 0; i < 3; i++) {
      await expect(api.list().send()).rejects.toThrow("transport down");
    }

    expect(poolStats(plugin)?.active).toBe(0);
  });

  it("never spends a slot on a request the cache can answer", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 1 } },
      delayMs: 5
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    // The pool sits at -150, below the cache at -100, so a hit short-circuits
    // `beforeRequest` upstream of the pool and the pool is never reached.
    Service.use(Cache({ ttl: 60 })).use(RequestPool({ concurrency: 1 }));

    @Api("/cached")
    class CachedApi {
      @Get("/")
      @Cacheable()
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const api = Service.createApi(CachedApi);
    const cold = await api.get().send();
    const warm = await api.get().send();

    expect(cold.fromCache).toBe(false);
    expect(warm.fromCache).toBe(true);
    expect(test.requests).toHaveLength(1);
  });

  it("clearPool rejects the queued requests", async () => {
    const { api, plugin } = countingHarness({ concurrency: 1 }, 20);

    const settled = Promise.allSettled([api.list().send(), api.list().send()]);
    await tick();

    clearPool(plugin);
    const results = await settled;

    expect(results.some((entry) => entry.status === "rejected")).toBe(true);
  });

  it("releases queued requests when the plugin is uninstalled", async () => {
    const { Service, api } = countingHarness({ concurrency: 1 }, 25);

    const settled = Promise.allSettled([api.list().send(), api.list().send()]);
    await tick();

    // Uninstalling clears the pool, so a request that would otherwise wait forever
    // for a pool that no longer exists is rejected instead of hanging.
    await Service.remove("pool");

    const results = await settled;
    const refused = results.filter(
      (entry) => entry.status === "rejected" && isPoolError(entry.reason)
    );
    expect(refused.length).toBeGreaterThanOrEqual(1);
  });
});
