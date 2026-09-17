/**
 * The core, with **no plugins installed**.
 *
 * This suite is the contract for step 4 of the rebuild: decorators, argument
 * resolution, url building, transport and envelope handling must all work on
 * their own before a single plugin exists.
 *
 * Note how every request method declares its parameters with decorators — a
 * decorated method's body is never executed, it exists to declare the argument
 * and return types (`return null!` is the convention).
 */
import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import {
  Api,
  Data,
  Delete,
  Get,
  Header,
  HeaderValue,
  Params,
  Patch,
  Post,
  Put,
  Query,
  Server,
  SnailCancelledError,
  SnailDecoratorError,
  SnailHttpError,
  SnailResponseError,
  SnailServer,
  defineMetadata,
  getMetadata,
  SNAIL_REQUEST_METHOD,
  SNAIL_SERVER_OPTIONS
} from "../../src/index";
import { createTestAdapter } from "../helpers/test-adapter";

function buildServer(reply: Parameters<typeof createTestAdapter>[0] = {}) {
  const test = createTestAdapter(reply);

  @Server({ baseURL: "/api", timeout: 1234, adapter: test.adapter })
  class TestServer extends SnailServer {}

  return { Service: new TestServer(), test };
}

describe("decorator metadata", () => {
  it("records @Server options on the class", () => {
    @Server({ baseURL: "/v1", name: "svc" })
    class S extends SnailServer {}

    expect(getMetadata(SNAIL_SERVER_OPTIONS, S)).toMatchObject({
      baseURL: "/v1",
      name: "svc"
    });
  });

  it("accepts the string shorthand for @Server", () => {
    @Server("/shorthand")
    class S extends SnailServer {}

    expect(getMetadata<{ baseURL: string }>(SNAIL_SERVER_OPTIONS, S)?.baseURL).toBe(
      "/shorthand"
    );
  });

  it("records the verb and path for each request-method decorator", () => {
    @Api("/m")
    class M {
      @Get("/a") a(): Promise<void> {
        return null!;
      }
      @Post("/b") b(): Promise<void> {
        return null!;
      }
      @Put("/c") c(): Promise<void> {
        return null!;
      }
      @Delete("/d") d(): Promise<void> {
        return null!;
      }
      @Patch("/e") e(): Promise<void> {
        return null!;
      }
    }

    expect(getMetadata(SNAIL_REQUEST_METHOD, M, "a")).toMatchObject({ method: "GET", url: "/a" });
    expect(getMetadata(SNAIL_REQUEST_METHOD, M, "b")).toMatchObject({ method: "POST", url: "/b" });
    expect(getMetadata(SNAIL_REQUEST_METHOD, M, "c")).toMatchObject({ method: "PUT", url: "/c" });
    expect(getMetadata(SNAIL_REQUEST_METHOD, M, "d")).toMatchObject({ method: "DELETE", url: "/d" });
    expect(getMetadata(SNAIL_REQUEST_METHOD, M, "e")).toMatchObject({ method: "PATCH", url: "/e" });
  });

  it("throws when two request-method decorators share one method", () => {
    expect(() => {
      @Api("/dup")
      class D {
        @Get("/x")
        @Post("/y")
        both(): Promise<void> {
          return null!;
        }
      }
      return D;
    }).toThrow(SnailDecoratorError);
  });

  it("throws when a key-less parameter argument is not a plain object", async () => {
    const { Service } = buildServer();

    @Api("/bad")
    class BadApi {
      @Get("/")
      get(@Query() q: string): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(BadApi).get("not-an-object");
    await expect(method.send()).rejects.toThrow(SnailDecoratorError);
  });
});

describe("request pipeline", () => {
  it("sends a GET request to the joined url and unwraps the envelope", async () => {
    const { Service, test } = buildServer({
      body: { code: 0, message: "ok", data: { id: 7 } }
    });

    @Api("/user")
    class UserApi {
      @Get("/:id")
      getUser(@Params("id") id: string): Promise<{ id: number }> {
        return null!;
      }
    }

    const result = await Service.createApi(UserApi).getUser("42").send();

    expect(test.requests).toHaveLength(1);
    expect(test.requests[0]!.method).toBe("GET");
    expect(test.requests[0]!.url).toBe("/user/42");
    expect(test.requests[0]!.baseURL).toBe("/api");
    expect(test.requests[0]!.timeout).toBe(1234);
    expect(result.data).toEqual({ id: 7 });
    expect(result.code).toBe(0);
    expect(result.message).toBe("ok");
    expect(result.fromCache).toBe(false);
  });

  it("substitutes every :placeholder and url-encodes the value", async () => {
    const { Service, test } = buildServer();

    @Api("/files")
    class FileApi {
      @Get("/:bucket/:name")
      get(@Params("bucket") bucket: string, @Params("name") name: string): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(FileApi).get("a b", "x/y").send();

    expect(test.requests[0]!.url).toBe("/files/a%20b/x%2Fy");
  });

  it("merges keyed and key-less query arguments", async () => {
    const { Service, test } = buildServer();

    @Api("/list")
    class ListApi {
      @Get("/")
      list(
        @Query() filters: { page: number; size: number },
        @Query("status") status: string
      ): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(ListApi).list({ page: 1, size: 20 }, "active").send();

    expect(test.requests[0]!.params).toMatchObject({ page: 1, size: 20, status: "active" });
  });

  it("builds a body from keyed @Data", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    class UserApi {
      @Post("/")
      create(@Data("name") name: string, @Data("age") age: number): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).create("ada", 36).send();

    // axios serialises an object body with its own JSON transform before the
    // adapter runs, so the recorded `data` is the encoded string.
    expect(JSON.parse(String(test.requests[0]!.data))).toEqual({ name: "ada", age: 36 });
  });

  it("spreads a key-less object @Data", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    class UserApi {
      @Post("/")
      create(@Data() payload: { name: string; age: number }): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(UserApi).create({ name: "ada", age: 36 }).send();

    expect(JSON.parse(String(test.requests[0]!.data))).toEqual({ name: "ada", age: 36 });
  });

  it("replaces the body when a key-less @Data argument is not a plain object", async () => {
    const { Service, test } = buildServer();
    const payload = new URLSearchParams({ a: "1" });

    @Api("/raw")
    class RawApi {
      @Post("/")
      post(@Data() body: URLSearchParams): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(RawApi).post(payload).send();

    expect(test.requests[0]!.data).toBe("a=1");
  });

  it("merges class-level and method-level @Header, method wins", async () => {
    const { Service, test } = buildServer();

    @Api("/h")
    @Header({ "x-client": "web", "x-shared": "class" })
    class HeaderApi {
      @Get("/")
      @Header({ "x-shared": "method" })
      get(): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(HeaderApi).get().send();

    const headers = test.requests[0]!.headers;
    expect(headers["x-client"]).toBe("web");
    expect(headers["x-shared"]).toBe("method");
  });

  it("injects a per-argument header through @HeaderValue", async () => {
    const { Service, test } = buildServer();

    @Api("/secure")
    class SecureApi {
      @Get("/me")
      me(@HeaderValue("authorization") token: string): Promise<void> {
        return null!;
      }
    }

    await Service.createApi(SecureApi).me("Bearer token-123").send();

    expect(test.requests[0]!.headers["authorization"]).toBe("Bearer token-123");
  });

  it("passes the argument values captured at proxy time, and lets send() override them", async () => {
    const { Service, test } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/:id")
      getUser(@Params("id") id: string): Promise<void> {
        return null!;
      }
    }

    const bound = Service.createApi(UserApi).getUser("from-proxy");
    await bound.send();
    expect(test.requests[0]!.url).toBe("/user/from-proxy");

    await bound.send("from-send");
    expect(test.requests[1]!.url).toBe("/user/from-send");
  });

  it("leaves non-decorated methods callable", async () => {
    const { Service } = buildServer();

    @Api("/mix")
    class MixApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
      helper(): string {
        return "plain";
      }
    }

    expect(Service.createApi(MixApi).helper()).toBe("plain");
  });

  it("raises a SnailDecoratorError when a placeholder has no value", async () => {
    const { Service } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/:id")
      getUser(): Promise<void> {
        return null!;
      }
    }

    await expect(Service.createApi(UserApi).getUser().send()).rejects.toThrow(
      SnailDecoratorError
    );
  });
});

describe("response handling", () => {
  it("rejects a business code outside the default accepted set", async () => {
    const { Service } = buildServer({ body: { code: 500, message: "boom", data: null } });

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    await expect(Service.createApi(XApi).get().send()).rejects.toBeInstanceOf(
      SnailResponseError
    );
  });

  it("honours a custom code key, message key, data key and validator", async () => {
    const test = createTestAdapter({ body: { status: 1, msg: "fine", result: { ok: true } } });

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

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<{ ok: boolean }> {
        return null!;
      }
    }

    const result = await Service.createApi(XApi).get().send();
    expect(result.data).toEqual({ ok: true });
    expect(result.code).toBe(1);
    expect(result.message).toBe("fine");
  });

  it("repairs a JSON body sent as a plain string", async () => {
    const { Service } = buildServer({
      body: JSON.stringify({ code: 0, message: "ok", data: { from: "string" } }),
      headers: { "content-type": "text/plain" }
    });

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<{ from: string }> {
        return null!;
      }
    }

    const result = await Service.createApi(XApi).get().send();
    expect(result.data).toEqual({ from: "string" });
  });

  it("emits success then finish", async () => {
    const { Service } = buildServer();
    const seen: string[] = [];

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(XApi).get();
    method.onSuccess(() => seen.push("success"));
    method.onFinish(() => seen.push("finish"));

    await method.send();
    expect(seen).toEqual(["success", "finish"]);
  });

  it("emits codeError then finish on a rejected business code", async () => {
    const { Service } = buildServer({ body: { code: 403, message: "nope", data: null } });
    const seen: string[] = [];

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(XApi).get();
    method.onCodeError((event) => seen.push(`code:${event.code}`));
    method.onFinish(() => seen.push("finish"));

    await expect(method.send()).rejects.toBeInstanceOf(SnailResponseError);
    expect(seen).toEqual(["code:403", "finish"]);
  });

  it("turns a response-less axios failure into a typed SnailHttpError", async () => {
    // A genuine axios network failure: `isAxiosError` with no `response`. Axios'
    // error carries nothing the caller can act on here, so it is replaced.
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    const { Service } = buildServer({ error: networkError });

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    await expect(Service.createApi(XApi).get().send()).rejects.toBeInstanceOf(SnailHttpError);
  });

  it("leaves an HTTP-status axios failure untouched so response stays reachable", async () => {
    const axiosError = new AxiosError("Request failed with status code 500", "ERR_BAD_RESPONSE");
    axiosError.response = {
      status: 500,
      statusText: "Server Error",
      data: { code: 500 },
      headers: {},
      config: {} as never
    };
    const { Service } = buildServer({ error: axiosError });

    @Api("/x")
    class XApi {
      @Get("/")
      get(): Promise<void> {
        return null!;
      }
    }

    // Applications and the auth strategies branch on `error.response.status`, so
    // axios' rich error must survive whenever the server actually answered.
    await expect(Service.createApi(XApi).get().send()).rejects.toBe(axiosError);
  });

  it("translates an aborted request into a SnailCancelledError", async () => {
    const { Service } = buildServer({ delayMs: 60 });

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
  });
});

describe("method introspection", () => {
  it("exposes name, verb, route and the live request config", async () => {
    const { Service } = buildServer();

    @Api("/user")
    class UserApi {
      @Get("/:id")
      getUser(@Params("id") id: string): Promise<void> {
        return null!;
      }
    }

    const method = Service.createApi(UserApi).getUser("9");
    // The server name defaults to the decorated class name.
    expect(method.name).toBe("TestServer.UserApi.getUser");
    expect(method.methodType).toBe("GET");
    expect(method.route).toBe("/user/:id");
    expect(method.args).toEqual(["9"]);

    await method.send();
    expect(method.request.url).toBe("/user/9");
    expect(method.result?.data).toBeNull();
  });

  it("describes the resolved server options", () => {
    const { Service } = buildServer();
    expect(Service.describe()).toMatchObject({
      baseURL: "/api",
      timeout: 1234,
      dataKey: "data"
    });
  });
});

describe("metadata store", () => {
  it("walks the class prototype chain", () => {
    const key = Symbol.for("test-key");
    class Base {}
    defineMetadata(key, "base", Base);
    class Derived extends Base {}

    expect(getMetadata(key, Derived)).toBe("base");
  });

  it("reads metadata written through the prototype a decorator receives", () => {
    const key = Symbol.for("proto-key");
    class Sample {
      method(): void {}
    }
    defineMetadata(key, "value", Sample.prototype, "method");

    expect(getMetadata(key, Sample, "method")).toBe("value");
    expect(getMetadata(key, Sample)).toBeUndefined();
  });
});
