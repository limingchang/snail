/**
 * The `layoutMode` extension's own contract.
 *
 * A "layout table" is a borderless table used for column positioning — a contract's
 * signature block, a two-column clause header. Tiptap has no equivalent, and a layout table
 * is not a data table: it must not get the theme's cell borders, and its rows must be marked
 * too so the row-level rules can follow.
 */

/** A position the idempotent pass wants to mark. */
export interface LayoutModeFix {
  /** Absolute position of the `tableRow` node. */
  pos: number;
}

/**
 * What a caller may configure.
 *
 * The legacy interface declared `calssName` — a typo, so the option's real name (and the
 * class it produced) was only discoverable by reading the source. It is `className` here.
 * The legacy `HTMLAttributes: Record<string, any>` is gone: nothing ever read it.
 */
export interface LayoutModeOptions {
  /**
   * Node types that carry `layoutMode`, in addition to `table`.
   *
   * Default `["tableRow"]`. `table` is always included (deduplicated), because a row can only
   * be in layout mode because its table is.
   */
  types: string[];

  /** The class added to an element in layout mode. Default `"layout-mode"`. */
  className: string;
}
