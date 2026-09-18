import type { SnailStateRef, SnailStrategyCommonOptions } from "../typings/adapter";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/**
 * The request descriptor a paginated method receives as its single argument.
 *
 * ```ts
 * @Get("/users")
 * list(@Query() query: PageRequest): Promise<Page<User>> { return null!; }
 * ```
 *
 * The hook owns paging, so it — not the caller — supplies these two values. A
 * method that declares extra query fields (`PageRequest & { keyword: string }`)
 * still matches, because the hook's argument is assignable to the wider shape.
 */
export interface PageRequest {
  /** 1-based page number. */
  page: number;
  /** Items per page. */
  pageSize: number;
}

/** Options accepted by {@link usePagination}. */
export interface UsePaginationOptions<TData> extends SnailStrategyCommonOptions {
  /** Page the hook starts on. Defaults to `1`. */
  initialPage?: number;

  /** Items per page the hook starts with. Defaults to `10`. */
  initialPageSize?: number;

  /**
   * Read the total row count out of the payload.
   *
   * Defaults to `payload.total ?? payload.count ?? payload.length` — the three
   * shapes backends actually return. Without a trustworthy total the hook falls
   * back to "a short page is the last page", which cannot detect the final page
   * when it happens to be exactly full.
   */
  total?: (payload: TData) => number;

  /**
   * Read the page's rows out of the payload.
   *
   * Defaults to the payload itself when it is an array, otherwise
   * `payload.list ?? payload.items`.
   */
  list?: (payload: TData) => unknown[];

  /**
   * Append each page to `list` instead of replacing it.
   *
   * This is the infinite-scroll mode. It is off by default because the *replacing*
   * behaviour is what a table with page controls needs, and appending silently
   * grows the array forever.
   */
  append?: boolean;

  /**
   * Fetch the next page in the background and serve it instantly on `next()`.
   *
   * Costs one extra request per page, so it is off by default; useful for a
   * "next" button a user is likely to press. A preload never touches
   * `loading`/`data`: it is speculative work and must not flash a spinner.
   */
  preloadNext?: boolean;
}

/** What {@link usePagination} returns. */
export interface UsePaginationResult<TData> extends StrategyState<TData> {
  /** Current page, 1-based. */
  readonly page: SnailStateRef<number>;

  /** Items per page. */
  readonly pageSize: SnailStateRef<number>;

  /** Total row count, as read by the `total` extractor. */
  readonly total: SnailStateRef<number>;

  /** Rows, accumulated or replaced according to `append`. */
  readonly list: SnailStateRef<unknown[]>;

  /** `true` once the last page has been loaded. */
  readonly isLastPage: SnailStateRef<boolean>;

  /** Load the next page. A no-op at the last page. */
  next(): Promise<TData | undefined>;

  /** Load the previous page. A no-op at the first page. */
  prev(): Promise<TData | undefined>;

  /** Jump to a page, clamped into range. A no-op on the current page. */
  goTo(page: number): Promise<TData | undefined>;

  /** Go back to the first page and re-fetch it. */
  reload(): Promise<TData | undefined>;

  /** Change the page size, reset to page 1 and re-fetch. */
  changePageSize(pageSize: number): Promise<TData | undefined>;
}

/** Default row extractor — array payloads, then the two common wrapper keys. */
function defaultList<TData>(payload: TData): unknown[] {
  if (Array.isArray(payload)) return payload;
  const candidate = payload as { list?: unknown; items?: unknown } | null | undefined;
  if (Array.isArray(candidate?.list)) return candidate.list;
  if (Array.isArray(candidate?.items)) return candidate.items;
  return [];
}

/** Default total extractor — `total`, then `count`, then the current page size. */
function defaultTotal<TData>(payload: TData): number {
  if (Array.isArray(payload)) return payload.length;
  const candidate = payload as { total?: unknown; count?: unknown } | null | undefined;
  if (typeof candidate?.total === "number") return candidate.total;
  if (typeof candidate?.count === "number") return candidate.count;
  return defaultList(payload).length;
}

/**
 * Page through one api method.
 *
 * ```ts
 * const users = usePagination(userApi.list, {
 *   total: (payload) => payload.total,
 *   list: (payload) => payload.rows
 * });
 * await users.reload();
 * await users.next();
 * ```
 *
 * `next()`/`prev()` are **no-ops at the bounds and fire no request**: a user
 * holding down the "next" button at the last page must not hammer the server, and
 * the promise still resolves (with `undefined`) so an `await` never hangs.
 */
export function usePagination<TData>(
  method: StrategyMethod<[PageRequest], TData>,
  options: UsePaginationOptions<TData> = {}
): UsePaginationResult<TData> {
  const initialPage = Number.isFinite(options.initialPage)
    ? Math.max(1, Math.floor(options.initialPage as number))
    : 1;
  const initialPageSize = Number.isFinite(options.initialPageSize)
    ? Math.max(1, Math.floor(options.initialPageSize as number))
    : 10;
  const append = options.append === true;
  const extractList = options.list ?? defaultList;
  const extractTotal = options.total ?? defaultTotal;

  /** The preloaded page, ready to be served without a request. */
  let buffered: { page: number; payload: TData } | undefined;
  let preloading = false;

  const holder = createMethodHolder<[PageRequest], TData>(method);

  const controller = createStrategyState<TData>({
    adapter: options.adapter,
    method,

    onAbort: () => holder.abort()
  });

  const { state } = controller;
  const adapter = controller.adapter;
  const page = adapter.create<number>(initialPage);
  const pageSize = adapter.create<number>(initialPageSize);
  const total = adapter.create<number>(0);
  const list = adapter.create<unknown[]>([]);
  const isLastPage = adapter.create<boolean>(false);

  if (options.onSuccess) state.onSuccess(options.onSuccess);
  if (options.onError) state.onError(options.onError);
  if (options.onFinish) state.onFinish(options.onFinish);

  /** Last page reachable, or `Infinity` while the total is still unknown. */
  function lastPage(): number {
    const size = Math.max(1, adapter.read(pageSize));
    const known = adapter.read(total);
    if (known > 0) return Math.max(1, Math.ceil(known / size));
    return adapter.read(isLastPage) ? adapter.read(page) : Number.POSITIVE_INFINITY;
  }

  /** Write the paging derived from one payload. */
  function applyPage(payload: TData, target: number, size: number, accumulate: boolean): void {
    const rows = extractList(payload);
    const known = extractTotal(payload);

    adapter.write(page, target);
    adapter.write(total, known);
    adapter.write(list, accumulate ? [...adapter.read(list), ...rows] : rows);
    // A short page means the end even when the backend reports no total; a full
    // page with no total is "maybe more", never a false "this is the last page".
    adapter.write(
      isLastPage,
      known > 0 ? target * size >= known : rows.length < size
    );
  }

  async function request(
    target: number,
    size: number,
    accumulate: boolean
  ): Promise<TData | undefined> {
    const snail = holder.resolve([{ page: target, pageSize: size }]);

    controller.resetForSend();
    controller.setLoading(true);

    try {
      const result = await snail.send({ page: target, pageSize: size });
      const payload = controller.applySuccess(result);
      applyPage(payload, target, size, accumulate);
      controller.emitSuccess(payload);
      if (options.preloadNext) void startPreload(target + 1);
      return payload;
    } catch (error) {
      if (!isCancellation(error)) {
        controller.applyFailure(error);
        controller.emitError(error);
      }
      throw error;
    } finally {
      controller.setLoading(false);
      controller.emitFinish();
    }
  }

  /**
   * Warm the buffer with `target`, using a throwaway `SnailMethod`.
   *
   * A second instance is what keeps the preload invisible: it has its own context,
   * so its `loading`/`data` never reach the caller's handles. A failed preload is
   * swallowed on purpose — `next()` simply falls back to a real request.
   */
  async function startPreload(target: number): Promise<void> {
    if (preloading) return;
    if (target > lastPage()) return;

    preloading = true;
    try {
      const size = Math.max(1, adapter.read(pageSize));
      const result = await method({ page: target, pageSize: size }).send({
        page: target,
        pageSize: size
      });
      buffered = { page: target, payload: result.data };
    } catch {
      buffered = undefined;
    } finally {
      preloading = false;
    }
  }

  function clamp(target: number): number {
    const bound = lastPage();
    const value = Number.isFinite(target) ? Math.floor(target) : 1;
    return Math.min(Math.max(1, value), bound);
  }

  async function next(): Promise<TData | undefined> {
    const current = adapter.read(page);
    if (current >= lastPage()) return undefined;

    const target = current + 1;
    const size = Math.max(1, adapter.read(pageSize));

    // A buffered page is served without any request — that is the whole point of
    // `preloadNext`.
    if (buffered && buffered.page === target) {
      const ready = buffered;
      buffered = undefined;
      applyPage(ready.payload, target, size, append);
      if (options.preloadNext) void startPreload(target + 1);
      return ready.payload;
    }

    return request(target, size, append);
  }

  async function prev(): Promise<TData | undefined> {
    const current = adapter.read(page);
    if (current <= 1) return undefined;
    return request(current - 1, Math.max(1, adapter.read(pageSize)), append);
  }

  async function goTo(target: number): Promise<TData | undefined> {
    const resolved = clamp(target);
    if (resolved === adapter.read(page)) return undefined;
    // A jump replaces the list even in append mode: concatenating page 7 after
    // page 3 would interleave two unrelated ranges.
    return request(resolved, Math.max(1, adapter.read(pageSize)), false);
  }

  async function reload(): Promise<TData | undefined> {
    const size = Math.max(1, adapter.read(pageSize));
    adapter.write(list, []);
    adapter.write(isLastPage, false);
    buffered = undefined;
    return request(initialPage, size, append);
  }

  async function changePageSize(size: number): Promise<TData | undefined> {
    if (!Number.isFinite(size) || size < 1) return undefined;
    const resolved = Math.max(1, Math.floor(size));
    adapter.write(pageSize, resolved);
    adapter.write(list, []);
    adapter.write(isLastPage, false);
    buffered = undefined;
    return request(initialPage, resolved, false);
  }

  return { ...state, page, pageSize, total, list, isLastPage, next, prev, goTo, reload, changePageSize };
}
