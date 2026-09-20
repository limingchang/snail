/**
 * The `layoutMode` document pass — pure.
 *
 * ## The bug this replaces
 *
 * The legacy `fixLayoutTable` was called from the extension's `onUpdate`, and it dispatched a
 * transaction from inside that same event whenever a row was missing the flag:
 *
 * ```text
 * onUpdate → dispatch → onUpdate → dispatch → …
 * ```
 *
 * It terminated only because the second pass found nothing left to change, so every document
 * edit paid for one extra full-document walk *and* one extra dispatch, and the nested
 * dispatch re-entered with locals captured before the first one had been applied.
 *
 * The replacement is one idempotent pass: collect the positions that need marking, dispatch
 * **once** with a re-entrancy flag, and return early when the collection is empty — so a
 * document whose tables are already marked costs one walk and no transaction.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** The attribute a layout table/row renders into. */
export const LAYOUT_MODE_ATTRIBUTE = "data-layout";

/** The node type that makes a table a layout table. */
export const LAYOUT_MODE_TABLE = "table";

/** The node type of a row. */
export const LAYOUT_MODE_ROW = "tableRow";

/** The value {@link LAYOUT_MODE_ATTRIBUTE} is written with. */
export const LAYOUT_MODE_VALUE = "true";

/**
 * Read {@link LAYOUT_MODE_ATTRIBUTE}.
 *
 * `""` (a bare `data-layout` attribute, which HTML authors write and which is truthy in every
 * other attribute-checking idiom) counts as set; only an explicit `"false"`/`"0"` is not.
 */
export function readLayoutMode(value: string | null): boolean {
  if (value === null) return false;
  return value !== "false" && value !== "0";
}

/**
 * The node types the attribute is declared on.
 *
 * `table` is always included and the result is deduplicated, so a caller that passes
 * `["tableRow", "table"]` does not declare the attribute twice on `table` — which Tiptap
 * would either merge silently or reject, depending on version.
 */
export function layoutModeAttributeTypes(types: readonly string[]): string[] {
  return Array.from(new Set([...types, LAYOUT_MODE_TABLE]));
}

/**
 * Every `tableRow` that belongs to a layout table but is not marked yet.
 *
 * Only the table's **direct** rows are considered. `node.descendants` would also reach the
 * rows of an ordinary table nested inside a cell, and stamping the outer table's flag on those
 * would silently turn a data table into a layout table — which is the bug the legacy version
 * had, because it walked `node.descendants` for rows.
 *
 * The outer walk keeps descending, so a layout table nested inside an ordinary table is still
 * found and marked with its own absolute positions.
 *
 * @returns the absolute positions, in document order. Empty when nothing needs changing.
 */
export function collectLayoutModeFixes(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== LAYOUT_MODE_TABLE || node.attrs.layoutMode !== true) return true;

    // `forEach` reports offsets relative to the node's *content* start, so a row's absolute
    // position is `tablePos + 1 + offset`. (`pos` from `descendants` is the position *before*
    // the table, hence the `+ 1`.)
    node.forEach((child, offset) => {
      if (child.type.name !== LAYOUT_MODE_ROW) return;
      if (child.attrs.layoutMode === true) return;
      positions.push(pos + 1 + offset);
    });

    return true;
  });

  return positions;
}

/** `true` when any table in the document is a layout table. */
export function docHasLayoutMode(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === LAYOUT_MODE_TABLE && node.attrs.layoutMode === true) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}
