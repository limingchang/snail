/**
 * The `layoutMode` extension — borderless "layout tables" for column positioning.
 *
 * ## What it does
 *
 * A `layoutMode: true` table renders with `data-layout="true"` and a class, so the theme can
 * drop the borders, the cell padding and the header styling that a *data* table needs. Every
 * row of such a table is marked too, which is what lets a row-level rule (no border, no
 * background) follow.
 *
 * ## The one fix that matters
 *
 * Legacy `fixLayoutTable` dispatched a transaction from inside `onUpdate`, so every document
 * edit produced `onUpdate → dispatch → onUpdate` and one redundant full-document walk with
 * stale locals. The pass here collects what needs marking, dispatches **once**, and returns
 * before building a transaction when there is nothing to do. It runs:
 *
 * - in `onCreate`, so a document loaded from HTML whose rows are missing the flag is repaired
 *   once on open — the legacy version never repaired an already-loaded document;
 * - in `onUpdate`, but only for a transaction that actually changed the document (a
 *   selection-only transaction cannot have altered the flag);
 * - never for its own transaction, which carries {@link LAYOUT_MODE_META}.
 *
 * The pass is `addToHistory: false`: the flag is derived bookkeeping, and one Ctrl+Z should
 * reverse the user's edit rather than the bookkeeping that followed it.
 *
 * ## No commands
 *
 * There is nothing to command: the UI toggles the table with Tiptap's own `updateAttributes`,
 * which finds the table containing the caret. Adding a `setLayoutMode` command would be a
 * second way to do the same thing.
 */

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

import {
  collectLayoutModeFixes,
  LAYOUT_MODE_ATTRIBUTE,
  LAYOUT_MODE_VALUE,
  layoutModeAttributeTypes,
  readLayoutMode
} from "./layout";
import type { LayoutModeOptions } from "./typing";

/** Re-export the contract and the pure pass, so a host has one import. */
export type { LayoutModeFix, LayoutModeOptions } from "./typing";
export {
  collectLayoutModeFixes,
  docHasLayoutMode,
  LAYOUT_MODE_ATTRIBUTE,
  LAYOUT_MODE_ROW,
  LAYOUT_MODE_TABLE,
  LAYOUT_MODE_VALUE,
  layoutModeAttributeTypes,
  readLayoutMode
} from "./layout";

/**
 * Tags the transaction that marks the rows.
 *
 * Two jobs: it keeps the pass out of the undo history, and it is what stops the pass from
 * re-entering itself — the nested `onUpdate` sees the flag and returns immediately. Without
 * it the second pass would still find nothing to change (which is why the legacy loop
 * terminated at all) but would have walked the document again.
 */
const LAYOUT_MODE_META = "sEditorLayoutModeFixes";

/**
 * Run the pass once for an editor.
 *
 * @returns `true` when a transaction was dispatched.
 */
export function applyLayoutModeFixes(editor: Editor): boolean {
  if (editor.isDestroyed) return false;

  const positions = collectLayoutModeFixes(editor.state.doc);
  // The early bail-out. A document whose layout rows are already marked costs one walk and
  // no transaction at all.
  if (positions.length === 0) return false;

  const tr = editor.state.tr;
  for (const pos of positions) {
    tr.setNodeAttribute(pos, "layoutMode", true);
  }

  tr.setMeta(LAYOUT_MODE_META, true);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

/** The `layoutMode` extension. */
export const LayoutMode = Extension.create<LayoutModeOptions>({
  name: "layoutMode",

  addOptions() {
    return {
      types: ["tableRow"],
      className: "layout-mode"
    };
  },

  addGlobalAttributes() {
    // Captured once, so the `renderHTML` closure does not depend on `this` being the
    // extension at render time (the legacy `renderHTML` read `this.options.calssName`).
    const className = this.options.className;

    return [
      {
        types: layoutModeAttributeTypes(this.options.types),
        attributes: {
          /**
           * `false` by default, so an ordinary table carries nothing.
           *
           * `false` rather than `null`: the value is a boolean and the theme's hook is the
           * attribute's presence, so "not a layout table" is a real state rather than a
           * missing one.
           */
          layoutMode: {
            default: false,
            parseHTML: (element: HTMLElement): boolean =>
              readLayoutMode(element.getAttribute(LAYOUT_MODE_ATTRIBUTE)),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.layoutMode === true
                ? { [LAYOUT_MODE_ATTRIBUTE]: LAYOUT_MODE_VALUE, class: className }
                : {}
          }
        }
      }
    ];
  },

  onCreate() {
    applyLayoutModeFixes(this.editor);
  },

  onUpdate({ transaction }) {
    // The pass's own transaction, and anything that did not touch the document: the flag
    // cannot have changed, so there is nothing to look for.
    if (transaction.getMeta(LAYOUT_MODE_META) === true) return;
    if (!transaction.docChanged) return;

    applyLayoutModeFixes(this.editor);
  }
});

/** The default export, so `import LayoutMode from "./layoutMode"` also works. */
export default LayoutMode;
