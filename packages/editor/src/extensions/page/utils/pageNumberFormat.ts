/**
 * Planning a page-number format change — pure, so it is testable without a DOM.
 *
 * ## Why this is not just "write the attribute"
 *
 * The obvious implementation (`for every pageNumber node: setNodeAttribute(..., "format", f)`)
 * does nothing at all in the state a user is actually in when they pick a format. Enabling the
 * footer creates an *empty* footer: there is no `pageNumber` node yet, so there is nothing to
 * write to, and the panel can only report that the footer has no number — a dead end rather
 * than an explanation. Choosing a format **is** how a user asks for a page number, so this
 * planner creates the one that is missing and updates the ones that exist.
 *
 * ## The rules it encodes
 *
 * 1. **Furniture**, not the body: a page number belongs in the footer, and a document that only
 *    has a header gets one there rather than nothing (`findChild` returns children in document
 *    order, and the `??` fallback is what expresses "footer, else header"). A page with neither
 *    is skipped — the panel disables the control in that state anyway.
 * 2. **Exactly one per page**: an existing `pageNumber` anywhere under the furniture is updated;
 *    only when there is none is a new one appended to the end of the furniture's last textblock,
 *    which is where a footer written by hand would have put it.
 * 3. **Highest position first**: an insert shifts every position after it, so an ascending pass
 *    would splice stale positions into the transaction — the corruption the legacy flush
 *    commands produced (defect 11). Descending order means each edit only affects positions
 *    that have already been handled.
 *
 * The positions themselves come from {@link PageRef}: `pos` is the position **before** a node,
 * `pos + 1` its content start, and a `descendants` offset is relative to the furniture's own
 * content — hence `furniture.pos + 1 + offset`.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";

import {
  collectPages,
  findChild,
  PAGE_FOOTER_NODE,
  PAGE_HEADER_NODE,
  PAGE_NUMBER_NODE
} from "./nodes";

/** Where one page's page number is, or where one has to be created. */
interface NumberTarget {
  /** Position of the existing `pageNumber` node, when the furniture already has one. */
  numberPos?: number;
  /** Position to insert a new one at: the end of the furniture's last textblock. */
  appendPos?: number;
}

/**
 * The transaction that gives every page a page number with `format`, or `null` when nothing
 * would change (no furniture at all, or every number already formatted that way).
 *
 * `tr` defaults to `state.tr` so a test can plan against a bare `EditorState`; the command
 * passes the transaction it was called with so a chained command keeps its accumulated steps.
 */
export function planPageNumberFormat(
  state: EditorState,
  format: string,
  tr: Transaction = state.tr
): Transaction | null {
  const pageNumberType = state.schema.nodes[PAGE_NUMBER_NODE];
  if (!pageNumberType) return null;

  const targets: NumberTarget[] = [];

  for (const page of collectPages(state.doc)) {
    const furniture = findChild(page, PAGE_FOOTER_NODE) ?? findChild(page, PAGE_HEADER_NODE);
    if (!furniture) continue;

    const target: NumberTarget = {};
    furniture.node.descendants((child, offset) => {
      const absolute = furniture.pos + 1 + offset;
      if (child.type.name === PAGE_NUMBER_NODE) {
        target.numberPos = absolute;
        // One number per page: stop at the first one found.
        return false;
      }
      if (child.isTextblock) target.appendPos = absolute + 1 + child.content.size;
      return true;
    });

    if (target.numberPos !== undefined || target.appendPos !== undefined) targets.push(target);
  }

  if (targets.length === 0) return null;

  targets.sort(
    (a, b) => (b.numberPos ?? b.appendPos ?? 0) - (a.numberPos ?? a.appendPos ?? 0)
  );

  let changed = false;
  for (const target of targets) {
    if (target.numberPos !== undefined) {
      // `tr.doc`, not `state.doc`: earlier iterations inserted nodes at higher positions, so
      // the transaction's own document is the one these positions refer to.
      if (tr.doc.nodeAt(target.numberPos)?.attrs.format === format) continue;
      tr.setNodeAttribute(target.numberPos, "format", format);
      changed = true;
      continue;
    }

    if (target.appendPos === undefined) continue;
    tr.insert(target.appendPos, pageNumberType.create({ format }));
    changed = true;
  }

  return changed ? tr : null;
}
