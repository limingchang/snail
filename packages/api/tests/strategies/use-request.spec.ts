import { describe, expect, it } from "vitest";
import { Api, createPlugin, Get, Params, Post, SnailCancelledError } from "../../src/index";
import { useRequest } from "../../src/strategies";
import { buildServer, delay } from "./support";

/**
 * `useRequest` — the base of every other request strategy.
 *
 * The suite pins the contract other hooks inherit: loading edges, the unwrapped
 * payload, error clearing, `immediate`, cancellation-is-not-a-failure, `bind()`
 * and `update()`.
 */

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<{ id: string }> {
    return null!;
  }

  @Get("/")
  list(): Promise<{ id: string }[]> {
    return null!;
  }

  @Post("/")
  create(): Promise<{ created: boolean }> {
    return null!;
  }
}

describe("useRequest", () => {
  it("drives loading false → true → false and stores the payload", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "7" } } });
    const request = useRequest(Service.createApi(UserApi).getUser);

    expect(request.loading.value).toBe(false);

    const sending = request.send("7");
    expect(request.loading.value).toBe(true);

    const payload = await sending;
    expect(payload).toEqual({ id: "7" });
    expect(request.loading.value).toBe(false);
    expect(request.data.value).toEqual({ id: "7" });
    expect(request.error.value).toBeUndefined();
    expect(request.code.value).toBe(0);
    expect(request.message.value).toBe("ok");
  });

  it("sets error on failure and clears it on the next send", async () => {
    let calls = 0;
    const { Service, test } = buildServer(() => {
      calls += 1;
      return calls === 1
        ? { error: new Error("network down") }
        : { body: { code: 0, message: "ok", data: { id: "1" } } };
    });

    const request = useRequest(Service.createApi(UserApi).getUser);

    await expect(request.send("1")).rejects.toThrow("network down");
    expect(request.error.value).toBeInstanceOf(Error);
    expect(request.loading.value).toBe(false);

    await request.send("1");
    expect(request.error.value).toBeUndefined();
    expect(request.data.value).toEqual({ id: "1" });
    expect(test.requests).toHaveLength(2);
  });

  it("rejects on a business code failure", async () => {
    const { Service } = buildServer({ body: { code: 403, message: "nope", data: null } });
    const request = useRequest(Service.createApi(UserApi).getUser);

    await expect(request.send("1")).rejects.toThrow();
    expect(request.code.value).toBe(403);
    expect(request.message.value).toBe("nope");
  });

  it("sends once on creation with immediate: true", async () => {
    const { Service, test } = buildServer({ body: { code: 0, message: "ok", data: [] } });
    const request = useRequest(Service.createApi(UserApi).list, { immediate: true });

    await delay(5);
    expect(test.requests).toHaveLength(1);
    expect(request.data.value).toEqual([]);
  });

  it("surfaces an immediate failure through state instead of an unhandled rejection", async () => {
    const { Service } = buildServer({ error: new Error("boom") });
    const request = useRequest(Service.createApi(UserApi).list, { immediate: true });

    await delay(5);
    expect(request.error.value).toBeInstanceOf(Error);
    expect(request.loading.value).toBe(false);
  });

  it("rejects with SnailCancelledError on abort and does not report an error", async () => {
    const { Service } = buildServer({ delayMs: 40 });
    const request = useRequest(Service.createApi(UserApi).getUser);

    let failures = 0;
    request.onError(() => {
      failures += 1;
    });

    const sending = request.send("1");
    request.abort();

    await expect(sending).rejects.toBeInstanceOf(SnailCancelledError);
    expect(request.error.value).toBeUndefined();
    expect(request.loading.value).toBe(false);
    expect(failures).toBe(0);
  });

  it("returns resolved values from bind()", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "9" } } });
    const request = useRequest(Service.createApi(UserApi).getUser);

    await request.send("9");

    expect(request.bind()).toEqual({
      loading: false,
      data: { id: "9" },
      error: undefined,
      code: 0,
      message: "ok"
    });
  });

  it("patches state through update(), including undefined values", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "1" } } });
    const request = useRequest(Service.createApi(UserApi).getUser);

    request.update({ data: { id: "optimistic" }, loading: true, message: "saving" });
    expect(request.data.value).toEqual({ id: "optimistic" });
    expect(request.loading.value).toBe(true);
    expect(request.message.value).toBe("saving");

    request.update({ loading: false, data: undefined });
    expect(request.loading.value).toBe(false);
    expect(request.data.value).toBeUndefined();
  });

  it("starts data at initialData and resets it when resetOnSend is on", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "1" } } });
    const request = useRequest(Service.createApi(UserApi).getUser, {
      initialData: { id: "seed" },
      resetOnSend: true
    });

    expect(request.data.value).toEqual({ id: "seed" });
    await request.send("1");
    expect(request.data.value).toEqual({ id: "1" });

    const sending = request.send("1");
    expect(request.data.value).toEqual({ id: "seed" });
    await sending;
  });

  it("reuses one SnailMethod across sends", async () => {
    const { Service, test } = buildServer({ body: { code: 0, message: "ok", data: { id: "1" } } });
    let constructed = 0;

    const Counter = createPlugin({
      name: "method-counter",
      setup() {
        return {
          configureMethod() {
            constructed += 1;
          }
        };
      }
    });

    Service.use(Counter());

    const request = useRequest(Service.createApi(UserApi).getUser);
    await request.send("1");
    await request.send("2");

    expect(test.requests.map((entry) => entry.url)).toEqual(["/user/1", "/user/2"]);
    expect(constructed).toBe(1);
  });

  it("calls the common option callbacks", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "1" } } });
    const events: string[] = [];

    const request = useRequest(Service.createApi(UserApi).getUser, {
      onSuccess: () => events.push("success"),
      onError: () => events.push("error"),
      onFinish: () => events.push("finish")
    });

    await request.send("1");
    expect(events).toEqual(["success", "finish"]);

    const unsubscribe = request.onSuccess(() => events.push("late"));
    unsubscribe();
    await request.send("1");
    expect(events).toEqual(["success", "finish", "success", "finish"]);
  });
});
