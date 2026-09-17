/**
 * JSON → class transform plugin.
 *
 * One case here is a genuine safety property rather than a feature: a
 * self-referencing `@PropertyType` combined with deeply nested or cyclic JSON must
 * terminate instead of recursing until the stack dies. Everything else pins the
 * shape rules — nesting, arrays, `Date`, renaming, and the two ways a payload is
 * left alone (no DTO at all, or a hydration failure).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Api, Get, Server, SnailServer } from "../../src/index";
import { ExposeName, PropertyType, Transform } from "../../src/plugins/transform";
import { createTestAdapter } from "../helpers/test-adapter";
import type { TransformOptions } from "../../src/plugins/transform";

/** Declares nothing: there is no whitelist, so every own key is copied. */
class FlatDto {
  id!: number;
  name!: string;
}

class ChildDto {
  @PropertyType(() => Number) id!: number;
}

class NestedDto {
  @PropertyType(() => Number) id!: number;
  @PropertyType(() => ChildDto) child!: ChildDto;
  @PropertyType(() => ChildDto) nullable!: ChildDto | null;
}

class ListDto {
  @PropertyType(() => ChildDto, { array: true }) children!: ChildDto[];
  @PropertyType(() => Number, { array: true }) tags!: number[];
}

class DateDto {
  @PropertyType(() => Date) createdAt!: Date;
  @PropertyType(() => Date, { array: true }) stamps!: Date[];
}

class RenamedDto {
  @ExposeName("user_name") userName!: string;
}

class StrictDto {
  @PropertyType(() => Number) id!: number;
}

/** A recursive type: without a depth cap this never finishes. */
class NodeDto {
  @PropertyType(() => Number) id!: number;
  @PropertyType(() => NodeDto) child!: NodeDto;
}

class CustomDto {
  label!: string;

  static fromJSON(raw: unknown): CustomDto {
    const dto = new CustomDto();
    dto.label = `from:${String((raw as { original?: unknown }).original)}`;
    return dto;
  }
}

class BoomDto {
  constructor() {
    throw new Error("boom-dto");
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function buildServer(
  reply: Parameters<typeof createTestAdapter>[0] = {},
  options?: TransformOptions,
  logLevel?: "warn"
) {
  const test = createTestAdapter(reply);

  @Server({ baseURL: "/api", adapter: test.adapter, logLevel })
  class TestServer extends SnailServer {}
  const Service = new TestServer();
  Service.use(Transform(options));

  return { Service, test };
}

describe("hydration targets", () => {
  it("hydrates a flat DTO that declares nothing", async () => {
    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: { id: 1, name: "ada", extra: true } }
    });

    @Api("/flat")
    @Transform(FlatDto)
    class FlatApi {
      @Get("/")
      get(): Promise<FlatDto> {
        return null!;
      }
    }

    const result = await Service.createApi(FlatApi).get().send();

    expect(result.data).toBeInstanceOf(FlatDto);
    expect(result.data.id).toBe(1);
    expect(result.data.name).toBe("ada");
    // No declaration means no whitelist: undeclared keys come along.
    expect(result.data).toEqual({ id: 1, name: "ada", extra: true });
  });

  it("hydrates a nested DTO and passes null through", async () => {
    const { Service } = buildServer({
      body: {
        code: 0,
        message: "ok",
        data: { id: 1, child: { id: 2 }, nullable: null }
      }
    });

    @Api("/nested")
    @Transform(NestedDto)
    class NestedApi {
      @Get("/")
      get(): Promise<NestedDto> {
        return null!;
      }
    }

    const result = await Service.createApi(NestedApi).get().send();

    expect(result.data).toBeInstanceOf(NestedDto);
    expect(result.data.child).toBeInstanceOf(ChildDto);
    expect(result.data.child.id).toBe(2);
    expect(result.data.nullable).toBeNull();
  });

  it("hydrates an array of DTOs and an array of primitives", async () => {
    const { Service } = buildServer({
      body: {
        code: 0,
        message: "ok",
        data: { children: [{ id: 1 }, { id: 2 }], tags: [1, 2, 3] }
      }
    });

    @Api("/list")
    @Transform(ListDto)
    class ListApi {
      @Get("/")
      get(): Promise<ListDto> {
        return null!;
      }
    }

    const result = await Service.createApi(ListApi).get().send();

    expect(result.data.children).toHaveLength(2);
    expect(result.data.children[0]).toBeInstanceOf(ChildDto);
    expect(result.data.children.map((child) => child.id)).toEqual([1, 2]);
    expect(result.data.tags).toEqual([1, 2, 3]);
  });

  it("revives ISO strings into Date instances", async () => {
    const createdAt = "2024-01-02T03:04:05.000Z";
    const { Service } = buildServer({
      body: {
        code: 0,
        message: "ok",
        data: { createdAt, stamps: [createdAt, createdAt] }
      }
    });

    @Api("/dates")
    @Transform(DateDto)
    class DateApi {
      @Get("/")
      get(): Promise<DateDto> {
        return null!;
      }
    }

    const result = await Service.createApi(DateApi).get().send();

    expect(result.data.createdAt).toBeInstanceOf(Date);
    expect(result.data.createdAt.toISOString()).toBe(createdAt);
    expect(result.data.stamps[0]).toBeInstanceOf(Date);
    expect(result.data.stamps[1]!.toISOString()).toBe(createdAt);
  });

  it("lets a static fromJSON override automatic hydration", async () => {
    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: { original: "raw", ignored: 1 } }
    });

    @Api("/custom")
    @Transform(CustomDto)
    class CustomApi {
      @Get("/")
      get(): Promise<CustomDto> {
        return null!;
      }
    }

    const result = await Service.createApi(CustomApi).get().send();

    expect(result.data).toBeInstanceOf(CustomDto);
    expect(result.data.label).toBe("from:raw");
    expect((result.data as unknown as Record<string, unknown>).ignored).toBeUndefined();
  });

  it("maps a renamed property through @ExposeName", async () => {
    const { Service } = buildServer({
      body: {
        code: 0,
        message: "ok",
        data: { user_name: "ada", userName: "ignored" }
      }
    });

    @Api("/renamed")
    @Transform(RenamedDto)
    class RenamedApi {
      @Get("/")
      get(): Promise<RenamedDto> {
        return null!;
      }
    }

    const result = await Service.createApi(RenamedApi).get().send();

    expect(result.data.userName).toBe("ada");
  });
});

describe("unknown keys", () => {
  it("drops keys the DTO does not declare", async () => {
    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: { id: 1, extra: true } }
    });

    @Api("/strict")
    @Transform(StrictDto)
    class StrictApi {
      @Get("/")
      get(): Promise<StrictDto> {
        return null!;
      }
    }

    const result = await Service.createApi(StrictApi).get().send();

    expect(result.data).toBeInstanceOf(StrictDto);
    expect(result.data.id).toBe(1);
    expect((result.data as unknown as Record<string, unknown>).extra).toBeUndefined();
  });

  it("keeps them when keepUnknown is true", async () => {
    const { Service } = buildServer(
      { body: { code: 0, message: "ok", data: { id: 1, extra: true } } },
      { keepUnknown: true }
    );

    @Api("/loose")
    @Transform(StrictDto)
    class LooseApi {
      @Get("/")
      get(): Promise<StrictDto> {
        return null!;
      }
    }

    const result = await Service.createApi(LooseApi).get().send();

    expect((result.data as unknown as Record<string, unknown>).extra).toBe(true);
  });
});

describe("DTO resolution", () => {
  it("prefers the method DTO over the class DTO", async () => {
    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: { id: 1, user_name: "ada" } }
    });

    @Api("/mix")
    @Transform(StrictDto)
    class MixedApi {
      @Get("/class")
      classLevel(): Promise<StrictDto> {
        return null!;
      }

      @Get("/method")
      @Transform(RenamedDto)
      methodLevel(): Promise<RenamedDto> {
        return null!;
      }
    }

    const api = Service.createApi(MixedApi);

    const classResult = await api.classLevel().send();
    const methodResult = await api.methodLevel().send();

    expect(classResult.data).toBeInstanceOf(StrictDto);
    expect(methodResult.data).toBeInstanceOf(RenamedDto);
    expect(methodResult.data.userName).toBe("ada");
  });

  it("falls back to the factory dto option", async () => {
    const { Service } = buildServer(
      { body: { code: 0, message: "ok", data: { id: 5 } } },
      { dto: StrictDto }
    );

    @Api("/factory")
    class FactoryApi {
      @Get("/")
      get(): Promise<StrictDto> {
        return null!;
      }
    }

    const result = await Service.createApi(FactoryApi).get().send();

    expect(result.data).toBeInstanceOf(StrictDto);
    expect(result.data.id).toBe(5);
  });

  it("leaves the payload untouched when no DTO is known", async () => {
    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: { id: 1 } }
    });

    @Api("/plain")
    class PlainApi {
      @Get("/")
      get(): Promise<{ id: number }> {
        return null!;
      }
    }

    const result = await Service.createApi(PlainApi).get().send();

    expect(result.data).toEqual({ id: 1 });
    expect(result.data).not.toBeInstanceOf(StrictDto);
  });
});

describe("safety", () => {
  it("stops descending past the depth cap instead of hanging", async () => {
    let nested: { child?: unknown } = {};
    for (let level = 0; level < 80; level++) nested = { child: nested };

    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: nested }
    });

    @Api("/deep")
    @Transform(NodeDto)
    class DeepApi {
      @Get("/")
      get(): Promise<NodeDto> {
        return null!;
      }
    }

    const result = await Service.createApi(DeepApi).get().send();

    let depth = 0;
    let cursor: unknown = result.data;
    while (cursor instanceof NodeDto) {
      cursor = cursor.child;
      depth++;
    }

    expect(result.data).toBeInstanceOf(NodeDto);
    expect(depth).toBeGreaterThan(0);
    // 32 levels of descent plus the root, and then the raw object is kept as-is.
    expect(depth).toBeLessThanOrEqual(33);
    expect(cursor).toBeDefined();
  });

  it("terminates on a cyclic payload", async () => {
    const cyclic: { id: number; child?: unknown } = { id: 1 };
    cyclic.child = cyclic;

    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: cyclic }
    });

    @Api("/cyclic")
    @Transform(NodeDto)
    class CyclicApi {
      @Get("/")
      get(): Promise<NodeDto> {
        return null!;
      }
    }

    const result = await Service.createApi(CyclicApi).get().send();

    expect(result.data).toBeInstanceOf(NodeDto);
    expect(result.data.id).toBe(1);
    // The cycle is handed back untouched rather than re-hydrated forever.
    expect(result.data.child).toBe(cyclic);
  });

  it("keeps the raw payload when hydration fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = { id: 1 };
    const { Service } = buildServer(
      { body: { code: 0, message: "ok", data: raw } },
      undefined,
      "warn"
    );

    @Api("/boom")
    @Transform(BoomDto)
    class BoomApi {
      @Get("/")
      get(): Promise<BoomDto> {
        return null!;
      }
    }

    const result = await Service.createApi(BoomApi).get().send();

    expect(result.data).toEqual(raw);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
