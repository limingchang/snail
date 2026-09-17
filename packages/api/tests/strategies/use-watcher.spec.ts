import { afterEach, describe, expect, it, vi } from "vitest";
import { Api, Get } from "../../src/index";
import { useWatcher } from "../../src/strategies/plain";
import { buildServer } from "./support";

/**
 * `useWatcher` — re-send on change.
 *
 * Two behaviours matter and are easy to get wrong: an unchanged snapshot must not
 * produce a request, and a burst must collapse into one request whose promise every
 * caller can await.
 */

@Api("/search")
class SearchApi {
  @Get("/")
  find(): Promise<{ hits: number }> {
    return null!;
  }
}

const OK = { body: { code: 0, message: "ok", data: { hits: 1 } } };

afterEach(() => {
  vi.useRealTimers();
});

describe("useWatcher", () => {
  it("sends once, then only when a watched value changes", async () => {
    const { Service, test } = buildServer(OK);
    let keyword = "a";

    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => [keyword]
    });

    await watcher.send();
    await watcher.send();
    expect(test.requests).toHaveLength(1);

    keyword = "b";
    await watcher.send();
    expect(test.requests).toHaveLength(2);
  });

  it("unwraps state handles returned by the watcher", async () => {
    const { Service, test } = buildServer(OK);
    const page = { value: 1 };

    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => [page]
    });

    await watcher.send();
    await watcher.send();
    expect(test.requests).toHaveLength(1);

    page.value = 2;
    await watcher.send();
    expect(test.requests).toHaveLength(2);
  });

  it("sends unconditionally when watching is switched off", async () => {
    const { Service, test } = buildServer(OK);
    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => ["stable"]
    });

    await watcher.send();
    watcher.watching.value = false;
    await watcher.send();

    expect(test.requests).toHaveLength(2);
  });

  it("collapses a burst into one request with debounce", async () => {
    vi.useFakeTimers();
    const { Service, test } = buildServer(OK);
    let keyword = "a";

    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => [keyword],
      debounce: 50
    });

    const first = watcher.send();
    keyword = "b";
    const second = watcher.send();
    keyword = "c";
    const third = watcher.send();

    await vi.advanceTimersByTimeAsync(60);
    const payloads = await Promise.all([first, second, third]);

    expect(test.requests).toHaveLength(1);
    expect(payloads).toEqual([{ hits: 1 }, { hits: 1 }, { hits: 1 }]);
  });

  it("runs on the leading edge and once more for a change inside the window", async () => {
    vi.useFakeTimers();
    const { Service, test } = buildServer(OK);
    let keyword = "a";

    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => [keyword],
      throttle: 50
    });

    const first = watcher.send();
    keyword = "b";
    const second = watcher.send();

    await vi.advanceTimersByTimeAsync(80);
    await Promise.all([first, second]);

    expect(test.requests).toHaveLength(2);
  });

  it("surfaces a throwing watcher as state error instead of crashing", async () => {
    const { Service, test } = buildServer(OK);
    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => {
        throw new Error("bad watcher");
      }
    });

    await expect(watcher.send()).rejects.toThrow("bad watcher");
    expect(watcher.error.value).toBeInstanceOf(Error);
    expect(test.requests).toHaveLength(0);
  });

  it("sends once on creation with immediate: true", async () => {
    const { Service, test } = buildServer(OK);
    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => ["a"],
      immediate: true
    });

    await vi.waitFor(() => {
      expect(test.requests).toHaveLength(1);
    });
    expect(watcher.data.value).toEqual({ hits: 1 });
  });

  it("settles queued callers when a scheduled send is aborted", async () => {
    vi.useFakeTimers();
    const { Service } = buildServer(OK);
    const watcher = useWatcher(Service.createApi(SearchApi).find, {
      watching: () => ["a"],
      debounce: 50
    });

    const sending = watcher.send();
    watcher.abort();

    await expect(sending).rejects.toThrow();
    expect(watcher.loading.value).toBe(false);
  });
});
