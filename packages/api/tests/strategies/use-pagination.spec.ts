import { describe, expect, it } from "vitest";
import { Api, Get, Query } from "../../src/index";
import { usePagination } from "../../src/strategies/plain";
import type { RecordedRequest, TestReply } from "../helpers/test-adapter";
import { buildServer, delay, until } from "./support";

/**
 * `usePagination`.
 *
 * The interesting parts are the bounds (a "next" at the last page must not hit the
 * network), the two accumulator modes, and the preload buffer, which has to serve a
 * page without any request at all.
 */

const TOTAL = 25;

interface PagePayload {
  rows: number[];
  total: number;
}

/** Rows `1..25`, ten per page, answering from the query params it receives. */
function pageReply(request: RecordedRequest): TestReply {
  const params = (request.params ?? {}) as { page?: number; pageSize?: number };
  const page = Number(params.page ?? 1);
  const size = Number(params.pageSize ?? 10);
  const start = (page - 1) * size;
  const count = Math.max(0, Math.min(size, TOTAL - start));
  const rows = Array.from({ length: count }, (_, index) => start + index + 1);
  return { body: { code: 0, message: "ok", data: { rows, total: TOTAL } } };
}

@Api("/list")
class ListApi {
  @Get("/")
  list(@Query() query: { page: number; pageSize: number }): Promise<PagePayload> {
    return null!;
  }
}

@Api("/plain")
class PlainListApi {
  @Get("/")
  list(@Query() query: { page: number; pageSize: number }): Promise<number[]> {
    return null!;
  }
}

/** Shared extractors: the payload wrapper is `{ rows, total }`. */
const extractors = {
  total: (payload: PagePayload) => payload.total,
  list: (payload: PagePayload) => payload.rows
};

describe("usePagination", () => {
  it("loads the first page and derives total and isLastPage", async () => {
    const { Service, test } = buildServer(pageReply);
    const pagination = usePagination(Service.createApi(ListApi).list, {
      ...extractors,
      initialPageSize: 10
    });

    const payload = await pagination.reload();

    expect(payload?.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pagination.page.value).toBe(1);
    expect(pagination.pageSize.value).toBe(10);
    expect(pagination.total.value).toBe(25);
    expect(pagination.list.value).toHaveLength(10);
    expect(pagination.isLastPage.value).toBe(false);
    expect(test.requests[0]!.params).toMatchObject({ page: 1, pageSize: 10 });
  });

  it("replaces the list by default and accumulates with append", async () => {
    const replace = usePagination(buildServer(pageReply).Service.createApi(ListApi).list, extractors);
    await replace.reload();
    await replace.next();
    expect(replace.page.value).toBe(2);
    expect(replace.list.value).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

    const accumulate = usePagination(buildServer(pageReply).Service.createApi(ListApi).list, {
      ...extractors,
      append: true
    });
    await accumulate.reload();
    await accumulate.next();
    expect(accumulate.list.value).toHaveLength(20);
    expect(accumulate.list.value[0]).toBe(1);
    expect(accumulate.list.value[19]).toBe(20);
  });

  it("clamps next and prev at the bounds without firing a request", async () => {
    const { Service, test } = buildServer(pageReply);
    const pagination = usePagination(Service.createApi(ListApi).list, extractors);

    // The bounds are only known once a total has been observed, so page one has to
    // be loaded before `goTo` can clamp.
    await pagination.reload();
    await pagination.goTo(99);
    expect(pagination.page.value).toBe(3);
    expect(pagination.isLastPage.value).toBe(true);

    const before = test.requests.length;
    expect(await pagination.next()).toBeUndefined();
    expect(test.requests).toHaveLength(before);

    await pagination.goTo(1);
    const afterFirst = test.requests.length;
    expect(await pagination.prev()).toBeUndefined();
    expect(test.requests).toHaveLength(afterFirst);

    // A goTo on the current page is also a no-op.
    expect(await pagination.goTo(1)).toBeUndefined();
    expect(test.requests).toHaveLength(afterFirst);
  });

  it("resets to page 1 and re-fetches on reload", async () => {
    const { Service, test } = buildServer(pageReply);
    const pagination = usePagination(Service.createApi(ListApi).list, extractors);

    await pagination.reload();
    await pagination.next();
    await pagination.next();
    expect(pagination.page.value).toBe(3);

    await pagination.reload();
    expect(pagination.page.value).toBe(1);
    expect(pagination.list.value).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(test.requests.at(-1)!.params).toMatchObject({ page: 1, pageSize: 10 });
  });

  it("changes the page size and restarts at page 1", async () => {
    const { Service, test } = buildServer(pageReply);
    const pagination = usePagination(Service.createApi(ListApi).list, extractors);

    await pagination.reload();
    await pagination.changePageSize(5);

    expect(pagination.pageSize.value).toBe(5);
    expect(pagination.page.value).toBe(1);
    expect(pagination.list.value).toEqual([1, 2, 3, 4, 5]);
    expect(test.requests.at(-1)!.params).toMatchObject({ page: 1, pageSize: 5 });

    // A nonsense page size is ignored rather than sent.
    const before = test.requests.length;
    expect(await pagination.changePageSize(0)).toBeUndefined();
    expect(test.requests).toHaveLength(before);
  });

  it("serves a preloaded page without a request", async () => {
    const { Service, test } = buildServer(pageReply);
    const pagination = usePagination(Service.createApi(ListApi).list, {
      ...extractors,
      preloadNext: true
    });

    await pagination.reload();
    // Page 1 plus the speculative page 2. The adapter records the request before it
    // answers, so give the preload a moment to buffer its payload too.
    await until(() => test.requests.length >= 2);
    await delay(5);

    const payload = await pagination.next();

    expect(payload?.rows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(pagination.page.value).toBe(2);
    expect(pagination.list.value).toHaveLength(10);

    // Exactly one page-2 request exists: the preload. `next()` reused the buffer.
    const pageTwo = test.requests.filter(
      (entry) => (entry.params as { page?: number } | undefined)?.page === 2
    );
    expect(pageTwo).toHaveLength(1);
  });

  it("falls back to the default extractors for an array payload", async () => {
    const { Service } = buildServer({
      body: { code: 0, message: "ok", data: [1, 2, 3] }
    });
    const pagination = usePagination(Service.createApi(PlainListApi).list, {
      initialPageSize: 10
    });

    await pagination.reload();

    expect(pagination.list.value).toEqual([1, 2, 3]);
    expect(pagination.total.value).toBe(3);
    // A short page means the end even when the backend reports no total.
    expect(pagination.isLastPage.value).toBe(true);
    expect(await pagination.next()).toBeUndefined();
  });

  it("records the failure and keeps loading false", async () => {
    const { Service } = buildServer({ body: { code: 500, message: "boom", data: null } });
    const pagination = usePagination(Service.createApi(ListApi).list, extractors);

    await expect(pagination.reload()).rejects.toThrow();
    expect(pagination.loading.value).toBe(false);
    expect(pagination.error.value).toBeInstanceOf(Error);
    expect(pagination.list.value).toEqual([]);
  });
});
