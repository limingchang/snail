/**
 * Zod validation plugin.
 *
 * The suite pins the asymmetry the project asked for: an invalid **request**
 * throws before anything reaches the network, while an invalid **response** only
 * warns and still resolves with the payload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Api, Data, Get, Post, Query, Server, SnailServer } from "../../src/index";
import {
  SnailValidationError,
  Validate,
  ValidateResponse
} from "../../src/plugins/validate";
import { PropertyType, Transform } from "../../src/plugins/transform";
import { createTestAdapter } from "../helpers/test-adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request validation", () => {
  it("lets a request that satisfies the schema through", async () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    class UserApi {
      @Post("/")
      @Validate(z.object({ name: z.string() }))
      create(@Data() body: unknown): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).create({ name: "ada" }).send();

    expect(test.requests).toHaveLength(1);
  });

  it("rejects an invalid request without sending it", async () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    class UserApi {
      @Post("/")
      @Validate(z.object({ name: z.string() }))
      create(@Data() body: unknown): Promise<void> {
        return null!;
      }
    }

    const error = await Service.createApi(UserApi)
      .create({ name: 42 })
      .send()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SnailValidationError);
    expect((error as SnailValidationError).code).toBe("SNAIL_VALIDATION_ERROR");
    expect((error as SnailValidationError).issues.length).toBeGreaterThan(0);
    expect((error as Error).message).toContain("UserApi.create");
    // The whole point: validation failure happens before the network.
    expect(test.requests).toHaveLength(0);
  });

  it("validates the query params of a read request", async () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/list")
    class ListApi {
      @Get("/")
      @Validate(z.object({ page: z.number() }))
      list(@Query("page") page: number): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(ListApi);
    await api.list(1).send();
    await expect(api.list("nope" as unknown as number).send()).rejects.toBeInstanceOf(
      SnailValidationError
    );

    expect(test.requests).toHaveLength(1);
  });

  it("downgrades a request failure to a warning when strict is false", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate({ strict: false }));

    @Api("/user")
    class UserApi {
      @Post("/")
      @Validate(z.object({ name: z.string() }))
      create(@Data() body: unknown): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).create({ name: 42 }).send();

    expect(test.requests).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("uses the factory schema when no decorator declares one", async () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate({ request: z.object({ name: z.string() }) }));

    @Api("/user")
    class UserApi {
      @Post("/")
      create(@Data() body: unknown): Promise<void> {
        return null!;
      }
    }

    await expect(Service.createApi(UserApi).create({ name: 1 }).send()).rejects.toBeInstanceOf(
      SnailValidationError
    );
    expect(test.requests).toHaveLength(0);
  });

  it("is a no-op when nothing declares a schema", async () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    class UserApi {
      @Post("/")
      create(@Data() body: unknown): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).create({ anything: true }).send();

    expect(test.requests).toHaveLength(1);
  });
});

describe("class and method inheritance", () => {
  it("applies a class-level schema to every method and lets a method override it", async () => {
    const test = createTestAdapter();

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    @Validate(z.object({ name: z.string() }))
    class UserApi {
      @Post("/a")
      createA(@Data() body: unknown): Promise<void> {
        return null!;
      }

      @Post("/b")
      @Validate(z.object({ age: z.number() }))
      createB(@Data() body: unknown): Promise<void> {
        return null!;
      }
    }

    const api = Service.createApi(UserApi);

    // class-level schema, inherited by createA
    await api.createA({ name: "ada" }).send();
    // createB's own schema replaces it: a class-valid body is now invalid
    await expect(api.createB({ name: "ada" }).send()).rejects.toBeInstanceOf(
      SnailValidationError
    );
    await api.createB({ age: 36 }).send();

    expect(test.requests).toHaveLength(2);
  });

  it("lets a method-level response schema override the class-level one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { nick: "ada" } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    @ValidateResponse(z.object({ id: z.number() }))
    class UserApi {
      @Get("/nick")
      @ValidateResponse(z.object({ nick: z.string() }))
      nick(): Promise<{ nick: string }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).nick().send();

    expect(result.data).toEqual({ nick: "ada" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("response validation", () => {
  it("warns about an invalid response but still resolves with the data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: "not-a-number" } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    class UserApi {
      @Get("/")
      @ValidateResponse(z.object({ id: z.number() }))
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).get().send();

    expect(result.data).toEqual({ id: "not-a-number" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("applies a factory response schema when no decorator declares one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: "nope" } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate({ response: z.object({ id: z.number() }) }));

    @Api("/user")
    class UserApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    await Service.createApi(UserApi).get().send();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("passes a valid response through without a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const test = createTestAdapter({
      body: { code: 0, message: "ok", data: { id: 3 } }
    });

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());

    @Api("/user")
    class UserApi {
      @Get("/")
      @ValidateResponse(z.object({ id: z.number() }))
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).get().send();

    expect(result.data).toEqual({ id: 3 });
    expect(warn).not.toHaveBeenCalled();
  });

  it("validates the raw JSON before the transform plugin hydrates it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const test = createTestAdapter({
      body: {
        code: 0,
        message: "ok",
        data: { id: 3, createdAt: "2024-01-02T03:04:05.000Z" }
      }
    });

    @Server({ baseURL: "/api", adapter: test.adapter, logLevel: "warn" })
    class TestServer extends SnailServer {}
    const Service = new TestServer();
    Service.use(Validate());
    Service.use(Transform());

    class OrderDto {
      @PropertyType(() => Number) id!: number;
      @PropertyType(() => Date) createdAt!: Date;
    }

    @Api("/order")
    @Transform(OrderDto)
    class OrderApi {
      @Get("/")
      @ValidateResponse(z.object({ id: z.number(), createdAt: z.string() }))
      get(): Promise<OrderDto> {
        return null!;
      }
    }

    const result = await Service.createApi(OrderApi).get().send();

    // The schema describes the JSON the backend sends, so validate (-50) runs
    // before transform (0) on the unwind path and sees the raw string...
    expect(warn).not.toHaveBeenCalled();
    // ...while the caller still receives hydrated instances.
    expect(result.data).toBeInstanceOf(OrderDto);
    expect(result.data.createdAt).toBeInstanceOf(Date);
  });
});
