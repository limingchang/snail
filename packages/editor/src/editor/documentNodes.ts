/**
 * Reading and writing the document's structural nodes.
 *
 * A panel that shows page setup, a page-number pattern or the QR code's size has to read
 * it out of the **document**, not out of the extension's options. The legacy page panel
 * kept its own local `pageSettings` that was never initialised from the document
 * (defect 42), so it displayed Word's defaults for a page that was set up completely
 * differently, and its first edit silently reset the page to those defaults. Reading the
 * model is the fix; the extension's options are only the *initial* values.
 *
 * ## Why this does not use `updateAttributes`
 *
 * Tiptap's `updateAttributes(type, attrs)` only touches nodes inside the current
 * selection. A panel that changes "the page number format" means **every** page, and the
 * caret is inside the page *content* — not on the footer node — so the command would
 * silently do nothing. That is the same class of bug as defect 22 (a variable edit that
 * only worked when a `NodeSelection` happened to sit on it). Everything here addresses
 * nodes by position, in one transaction.
 */

import type { Editor } from "@tiptap/core";

/** One node found in the document, with the position of its *start*. */
export interface DocumentNode {
  /** The position before the node, which is what `setNodeMarkup` and `delete` want. */
  pos: number;

  /** The node's attributes, as stored. */
  attrs: Record<string, unknown>;
}

/** Every node of a type in the document, in document order. */
export function findNodes(editor: Editor | undefined, typeName: string): DocumentNode[] {
  if (!editor) return [];
  const found: DocumentNode[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      found.push({ pos, attrs: node.attrs as Record<string, unknown> });
    }
    return true;
  });
  return found;
}

/** The first node of a type, or `undefined`. */
export function findFirstNode(editor: Editor | undefined, typeName: string): DocumentNode | undefined {
  return findNodes(editor, typeName)[0];
}

/** `true` when the schema contains a node type, so a panel never calls a missing command. */
export function hasNodeType(editor: Editor | undefined, typeName: string): boolean {
  return editor?.schema.nodes[typeName] !== undefined;
}

/**
 * Merge attributes into every node of a type.
 *
 * Unknown attribute names are dropped by ProseMirror's own `computeAttrs`, so a panel
 * that guesses a name the extension does not declare is a no-op rather than a
 * corruption. That is why the callers can write `{ height }` without knowing whether the
 * page extension spells it `height` or `ling`.
 *
 * @returns how many nodes were changed, so a caller can tell the user when there was
 * nothing to change instead of pretending it worked.
 */
export function updateNodesOfType(
  editor: Editor | undefined,
  typeName: string,
  attrs: Record<string, unknown>
): number {
  if (!editor || !hasNodeType(editor, typeName)) return 0;

  const targets = findNodes(editor, typeName);
  if (targets.length === 0) return 0;

  const transaction = editor.state.tr;
  for (const target of targets) {
    transaction.setNodeMarkup(target.pos, undefined, { ...target.attrs, ...attrs });
  }
  editor.view.dispatch(transaction);
  return targets.length;
}

/** Read one attribute from the first node of a type. */
export function readNodeAttribute(
  editor: Editor | undefined,
  typeName: string,
  attribute: string
): unknown {
  return findFirstNode(editor, typeName)?.attrs[attribute];
}

/**
 * Read the first value present among several candidate attribute names.
 *
 * The page extension's attribute spelling is not part of the published contract for the
 * region attributes (defect 20 is precisely a spelling drift between `headerLine` and
 * `headerLing`), so a panel reads every plausible spelling rather than showing an empty
 * control for a page that is in fact configured.
 */
export function readAnyAttribute(
  editor: Editor | undefined,
  typeName: string,
  attributes: readonly string[]
): unknown {
  const attrs = findFirstNode(editor, typeName)?.attrs;
  if (!attrs) return undefined;
  for (const attribute of attributes) {
    const value = attrs[attribute];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** The document's page geometry, as the page node holds it. */
export interface DocumentPageSetup {
  paperFormat?: unknown;
  orientation?: unknown;
  margins?: unknown;
}

/** Page geometry read from the first `page` node. Every field may be absent. */
export function readDocumentPageSetup(editor: Editor | undefined): DocumentPageSetup {
  const attrs = findFirstNode(editor, "page")?.attrs;
  return {
    paperFormat: attrs?.paperFormat,
    orientation: attrs?.orientation,
    margins: attrs?.margins
  };
}

/**
 * The page-number pattern currently in use.
 *
 * A `pageNumber` node's `format`, read from the first page number in the document. The
 * legacy panel offered three hard-coded presets and wrote the *chosen preset index* into
 * a footer attribute, so a document opened with a custom pattern displayed the first
 * preset.
 */
export function readPageNumberFormat(editor: Editor | undefined): string | undefined {
  const value = readNodeAttribute(editor, "pageNumber", "format");
  return typeof value === "string" ? value : undefined;
}
