import { describe, expect, it } from "vitest";
import { Api, Get, Params, SnailCancelledError } from "../../src/index";
import { useRetriableRequest } from "../../src/strategies";
import { buildServer, delay } from "./support";

/**
 * `useRetriableRequest`.
 *
 * Retry logic fails in two directions: retrying something it must not (a
 * cancellation), and giving up before it should (a transient 500). Both are pinned
 * here, along with the cancellable backoff, which is the part that is easy to leave
 * hanging for 30 seconds.
 */

@Api("/job")
class JobApi {
  @Get("/:id")
  run(@Params("id") id: string): Promise<{ ok: boolean }> {
    return null!;
  }

  @Get("/")
  ping(): Promise<{ ok: boolean }> {
    return null!;
  }
}

const OK = { body: { code: 0, message: "ok", data: { ok: true } } };

describe("useRetriableRequest", () => {
  it("retries the configured number of times and reports the failure", async () => {
    const { Service, test } = buildServer({ error: new Error("boom") });
    const request = useRetriableRequest(Service.createApi(JobApi).run, {
      retries: 2,
      delayMs: 1,
      jitter: false
    });

    await expect(request.send("1")).rejects.toThrow("boom");

    expect(test.requests).toHaveLength(3);
    expect(request.attempts.value).toBe(3);
    expect(request.error.value).toBeInstanceOf(Error);
    expect(request.loading.value).toBe(false);
  });

  it("sends exactly once when retries is 0", async () => {
    const { Service, test } = buildServer({ error: new Error("boom") });
    const request = useRetriableRequest(Service.createApi(JobApi).run, {
      retries: 0,
      delayMs: 1
    });

    await expect(request.send("1")).rejects.toThrow("boom");
    expect(test.requests).toHaveLength(1);
    expect(request.attempts.value).toBe(1);
  });

  it("stops immediately when retryOn returns false", async () => {
    const { Service, test } = buildServer({ error: new Error("boom") });
    const request = useRetriableRequest(Service.createApi(JobApi).run, {
      retries: 5,
      delayMs: 1,
      retryOn: () => false
    });

    await expect(request.send("1")).rejects.toThrow("boom");
    expect(test.requests).toHaveLength(1);
  });

  it("clears the error after a successful retry", async () => {
    let calls = 0;
    const { Service, test } = buildServer(() => {
      calls += 1;
      return calls < 2 ? { error: new Error("flaky") } : OK;
    });

    const request = useRetriableRequest(Service.createApi(JobApi).run, {
      retries: 3,
      delayMs: 1,
      jitter: false
    });

    const payload = await request.send("1");

    expect(payload).toEqual({ ok: true });
    expect(test.requests).toHaveLength(2);
    expect(request.attempts.value).toBe(2);
    expect(request.error.value).toBeUndefined();
    expect(request.data.value).toEqual({ ok: true });
  });

  it("never retries a cancellation", async () => {
    const { Service, test } = buildServer({ delayMs: 25 });
    const request = useRetriableRequest(Service.createApi(JobApi).run, {
      retries: 3,
      delayMs: 1
    });

    const sending = request.send("1");
    // Let the request actually reach the adapter before cancelling it: aborting
    // first would simply prevent the dispatch, which proves nothing about retries.
    await delay(1);
    request.abort();

    await expect(sending).rejects.toBeInstanceOf(SnailCancelledError);
    expect(test.requests).toHaveLength(1);
  });

  it("aborts during a backoff instead of waiting it out", async () => {
    const { Service, test } = buildServer({ error: new Error("boom") });
    const request = useRetriableRequest(Service.createApi(JobApi).run, {
      retries: 5,
      delayMs: 5000,
      jitter: false
    });

    const sending = request.send("1");
    // Let the first attempt fail and the loop enter its (very long) sleep.
    await delay(5);
    expect(test.requests).toHaveLength(1);

    const startedAt = Date.now();
    request.abort();

    await expect(sending).rejects.toBeInstanceOf(SnailCancelledError);
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(request.loading.value).toBe(false);
  });

  it("backs off exponentially with a cap", async () => {
    const { Service, test } = buildServer({ error: new Error("boom") });
    const request = useRetriableRequest(Service.createApi(JobApi).ping, {
      retries: 2,
      delayMs: 2,
      factor: 2,
      maxDelayMs: 3,
      jitter: false
    });

    const startedAt = Date.now();
    await expect(request.send()).rejects.toThrow("boom");

    // 2ms + 3ms (capped) at minimum, not 2 + 4.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4);
    expect(test.requests).toHaveLength(3);
  });
});
