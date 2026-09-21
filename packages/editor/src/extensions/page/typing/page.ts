/**
 * `page` 节点的契约，外加整个页面模块的命令与 storage 声明。
 *
 * 六个命令组都声明在这里而不是每个扩展一个文件，因为 TypeScript 按*属性*合并
 * `interface Commands<ReturnType>` 增强，而想查「页面能做什么」的读者应该只找到一份清单。缺陷 21 是
 * 一批声明了却从未实现的命令名（`insertPagination`、`autoPageBreak`、五个 `*AutoPageBreak` 变体）
 * ——下面声明的每一个都真实存在。
 *
 * The `page` node's contract, plus the command and storage declarations for the whole
 * page module.
 *
 * All six command groups are declared here rather than in one file per extension because
 * TypeScript merges `interface Commands<ReturnType>` augmentations per *property*, and a
 * reader looking for "what can the page do" should find one list. Defect 21 was a set of
 * command names that were declared and never implemented (`insertPagination`,
 * `autoPageBreak`, five `*AutoPageBreak` variants) — everything declared below exists.
 */

import type { Margins, Orientation, PaperFormat, ResolvedMargins } from "../../../typings/paper";
import type { PageFooterOptions, PageHeaderOptions, RegionOptions } from "./headerFooter";
import type { PageContentOptions } from "./pageContent";
import type { PageLogoOptions } from "./pageLogo";
import type { PageNumberOptions } from "./pageNumber";

/**
 * `Page.configure(...)` 接受的选项。
 *
 * Options accepted by `Page.configure(...)`.
 */
export interface PageOptions {
  /**
   * 纸张尺寸；自定义的 `{ name, width, height }` 对象也会被采纳。
   *
   * Sheet size. A custom `{ name, width, height }` object is honoured.
   */
  paperFormat: PaperFormat;

  /** 纸张的打印方向。 / Which way round the sheet is printed. */
  orientation: Orientation;

  /**
   * 页边距，可以逐边给出，也可以写成 CSS 简写；默认四周 20 mm。
   *
   * Page margins, per side or as a CSS shorthand. Defaults to 20 mm all round.
   */
  margins: Margins;

  /**
   * 每一页都会得到的页眉的选项；传 `false` 则让 `PageHeader` 完全不进 schema——此时页面的内容
   * 表达式也会去掉它。
   *
   * Options for the header every page gets, or `false` to keep `PageHeader` out of the
   * schema entirely — in which case the page's content expression drops it too.
   */
  header: PageHeaderOptions | false;

  /** 同 {@link header}，用于 `PageFooter`。 / As {@link header}, for `PageFooter`. */
  footer: PageFooterOptions | false;

  /** 同 {@link header}，用于 `PageLogo`。 / As {@link header}, for `PageLogo`. */
  logo: PageLogoOptions | false;

  /**
   * 同 {@link header}，用于 `PageNumber`（页眉/页脚区域内的一个块）。
   *
   * As {@link header}, for `PageNumber` (a block inside a header/footer region).
   */
  pageNumber: PageNumberOptions | false;

  /**
   * 页眉/页脚**区域**（左 / 中 / 右三等分）的选项。
   *
   * 槽位词汇是固定的；可以配置的只有区域在未被编辑时显示的提示。
   *
   * Options for the header/footer **regions** (the left / centre / right thirds).
   *
   * Their slot vocabulary is fixed; the only thing to configure is the hint a region shows while
   * it is not being edited.
   */
  region: RegionOptions;

  /**
   * 自动分页引擎的选项；传 `false` 则保留 `pageContent` 节点但永不拆分。
   *
   * Options for the automatic pagination engine, or `false` to keep the `pageContent`
   * node but never split anything.
   */
  pagination: PageContentOptions | false;

  /** 渲染 `<section>` 的额外属性。 / Extra attributes for the rendered `<section>`. */
  HTMLAttributes: Record<string, string>;
}

/** `page` 节点的属性。 / The `page` node's attributes. */
export interface PageAttributes {
  /**
   * 从 1 开始的页码；每次结构变化后都会重编号。
   *
   * 1-based page number. Renumbered after every structural change.
   */
  index: number;

  /** 本页使用的纸张尺寸。 / The sheet size this page uses. */
  paperFormat: PaperFormat;

  /** 本页的打印方向。 / Which way round this page is printed. */
  orientation: Orientation;

  /** 本页的页边距。 / This page's margins. */
  margins: Margins;

  /**
   * 为 `true` 时，这一页是分页引擎为容纳溢出内容而创建的。
   *
   * 内容被收回去之后，自动页如果在变空就会被再次移除，所以文档变短不会累积空白页；而用户自己要来的
   * 页面绝不会被隐式删除。
   *
   * True when the pagination engine created this page to hold overflow.
   *
   * An automatic page is removed again when its content is pulled back and it is left
   * empty, so shrinking a document does not accumulate blank pages; a page the user
   * asked for is never removed implicitly.
   */
  auto: boolean;
}

/** 页面模块的 storage 对象：`editor.storage.page`。 / `editor.storage.page`. */
export interface PageStorage {
  /**
   * 文档有多少页。
   *
   * 每次重算而不是自增：旧版只设置一次、之后只往上加，于是每次编辑都会漂高（缺陷 10）。
   *
   * How many pages the document has.
   *
   * Recomputed, never incremented: the legacy set it once and only ever added to it, so
   * it drifted upward on every edit (defect 10).
   */
  total: number;

  /**
   * 分页过程的防重入标志。
   *
   * 分页是在一个事务内部派发的，没有这个标志，它触发的更新会用过期位置再次进入该过程（缺陷 7）。
   *
   * Re-entrancy guard for the pagination pass.
   *
   * Pagination dispatches from inside a transaction, so without this flag the update it
   * triggers re-enters the pass with stale positions (defect 7).
   */
  paginating: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    page: {
      /**
       * 把页边距合并进**每一页**（或只合并 `pageIndex` 指定的页面）；
       * 传入部分对象时只更新它提到的边。
       *
       * 没有任何页面发生变化时返回 `false`，这样面板可以省掉一次无谓的重绘（缺陷 17）。
       *
       * Merge margins into **every** page (or just the pages named by `pageIndex`).
       * A partial object updates only the sides it mentions.
       *
       * Returns `false` when no page changed, so a panel can avoid a pointless redraw
       * (defect 17).
       */
      setPageMargins: (margins: Margins | Partial<ResolvedMargins>, pageIndex?: number) => ReturnType;

      /**
       * 设置每一页的纸张尺寸；没有变化时返回 `false`。
       *
       * Set the sheet size on every page. Returns `false` when nothing changed.
       */
      setPageFormat: (paperFormat: PaperFormat, pageIndex?: number) => ReturnType;

      /**
       * 设置每一页的方向；没有变化时返回 `false`。
       *
       * Set the orientation on every page. Returns `false` when nothing changed.
       */
      setPageOrientation: (orientation: Orientation, pageIndex?: number) => ReturnType;

      /**
       * 在包含选区的页面**之后**插入一个空页（没有选区时插在最后一页之后），并把光标放进新页。
       *
       * Insert an empty page **after** the page containing the selection (or after the
       * last page when there is none) and put the caret in it.
       */
      addPage: (attributes?: Partial<PageAttributes>) => ReturnType;

      /**
       * 在文档末尾追加一个空页，并把光标放进新页。
       *
       * Append an empty page at the end of the document and put the caret in it.
       */
      addNewPage: () => ReturnType;

      /**
       * 在光标处拆分当前页面：从光标到页尾的内容全部移到紧随其后插入的新页上。
       *
       * Split the current page at the caret: everything from the caret to the end of the
       * page moves onto a new page inserted directly after it.
       */
      insertPageBreak: () => ReturnType;

      /**
       * 移除一个页面。不给索引时，移除包含选区的页面。拒绝移除仅剩的最后一页，因为 `doc` 要求
       * `page+`。
       *
       * Remove a page. Without an index, the page containing the selection is removed.
       * Refuses to remove the last remaining page, because `doc` requires `page+`.
       */
      removePage: (pageIndex?: number) => ReturnType;

      /**
       * 把 1 起的第 `from` 页移动到第 `to` 页的位置。
       *
       * Move the page at 1-based `from` so that it becomes the page at 1-based `to`.
       */
      movePage: (from: number, to: number) => ReturnType;

      /**
       * 刷新页数，并通过 `storage.page.total` 报告它。
       *
       * Tiptap 的命令契约是 `(props) => boolean`：`RawCommands` / `SingleCommands` 都由它派生，而
       * `CommandManager` 会调用命令返回的函数，所以命令无法*返回*一个数字。因此页数发布在
       * `editor.storage.page.total` 上（每次结构变化都会保持它最新），命令则报告这个数字是否变化。
       * 想要不经命令直接取值，用导出的 `countPages(editor.state.doc)`。
       *
       * Refresh the page count.
       *
       * Tiptap's typed command contract is `(...args) => (props) => boolean`: `RawCommands`
       * and `SingleCommands` are both derived from it, and `CommandManager` *calls* the value
       * a command returns — so a command cannot answer with a number without breaking at
       * runtime. The count is published on `editor.storage.page.total` (kept current by
       * every structural change) and this command returns whether that number changed. For
       * the raw value without a command, use the exported `countPages(editor.state.doc)`.
       */
      getPageCount: () => ReturnType;

      /**
       * 一趟把每一页的 `index` 重写为 `1..n` 并刷新 `storage.total`。一切都已正确时返回 `false`
       * （常见且廉价的路径）。
       *
       * Rewrite every page's `index` to `1..n` and refresh `storage.total`, in one pass.
       * Returns `false` when everything was already correct (the cheap, common case).
       */
      renumberPages: () => ReturnType;

      /**
       * 重新计算 `storage.total`（当索引与它不一致时一并重编号）。没有变化时返回 `false`。
       *
       * Recompute `storage.total` (and renumber when the indices disagree with it).
       * Returns `false` when nothing changed.
       */
      recomputeTotal: () => ReturnType;
    };
  }

  interface Storage {
    /** 页面模块的 storage 数据。 / The page module's storage. */
    page: PageStorage;
  }
}
