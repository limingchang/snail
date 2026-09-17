/**
 * Cross-plugin integration: the cache and the payload plugins on the same method.
 *
 * A cache hit short-circuits `beforeRequest` and supplies the response itself, so
 * it never enters the transport step. The contract these tests pin down is that a
 * hit changes only *where the response came from* — every plugin that works on the
 * payload must behave identically on both paths.
 *
 * Getting this wrong is subtle and invisible to a single-plugin suite: the first
 * call returns a hydrated DTO instance and the second returns a plain object, so an
 * application that only ever tested the cold path ships a bug that appears on the
 * second render.
 */
import { describe, expect, it, vi } from "vitest";
import {
  Api,
  Get,
  Params,
  Server,
  SnailServer
} from "../../src/index";
import { Cache, Cacheable, Invalidates, Transform } from "../../src/plugins";
import { createTestAdapter } from "../helpers/test-adapter";

class UserDto {
  id!: number;
  name!: string;

  /** Report the class identity, so a plain object is detectable. */
  get isDto(): boolean {
    return true;
  }
}

function harness(reply: Parameters<typeof createTestAdapter>[0] = {}) {
  const test = createTestAdapter(reply);

  @Server({ baseURL: "/api", adapter: test.adapter })
  class TestServer extends SnailServer {}

  const Service = new TestServer();
  Service.use(Cache({ ttl: 60 })).use(Transform());

  @Api("/user")
  class UserApi {
    @Get("/:id")
    @Cacheable()
    @Transform(UserDto)
    getUser(@Params("id") id: string): Promise<UserDto> {
      return null!;
    }
  }

  return { Service, test, api: Service.createApi(UserApi) };
}

describe("cache hit + transform", () => {
  it("hydrates the payload into the DTO on a cold call and on a hit alike", async () => {
    const { Service, test, api } = harness({
      body: { code: 0, message: "ok", data: { id: 1, name: "ada" } }
    });
    void Service;

    const cold = await api.getUser("1").send();
    expect(cold.fromCache).toBe(false);
    expect(cold.data).toBeInstanceOf(UserDto);
    expect(cold.data.name).toBe("ada");

    const warm = await api.getUser("1").send();
    expect(warm.fromCache).toBe(true);
    expect(test.requests).toHaveLength(1);

    // The regression this test exists for: without running the response chain on a
    // hit, `warm.data` would be a plain object.
    expect(warm.data).toBeInstanceOf(UserDto);
    expect(warm.data.name).toBe("ada");
  });

  it("hands out a fresh object per hit, so a caller cannot mutate the cache", async () => {
    const { test, api } = harness({
      body: { code: 0, message: "ok", data: { id: 1, name: "ada" } }
    });

    const first = await api.getUser("1").send();
    first.data.name = "mutated by the caller";

    const second = await api.getUser("1").send();
    expect(test.requests).toHaveLength(1);
    expect(second.data.name).toBe("ada");

    // And the two results must not be the same object at all.
    expect(second.data).not.toBe(first.data);
  });
});

describe("cache hit + invalidates", () => {
  it("does not purge tags from a cache hit, because no mutation reached the server", async () => {
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 1, name: "ada" } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Cache({ ttl: 60 }));

    @Api("/user")
    class UserApi {
      @Get("/list")
      @Cacheable({ tags: ["users"] })
      list(): Promise<{ id: number }[]> {
        return null!;
      }

      @Get("/touch")
      @Cacheable()
      @Invalidates("users")
      touch(): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);

    await api.list().send();
    await api.touch().send();

    // `touch` ran for real, so its tag purge is legitimate: the list is gone.
    await api.list().send();
    expect(test.requests.filter((entry) => entry.url === "/user/list")).toHaveLength(2);

    // Now the list is cached again; a second `touch` is a cache hit, so it must
    // NOT purge — the mutation was never performed.
    await api.touch().send();
    await api.list().send();
    expect(test.requests.filter((entry) => entry.url === "/user/list")).toHaveLength(2);
  });
});

describe("cache hit + response validation", () => {
  it("warns about an invalid cached payload instead of skipping validation", async () => {
    const { z } = await import("zod");
    const { Validate, ValidateResponse } = await import("../../src/plugins");

    const test = createTestAdapter({
      // Deliberately wrong shape, so the response schema rejects it.
      body: { code: 0, message: "ok", data: { id: "not-a-number" } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate()).use(Cache({ ttl: 60 }));

    @Api("/thing")
    class ThingApi {
      @Get("/")
      @Cacheable()
      @ValidateResponse(z.object({ id: z.number() }))
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const api = Service.createApi(ThingApi);
      await api.get().send();
      const coldWarnings = warn.mock.calls.length;

      const warm = await api.get().send();
      expect(warm.fromCache).toBe(true);

      // The cached payload is re-validated, so the warning is raised again.
      expect(warn.mock.calls.length).toBeGreaterThan(coldWarnings);
    } finally {
      warn.mockRestore();
    }
  });
});
