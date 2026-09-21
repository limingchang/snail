/**
 * 页面正文的契约：分页引擎的控制项，以及它留给工具栏的诊断信息。
 *
 * Page-body contracts: the pagination engine's controls and the diagnostics it leaves
 * behind for the toolbar.
 */

/**
 * `PageContent.configure(...)` 接受的选项。
 *
 * 可以从页面那边写成 `Page.configure({ pagination: { tolerance: 2 } })`，或者用
 * `Page.configure({ pagination: false })` 让 `pageContent` 节点留在 schema 里但永不拆分。
 *
 * Options accepted by `PageContent.configure(...)`.
 *
 * Reachable from the page as `Page.configure({ pagination: { tolerance: 2 } })`, or
 * `Page.configure({ pagination: false })` to keep the `pageContent` node in the schema
 * but never split anything.
 */
export interface PageContentOptions {
  /**
   * 自动分页过程是否运行；默认 `true`。
   *
   * 关掉它只是停掉排定的测量过程，节点和所有命令都保留，所以使用方可以用工具栏按钮（`paginate`）
   * 或保存的设置自己驱动分页。
   *
   * Whether the automatic pass runs at all. Default `true`.
   *
   * Turning it off keeps the node and every command: only the scheduled measurement pass
   * stops, so a consumer can drive pagination itself from a toolbar button
   * (`paginate`) or from stored settings.
   */
  autoPagination?: boolean;

  /**
   * 页面被认为溢出之前允许的像素余量；默认 `1`。
   *
   * `getBoundingClientRect()` 返回的是小数像素，而误差会在长合同里累积，所以一个在 1000px 盒子里
   * 量到 1000.4px 的页面不该因此丢掉最后一段。
   *
   * Pixels of slack tolerated before a page is considered to overflow. Default `1`.
   *
   * `getBoundingClientRect()` returns fractional pixels and the error accumulates over a
   * long contract, so a page measured at 1000.4px against a 1000px box must not shed its
   * last paragraph.
   */
  tolerance?: number;

  /** 渲染元素的额外 HTML 属性。 / Extra HTML attributes for the rendered element. */
  HTMLAttributes?: Record<string, string>;
}

/**
 * 上一次分页过程做了什么。仅作信息用途，绝不 `console.log`。
 *
 * What the last pagination pass did. Purely informational; never `console.log`ed.
 */
export interface PaginationDiagnostics {
  /** 过程结束时文档有多少页。 / How many pages the document had when the pass finished. */
  pages: number;
  /** 该过程移动了多少个区间。 / How many ranges the pass moved. */
  moved: number;
  /** 引擎报告无法放置的块数。 / How many blocks the engine reported as unplaceable. */
  oversized: number;
  /** 该过程是否派发了事务。 / Whether the pass dispatched a transaction. */
  changed: boolean;

  /**
   * 本次 pass 是否因为**时间预算用尽**而提前收手（还有内容要挪）。
   *
   * 为 `true` 时插件会在下一帧继续跑一次，所以一次大粘贴不会把主线程占满：浏览器有机会在两次
   * pass 之间绘制。所有内容都排完之后它会停在 `false`。
   *
   * Whether this pass stopped early because it ran out of its **time budget** with work left to
   * do. The plugin schedules another pass on the next frame when this is `true`, which is what
   * keeps a large paste from occupying the main thread: the browser gets to paint between
   * passes. It settles at `false` once everything is placed.
   */
  interrupted: boolean;
}

/**
 * 命令用来戳一下分页插件的句柄。
 *
 * 调度由插件自己拥有，命令只是请求一次过程；因此上一趟还在跑时，工具栏按钮不可能再跑一趟（缺陷 7
 * 的重入）。
 *
 * The handle a command uses to poke the pagination plugin.
 *
 * The plugin owns the schedule; the command only asks for a pass, so a toolbar button
 * can never run a second pass while one is in flight (defect 7's re-entrancy).
 */
export interface PaginationController {
  /**
   * 在下一个动画帧请求一次过程；重复调用会合并成一次。
   *
   * Ask for a pass on the next animation frame. Repeated calls coalesce into one.
   */
  request(): void;

  /**
   * 立刻跑一次过程（仍受防重入保护）；返回文档是否变化。
   *
   * Run a pass now (still guarded). Returns whether the document changed.
   */
  flush(): boolean;

  /** 当前是否有一趟过程正在运行。 / Whether a pass is currently in flight. */
  isRunning(): boolean;
}

/** 页面正文模块的 storage 对象：`editor.storage.pageContent`。 / `editor.storage.pageContent`. */
export interface PageContentStorage {
  /**
   * 与 {@link PageContentOptions.autoPagination} 保持一致。
   *
   * Mirrors {@link PageContentOptions.autoPagination}.
   */
  autoPagination: boolean;

  /**
   * 与 {@link PageContentOptions.tolerance} 保持一致。
   *
   * Mirrors {@link PageContentOptions.tolerance}.
   */
  tolerance: number;

  /**
   * 插件的 view 创建后设置；编辑器未挂载时为 `null`。
   *
   * Set once the plugin's view is created; `null` in an unmounted editor.
   */
  controller: PaginationController | null;

  /**
   * 上一次过程做了什么，供状态栏或测试使用。
   *
   * What the last pass did, for a status bar or a test.
   */
  lastPlan: PaginationDiagnostics | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageContent: {
      /**
       * 立刻跑一次分页过程，并与已经排定的过程合并。
       *
       * 这就是旧版「分页」工具栏按钮从来没有的处理函数（缺陷 21）。
       *
       * Run a pagination pass now, coalesced with any pass already scheduled.
       *
       * This is the handler the legacy 「分页」 toolbar button never had (defect 21).
       */
      paginate: () => ReturnType;

      /**
       * 打开或关闭自动分页。它本来就处于该状态时返回 `false`，这样工具栏可以把它渲染成真正的开关
       * （缺陷 17）。
       *
       * Turn the automatic pass on or off. Returns `false` when it was already in that
       * state, so a toolbar can render it as a real toggle (defect 17).
       */
      setAutoPagination: (enabled: boolean) => ReturnType;
    };
  }

  interface Storage {
    /** 页面正文模块的 storage 数据。 / The page-content module's storage. */
    pageContent: PageContentStorage;
  }
}
