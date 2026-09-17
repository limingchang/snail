/**
 * The cache plugin.
 *
 * Every case goes through a real `send()` against the recording test adapter, so
 * what is asserted is the observable contract — how many network requests
 * happened and what the caller received — rather than the internal bookkeeping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Api,
  Data,
  Get,
  Post,
  Query,
  SnailPluginError,
  SnailServer,
  Server
} from "../../src/index";
import {
  Cache,
  CacheManager,
  Cacheable,
  HitSource,
  IndexedDBCacheAdapter,
  Invalidates,
  MemoryCacheAdapter,
  NoCache,
  WebStorageCacheAdapter
} from "../../src/plugins/cache";
import type { CacheAdapter, CachePlugin } from "../../src/plugins/cache";
import { createTestAdapter } from "../helpers/test-adapter";
import type { TestReply } from "../helpers/test-adapter";

afterEach(() => {
  vi.useRealTimers();
});

function buildServer(reply: TestReply = {}, ...plugins: CachePlugin[]) {
  const test = createTestAdapter({
    body: { code: 0, message: "ok", data: { id: 1 } },
    ...reply
  });

  @Server({ baseURL: "/api", adapter: test.adapter })
  class TestServer extends SnailServer {}

  const Service = new TestServer();
  for (const plugin of plugins) Service.use(plugin);

  return { Service, test };
}

/** Count only the requests of one verb, so a POST cannot mask a GET miss. */
function count(test: { requests: Array<{ method: string }> }, method: string): number {
  return test.requests.filter((request) => request.method === method).length;
}

/** Move the clock without touching the timer implementation. */
function advance(ms: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
}

// ── hits, misses and keys ───────────────────────────────────────────────────

describe("cache hits", () => {
  it("serves a second identical GET from the cache", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<{ id: number }> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    const first = await api.list().send();
    const second = await api.list().send();

    expect(test.requests).toHaveLength(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual({ id: 1 });
  });

  it("keys on the query params, not on the request object", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/list")
    class ListApi {
      @Get("/")
      list(@Query("page") page: number): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(ListApi);
    await api.list(1).send();
    await api.list(2).send();

    expect(test.requests).toHaveLength(2);
  });

  it("produces one key regardless of the order of the params", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/list")
    class StableApi {
      @Get("/")
      list(@Query() filters: Record<string, number>): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(StableApi);
    await api.list({ a: 1, b: 2 }).send();
    await api.list({ b: 2, a: 1 }).send();

    // `stableStringify` sorts object keys, so the two are the same request.
    expect(test.requests).toHaveLength(1);
  });

  it("honours an explicit @Cacheable({ key })", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/list")
    class KeyedApi {
      @Get("/")
      @Cacheable({ key: "shared" })
      list(@Query("page") page: number): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(KeyedApi);
    await api.list(1).send();
    await api.list(2).send();

    // The explicit key replaces the request identity, which is the point of the
    // option: both pages share one entry.
    expect(test.requests).toHaveLength(1);
  });

  it("re-fetches once the ttl elapsed", async () => {
    const { Service, test } = buildServer({}, Cache({ ttl: 1 }));

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();

    advance(2000);
    await api.list().send();

    expect(test.requests).toHaveLength(2);
  });

  it("serves a stale entry immediately and revalidates in the background", async () => {
    let call = 0;
    const test = createTestAdapter(() => {
      call += 1;
      return { body: { code: 0, message: "ok", data: { call } } };
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Cache({ ttl: 1, staleWhileRevalidate: true }));

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<{ call: number }> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    expect((await api.list().send()).data).toEqual({ call: 1 });

    advance(2000);
    const stale = await api.list().send();
    expect(stale.fromCache).toBe(true);
    expect(stale.data).toEqual({ call: 1 });

    // The refresh is detached from the request that served the stale body.
    await vi.waitFor(() => expect(test.requests).toHaveLength(2));

    const refreshed = await api.list().send();
    expect(refreshed.fromCache).toBe(true);
    expect(refreshed.data).toEqual({ call: 2 });
    expect(test.requests).toHaveLength(2);
  });
});

// ── opt-out and verb policy ─────────────────────────────────────────────────

describe("cache policy", () => {
  it("@NoCache() on a method disables caching", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      @NoCache()
      list(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();
    await api.list().send();

    expect(test.requests).toHaveLength(2);
  });

  it("@NoCache() on a class disables caching, and a method-level @Cacheable wins", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    @NoCache()
    class UserApi {
      @Get("/plain")
      plain(): Promise<void> {
        return null!;
      }

      @Get("/forced")
      @Cacheable()
      forced(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.plain().send();
    await api.plain().send();
    expect(count(test, "GET")).toBe(2);

    await api.forced().send();
    await api.forced().send();
    // Method-level opt-in beats the class-wide opt-out — "method-level wins" in
    // both directions.
    expect(test.requests).toHaveLength(3);
  });

  it("does not cache a non-GET verb by default", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Post("/")
      create(@Data("name") name: string): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.create("ada").send();
    await api.create("ada").send();

    expect(test.requests).toHaveLength(2);
  });

  it("caches any verb with cacheFor: 'all'", async () => {
    const { Service, test } = buildServer({}, Cache({ cacheFor: "all" }));

    @Api("/user")
    class UserApi {
      @Post("/")
      create(@Data("name") name: string): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.create("ada").send();
    await api.create("ada").send();

    expect(test.requests).toHaveLength(1);
  });

  it("@Cacheable() opts a non-GET method in explicitly", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Post("/")
      @Cacheable()
      create(@Data("name") name: string): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.create("ada").send();
    await api.create("ada").send();

    expect(test.requests).toHaveLength(1);
  });
});

// ── invalidation ────────────────────────────────────────────────────────────

describe("invalidation", () => {
  it("@Invalidates purges a tagged entry", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      @Cacheable({ tags: ["users"] })
      list(): Promise<void> {
        return null!;
      }

      @Post("/")
      @Invalidates("users")
      create(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();
    await api.list().send();
    expect(count(test, "GET")).toBe(1);

    await api.create().send();
    await api.list().send();

    expect(count(test, "GET")).toBe(2);
  });

  it("@HitSource is an alias of @Invalidates", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      @Cacheable({ tags: ["users"] })
      list(): Promise<void> {
        return null!;
      }

      @Post("/")
      @HitSource("users")
      create(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();
    await api.create().send();
    await api.list().send();

    expect(count(test, "GET")).toBe(2);
  });

  it("purges before storing, so a method does not delete its own entry", async () => {
    const { Service, test } = buildServer({}, Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      @Cacheable({ tags: ["users"] })
      @Invalidates("users")
      list(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();
    await api.list().send();

    // Storing before purging would leave zero entries here and cause a second
    // network request.
    expect(test.requests).toHaveLength(1);
  });

  it("invalidateTags and invalidateAll drop the matching entries", async () => {
    const manager = new CacheManager();

    await manager.set("tagged", 1, 60, ["users"]);
    await manager.set("other", 2, 60);

    expect(await manager.has("tagged")).toBe(true);
    await manager.invalidateTags(["users"]);
    expect(await manager.has("tagged")).toBe(false);
    expect(await manager.has("other")).toBe(true);

    await manager.invalidateAll();
    expect(manager.size).toBe(0);
    expect(await manager.has("other")).toBe(false);

    await manager.set("again", 3, 60);
    expect(await manager.has("again")).toBe(true);
    await manager.clear();
    expect(await manager.has("again")).toBe(false);
  });
});

// ── L1 capacity and layers ──────────────────────────────────────────────────

describe("memory layer", () => {
  it("evicts the least recently used entry past maxSize", async () => {
    const manager = new CacheManager({ maxSize: 2 });

    await manager.set("a", 1, 60);
    await manager.set("b", 2, 60);

    // Touch "a" so "b" becomes the oldest entry.
    expect(await manager.get("a")).toBe(1);

    await manager.set("c", 3, 60);

    expect(await manager.has("b")).toBe(false);
    expect(await manager.has("a")).toBe(true);
    expect(await manager.has("c")).toBe(true);
    expect(manager.size).toBe(2);
  });

  it("drops a key from its tag index when it is evicted", async () => {
    const manager = new CacheManager({ maxSize: 1 });

    await manager.set("a", 1, 60, ["tag"]);
    await manager.set("b", 2, 60);

    await expect(manager.invalidateTags(["tag"])).resolves.toBeUndefined();
    expect(await manager.has("b")).toBe(true);
  });

  it("expires lazily without keeping a timer alive", async () => {
    const adapter = new MemoryCacheAdapter();
    await adapter.set("k", 1, 60);

    advance(61000);
    expect(await adapter.get("k")).toBeUndefined();
    expect(adapter.size).toBe(0);
  });
});

describe("L2 layer", () => {
  it("writes to a custom adapter and reads it on an L1 miss", async () => {
    const l2 = new RecordingAdapter();
    const { Service, test } = buildServer({}, Cache({ l2 }));

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();

    expect(l2.writes).toHaveLength(1);
    expect(l2.reads).toHaveLength(1);

    await api.list().send();
    expect(test.requests).toHaveLength(1);
    // The second read was served by L1, so L2 was never consulted again.
    expect(l2.reads).toHaveLength(1);
  });

  it("promotes an L2 hit into L1", async () => {
    const l2 = new RecordingAdapter();

    // A second manager stands in for a fresh page load: same L2, empty L1.
    const writer = new CacheManager({ l2 });
    await writer.set("k", 42, 60);

    const reader = new CacheManager({ l2 });
    expect(reader.size).toBe(0);

    expect(await reader.get("k")).toBe(42);
    expect(reader.size).toBe(1);

    expect(await reader.get("k")).toBe(42);
    expect(l2.reads).toHaveLength(1);
  });

  it("never fails the request when L2 throws", async () => {
    const { Service, test } = buildServer({}, Cache({ l2: new BrokenAdapter() }));

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<{ id: number }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).list().send();

    expect(result.data).toEqual({ id: 1 });
    expect(test.requests).toHaveLength(1);
  });

  it("rejects an unknown adapter name at install time", () => {
    const { Service } = buildServer();

    expect(() => Service.use(Cache({ l2: "redis" as never }))).toThrow(SnailPluginError);
  });
});

// ── concurrency ─────────────────────────────────────────────────────────────

describe("in-flight de-duplication", () => {
  it("collapses concurrent identical requests into one", async () => {
    const { Service, test } = buildServer({ delayMs: 20 }, Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<{ id: number }> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    const [first, second] = await Promise.all([api.list().send(), api.list().send()]);

    expect(test.requests).toHaveLength(1);
    expect(first.data).toEqual({ id: 1 });
    expect(second.data).toEqual({ id: 1 });
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
  });

  it("sends its own request when the shared one fails", async () => {
    let attempt = 0;
    const test = createTestAdapter(() => {
      attempt += 1;
      return attempt === 1
        ? { error: new Error("first attempt failed"), delayMs: 20 }
        : { body: { code: 0, message: "ok", data: { id: 1 } } };
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Cache());

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<{ id: number }> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    const [leader, follower] = await Promise.allSettled([
      api.list().send(),
      api.list().send()
    ]);

    expect(leader.status).toBe("rejected");
    expect(follower.status).toBe("fulfilled");
    expect(test.requests).toHaveLength(2);
  });
});

// ── adapters ────────────────────────────────────────────────────────────────

describe("adapters", () => {
  it("degrades to a no-op when the Web Storage area is missing", async () => {
    const adapter = new WebStorageCacheAdapter(() => undefined);

    expect(adapter.available).toBe(false);
    await expect(adapter.get("k")).resolves.toBeUndefined();
    await expect(adapter.set("k", 1, 60)).resolves.toBeUndefined();
    await expect(adapter.delete("k")).resolves.toBeUndefined();
    await expect(adapter.clear()).resolves.toBeUndefined();
    await expect(adapter.keys()).resolves.toEqual([]);
  });

  it("stores, expires, lists and clears through a Web Storage area", async () => {
    const storage = new FakeStorage();
    const adapter = new WebStorageCacheAdapter(() => storage, { prefix: "p:" });

    expect(adapter.available).toBe(true);
    await adapter.set("k", { a: 1 }, 60);
    await expect(adapter.get("k")).resolves.toEqual({ a: 1 });
    await expect(adapter.keys()).resolves.toEqual(["k"]);

    await adapter.set("short", 2, 1);
    advance(2000);
    await expect(adapter.get("short")).resolves.toBeUndefined();

    await adapter.clear();
    await expect(adapter.keys()).resolves.toEqual([]);
  });

  it("never throws for IndexedDB in an environment without it", async () => {
    const adapter = new IndexedDBCacheAdapter();

    await expect(adapter.get("k")).resolves.toBeUndefined();
    await expect(adapter.set("k", 1, 60)).resolves.toBeUndefined();
    await expect(adapter.keys()).resolves.toEqual([]);
    await expect(adapter.clear()).resolves.toBeUndefined();
  });

  it("falls back to L1 when the selected L2 is unavailable", async () => {
    const { Service, test } = buildServer({}, Cache({ l2: "localStorage" }));

    @Api("/user")
    class UserApi {
      @Get("/")
      list(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);
    await api.list().send();
    await api.list().send();

    expect(test.requests).toHaveLength(1);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

/** Records every L2 interaction so a test can prove which layer was used. */
class RecordingAdapter implements CacheAdapter {
  readonly values = new Map<string, unknown>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];

  async get<T = unknown>(key: string): Promise<T | undefined> {
    this.reads.push(key);
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.writes.push(key);
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async clear(): Promise<void> {
    this.values.clear();
  }
}

/** An L2 that is down: every operation rejects. */
class BrokenAdapter implements CacheAdapter {
  async get<T = unknown>(): Promise<T | undefined> {
    throw new Error("L2 is down");
  }

  async set(): Promise<void> {
    throw new Error("L2 is down");
  }

  async delete(): Promise<void> {
    throw new Error("L2 is down");
  }

  async clear(): Promise<void> {
    throw new Error("L2 is down");
  }
}

/** Minimal in-memory `Storage` so the Web Storage adapter can be exercised. */
class FakeStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}
