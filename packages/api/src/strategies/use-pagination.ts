import type { SnailStateRef, SnailStrategyCommonOptions } from "../typings/adapter";
import { isCancellation } from "./shared/error";
import { createMethodHolder } from "./shared/method";
import type { StrategyMethod } from "./shared/method";
import { createStrategyState } from "./shared/state";
import type { StrategyState } from "./shared/state";

/**
 * 分页方法作为唯一参数接收的请求描述符。
 *
 * 分页由 hook 负责，因此这两个值由 hook——而不是调用方——提供。声明了额外查询字段的方法
 * （`PageRequest & { keyword: string }`）依然匹配，因为 hook 的参数可赋值给更宽的形状。
 *
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
  /**
   * 页码，1 起。
   *
   * 1-based page number.
   */
  page: number;
  /**
   * 每页条数。
   *
   * Items per page.
   */
  pageSize: number;
}

/**
 * {@link usePagination} 接受的选项。
 *
 * Options accepted by {@link usePagination}.
 */
export interface UsePaginationOptions<TData> extends SnailStrategyCommonOptions {
  /**
   * hook 起始页码。默认 `1`。
   *
   * Page the hook starts on. Defaults to `1`.
   */
  initialPage?: number;

  /**
   * hook 起始的每页条数。默认 `10`。
   *
   * Items per page the hook starts with. Defaults to `10`.
   */
  initialPageSize?: number;

  /**
   * 从载荷中读出总行数。
   *
   * 默认取 `payload.total ?? payload.count ?? payload.length`——后端实际会返回的三种形状。
   * 没有可信的总数时，hook 会退回到「短页即末页」，而当最后一页恰好满页时这就检测不出来。
   *
   * Read the total row count out of the payload.
   *
   * Defaults to `payload.total ?? payload.count ?? payload.length` — the three
   * shapes backends actually return. Without a trustworthy total the hook falls
   * back to "a short page is the last page", which cannot detect the final page
   * when it happens to be exactly full.
   */
  total?: (payload: TData) => number;

  /**
   * 从载荷中读出本页的行。
   *
   * 默认是载荷本身（当它是数组时），否则取 `payload.list ?? payload.items`。
   *
   * Read the page's rows out of the payload.
   *
   * Defaults to the payload itself when it is an array, otherwise
   * `payload.list ?? payload.items`.
   */
  list?: (payload: TData) => unknown[];

  /**
   * 把每一页追加到 `list`，而不是替换它。
   *
   * 这是无限滚动模式。默认关闭，因为带页码控件的表格需要的是*替换*行为，而追加会让数组
   * 悄悄无限增长。
   *
   * Append each page to `list` instead of replacing it.
   *
   * This is the infinite-scroll mode. It is off by default because the *replacing*
   * behaviour is what a table with page controls needs, and appending silently
   * grows the array forever.
   */
  append?: boolean;

  /**
   * 在后台预取下一页，并在 `next()` 时立刻提供。
   *
   * 每页多花一次请求，因此默认关闭；适用于用户很可能按下的「下一页」按钮。预取绝不触碰
   * `loading`/`data`：它是投机性工作，绝不能闪出加载动画。
   *
   * Fetch the next page in the background and serve it instantly on `next()`.
   *
   * Costs one extra request per page, so it is off by default; useful for a
   * "next" button a user is likely to press. A preload never touches
   * `loading`/`data`: it is speculative work and must not flash a spinner.
   */
  preloadNext?: boolean;
}

/**
 * {@link usePagination} 的返回值。
 *
 * What {@link usePagination} returns.
 */
export interface UsePaginationResult<TData> extends StrategyState<TData> {
  /**
   * 当前页码，1 起。
   *
   * Current page, 1-based.
   */
  readonly page: SnailStateRef<number>;

  /**
   * 每页条数。
   *
   * Items per page.
   */
  readonly pageSize: SnailStateRef<number>;

  /**
   * 总行数，由 `total` 提取器读出。
   *
   * Total row count, as read by the `total` extractor.
   */
  readonly total: SnailStateRef<number>;

  /**
   * 行数据，按 `append` 决定累积还是替换。
   *
   * Rows, accumulated or replaced according to `append`.
   */
  readonly list: SnailStateRef<unknown[]>;

  /**
   * 已加载到最后一页时为 `true`。
   *
   * `true` once the last page has been loaded.
   */
  readonly isLastPage: SnailStateRef<boolean>;

  /**
   * 加载下一页。已在最后一页时是空操作。
   *
   * Load the next page. A no-op at the last page.
   */
  next(): Promise<TData | undefined>;

  /**
   * 加载上一页。已在第一页时是空操作。
   *
   * Load the previous page. A no-op at the first page.
   */
  prev(): Promise<TData | undefined>;

  /**
   * 跳转到某一页，会被钳制到合法范围。目标就是当前页时是空操作。
   *
   * Jump to a page, clamped into range. A no-op on the current page.
   */
  goTo(page: number): Promise<TData | undefined>;

  /**
   * 回到第一页并重新获取它。
   *
   * Go back to the first page and re-fetch it.
   */
  reload(): Promise<TData | undefined>;

  /**
   * 修改每页条数，重置到第 1 页并重新获取。
   *
   * Change the page size, reset to page 1 and re-fetch.
   */
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
 * 对一个 api 方法分页。
 *
 * `next()`/`prev()` 在边界上是**空操作且不发请求**：在最后一页按住「下一页」的用户绝不能
 * 猛击服务器，而 promise 依然会兑现（以 `undefined`），因此 `await` 永远不会挂住。
 *
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
 *
 * @param method 代理后的 api 方法，接收一个 {@link PageRequest} /
 *   The proxied api method, taking a single {@link PageRequest}.
 * @param options 分页选项 / The pagination options.
 * @returns 带 state 句柄与分页方法的结果 / The result with state handles and the paging methods.
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
