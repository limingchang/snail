import { describe, expect, it } from "vitest";
import { Api, Get, Params } from "../../src/index";
import { useFetcher } from "../../src/strategies";
import { buildServer, delay } from "./support";

/** `useFetcher` — background work with no visible state. */

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<{ id: string }> {
    return null!;
  }

  @Get("/")
  list(): Promise<string[]> {
    return null!;
  }
}

describe("useFetcher", () => {
  it("resolves the payload and exposes no state handles by default", async () => {
    const { Service, test } = buildServer({ body: { code: 0, message: "ok", data: { id: "5" } } });
    const fetcher = useFetcher(Service.createApi(UserApi).getUser);

    const payload = await fetcher.fetch("5");

    expect(payload).toEqual({ id: "5" });
    expect(test.requests).toHaveLength(1);
    // Nothing to observe means nothing was written: the silent fetcher has no
    // loading/data/error handles at all.
    expect(Object.keys(fetcher).sort()).toEqual([
      "abort",
      "fetch",
      "onError",
      "onFinish",
      "onSuccess"
    ]);
  });

  it("mirrors state when withState is true", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "6" } } });
    const fetcher = useFetcher(Service.createApi(UserApi).getUser, { withState: true });

    expect(fetcher.loading.value).toBe(false);
    const sending = fetcher.fetch("6");
    expect(fetcher.loading.value).toBe(true);

    await sending;
    expect(fetcher.loading.value).toBe(false);
    expect(fetcher.data.value).toEqual({ id: "6" });
    expect(fetcher.code.value).toBe(0);
    expect(fetcher.bind().data).toEqual({ id: "6" });
  });

  it("reports failure only when state was requested", async () => {
    const { Service } = buildServer({ error: new Error("nope") });
    const api = Service.createApi(UserApi);

    const silent = useFetcher(api.getUser);
    await expect(silent.fetch("1")).rejects.toThrow("nope");

    const tracked = useFetcher(api.getUser, { withState: true });
    await expect(tracked.fetch("1")).rejects.toThrow("nope");
    expect(tracked.error.value).toBeInstanceOf(Error);
    expect(tracked.loading.value).toBe(false);
  });

  it("fires the lifecycle callbacks without any state", async () => {
    const { Service } = buildServer({ body: { code: 0, message: "ok", data: { id: "1" } } });
    const seen: string[] = [];

    const fetcher = useFetcher(Service.createApi(UserApi).getUser, {
      onSuccess: () => seen.push("success"),
      onFinish: () => seen.push("finish")
    });
    fetcher.onError(() => seen.push("error"));

    await fetcher.fetch("1");
    expect(seen).toEqual(["success", "finish"]);
  });

  it("fetches once on creation with immediate: true", async () => {
    const { Service, test } = buildServer({ body: { code: 0, message: "ok", data: [] } });
    useFetcher(Service.createApi(UserApi).list, { immediate: true });

    await delay(5);
    expect(test.requests).toHaveLength(1);
  });

  it("aborts an in-flight fetch", async () => {
    const { Service } = buildServer({ delayMs: 30 });
    const fetcher = useFetcher(Service.createApi(UserApi).getUser, { withState: true });

    const sending = fetcher.fetch("1");
    fetcher.abort();

    await expect(sending).rejects.toBeInstanceOf(Error);
    expect(fetcher.error.value).toBeUndefined();
  });
});
