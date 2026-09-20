/**
 * The automatic page number.
 *
 * An **inline atom** whose label is computed at render time from the enclosing page's
 * number. Nothing is ever written into the document — that is the entire fix for defects
 * 1 and 10.
 */

/** The `pageNumber` node's attributes. */
export interface PageNumberAttributes {
  /**
   * Output pattern. `{page}` and `{total}` are substituted, and the legacy `#` / `&`
   * (plus `$index` / `$total`) spellings are accepted so an old template string keeps
   * rendering after the upgrade.
   */
  format: string;
}

/** Options accepted by `PageNumber.configure(...)`. */
export interface PageNumberOptions {
  /** Default {@link PageNumberAttributes.format} for new nodes. */
  format?: string;
  HTMLAttributes?: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageNumber: {
      /**
       * Insert a page number at the selection, e.g. into a footer the user is editing.
       *
       * Returns `false` when the schema has no `pageNumber` node or the selection cannot
       * hold an inline node — the case that used to throw out of the variable inserter
       * (defect 29).
       */
      insertPageNumber: (format?: string) => ReturnType;
    };
  }
}
