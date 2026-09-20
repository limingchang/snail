/**
 * Header and footer contracts.
 *
 * `PageHeader` and `PageFooter` are **one implementation parametrised by side**
 * (`utils/furniture.ts`); this file describes both halves of the public API so a
 * consumer can import the option type it needs without importing the factory.
 *
 * ## What is deliberately gone
 *
 * The legacy header/footer carried a `textFormat` string — a template like
 * `"第#页，共&页"` that `createPageHeader` materialised into a real text node on every
 * flush. That is exactly what made 「新页面」 throw in a default document
 * (`schema.text("")`, defect 1) and what left the numbers stale after any structural
 * edit (defect 10). With the `pageNumber` **node** the header's text is ordinary content
 * that the user can select, format and position, so `textFormat` has no job left and is
 * not part of this API. See the removal note in the module report.
 */

/** Which end of the sheet a furniture node sits on. */
export type FurnitureSide = "top" | "bottom";

/** Text alignment for a header/footer box. */
export type TextAlign = "left" | "center" | "right" | "justify";

/** Attributes shared by both furniture nodes. */
export interface FurnitureAttributes {
  /**
   * Box height in **CSS pixels**.
   *
   * Pixels rather than a CSS length because this is the value the layout solver feeds
   * back into the available-height computation, and because both legacy panels authored
   * it as a number. Read it from `node.attrs.height`, never from `extension.options`
   * (defect 20: the legacy node views read `this.options.height`, so a per-node height
   * was ignored).
   */
  height: number;

  /** The box's `text-align`. A block's own alignment still wins inside it. */
  align: TextAlign;

  /**
   * Draw a rule between the furniture and the body.
   *
   * One spelling only: the legacy had the attribute `headerLing` but the option
   * `headerLine`, so setting the documented option changed nothing (defect 20).
   */
  showLine: boolean;
}

/** The `pageHeader` node's attributes. */
export type PageHeaderAttributes = FurnitureAttributes;

/** The `pageFooter` node's attributes. */
export type PageFooterAttributes = FurnitureAttributes;

/** Options accepted by `PageHeader.configure(...)`. */
export interface PageHeaderOptions {
  height?: number;
  align?: TextAlign;
  showLine?: boolean;
  HTMLAttributes?: Record<string, string>;
}

/** Options accepted by `PageFooter.configure(...)`. */
export interface PageFooterOptions {
  height?: number;
  align?: TextAlign;
  showLine?: boolean;
  HTMLAttributes?: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageHeader: {
      /**
       * Give a header to every page that lacks one (or to a single page).
       *
       * Idempotent, and never throws on a page that has no header — the state the legacy
       * `createPage` could not even build (defect 9).
       */
      addHeader: (pageIndex?: number) => ReturnType;

      /** Remove the header from every page that has one (or from a single page). */
      removeHeader: (pageIndex?: number) => ReturnType;

      /** Set the box height in pixels. Returns `false` when nothing changed (defect 17). */
      setHeaderHeight: (height: number, pageIndex?: number) => ReturnType;

      /** Set the box alignment. Returns `false` when nothing changed. */
      setHeaderAlign: (align: TextAlign, pageIndex?: number) => ReturnType;
    };

    pageFooter: {
      /** Give a footer to every page that lacks one (or to a single page). */
      addFooter: (pageIndex?: number) => ReturnType;

      /** Remove the footer from every page that has one (or from a single page). */
      removeFooter: (pageIndex?: number) => ReturnType;

      /** Set the box height in pixels. Returns `false` when nothing changed. */
      setFooterHeight: (height: number, pageIndex?: number) => ReturnType;

      /** Set the box alignment. Returns `false` when nothing changed. */
      setFooterAlign: (align: TextAlign, pageIndex?: number) => ReturnType;
    };
  }
}
