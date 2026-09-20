/**
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
import type { PageFooterOptions, PageHeaderOptions } from "./headerFooter";
import type { PageContentOptions } from "./pageContent";
import type { PageLogoOptions } from "./pageLogo";
import type { PageNumberOptions } from "./pageNumber";

/** Options accepted by `Page.configure(...)`. */
export interface PageOptions {
  /** Sheet size. A custom `{ name, width, height }` object is honoured. */
  paperFormat: PaperFormat;

  /** Which way round the sheet is printed. */
  orientation: Orientation;

  /** Page margins, per side or as a CSS shorthand. Defaults to 20 mm all round. */
  margins: Margins;

  /**
   * Options for the header every page gets, or `false` to keep `PageHeader` out of the
   * schema entirely — in which case the page's content expression drops it too.
   */
  header: PageHeaderOptions | false;

  /** As {@link header}, for `PageFooter`. */
  footer: PageFooterOptions | false;

  /** As {@link header}, for `PageLogo`. */
  logo: PageLogoOptions | false;

  /** As {@link header}, for `PageNumber` (an inline node inside header/footer content). */
  pageNumber: PageNumberOptions | false;

  /**
   * Options for the automatic pagination engine, or `false` to keep the `pageContent`
   * node but never split anything.
   */
  pagination: PageContentOptions | false;

  /** Extra attributes for the rendered `<section>`. */
  HTMLAttributes: Record<string, string>;
}

/** The `page` node's attributes. */
export interface PageAttributes {
  /** 1-based page number. Renumbered after every structural change. */
  index: number;

  /** The sheet size this page uses. */
  paperFormat: PaperFormat;

  /** Which way round this page is printed. */
  orientation: Orientation;

  /** This page's margins. */
  margins: Margins;

  /**
   * True when the pagination engine created this page to hold overflow.
   *
   * An automatic page is removed again when its content is pulled back and it is left
   * empty, so shrinking a document does not accumulate blank pages; a page the user
   * asked for is never removed implicitly.
   */
  auto: boolean;
}

/** `editor.storage.page`. */
export interface PageStorage {
  /**
   * How many pages the document has.
   *
   * Recomputed, never incremented: the legacy set it once and only ever added to it, so
   * it drifted upward on every edit (defect 10).
   */
  total: number;

  /**
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
       * Merge margins into **every** page (or just the pages named by `pageIndex`).
       * A partial object updates only the sides it mentions.
       *
       * Returns `false` when no page changed, so a panel can avoid a pointless redraw
       * (defect 17).
       */
      setPageMargins: (margins: Margins | Partial<ResolvedMargins>, pageIndex?: number) => ReturnType;

      /** Set the sheet size on every page. Returns `false` when nothing changed. */
      setPageFormat: (paperFormat: PaperFormat, pageIndex?: number) => ReturnType;

      /** Set the orientation on every page. Returns `false` when nothing changed. */
      setPageOrientation: (orientation: Orientation, pageIndex?: number) => ReturnType;

      /**
       * Insert an empty page **after** the page containing the selection (or after the
       * last page when there is none) and put the caret in it.
       */
      addPage: (attributes?: Partial<PageAttributes>) => ReturnType;

      /** Append an empty page at the end of the document and put the caret in it. */
      addNewPage: () => ReturnType;

      /**
       * Split the current page at the caret: everything from the caret to the end of the
       * page moves onto a new page inserted directly after it.
       */
      insertPageBreak: () => ReturnType;

      /**
       * Remove a page. Without an index, the page containing the selection is removed.
       * Refuses to remove the last remaining page, because `doc` requires `page+`.
       */
      removePage: (pageIndex?: number) => ReturnType;

      /** Move the page at 1-based `from` so that it becomes the page at 1-based `to`. */
      movePage: (from: number, to: number) => ReturnType;

      /**
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
       * Rewrite every page's `index` to `1..n` and refresh `storage.total`, in one pass.
       * Returns `false` when everything was already correct (the cheap, common case).
       */
      renumberPages: () => ReturnType;

      /**
       * Recompute `storage.total` (and renumber when the indices disagree with it).
       * Returns `false` when nothing changed.
       */
      recomputeTotal: () => ReturnType;
    };
  }

  interface Storage {
    page: PageStorage;
  }
}
