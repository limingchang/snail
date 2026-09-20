/**
 * The `qrcode` block node.
 *
 * ## What was wrong with the legacy extension
 *
 * - **It could not be inserted at all.** `insertQRCode` inserted at
 *   `editor.$nodes("pageContent")[0].pos`, and `$nodes(name).pos` is the position
 *   *before* the node — a slot inside `page`, whose content expression has no room for a
 *   block. ProseMirror raised `ReplaceError: Invalid content for node page`, Tiptap
 *   rethrew it as a `TransformError`, and the toolbar swallowed it as 「插入失败」
 *   (defect 30). Here the position is found by walking outwards from the caret to the
 *   nearest ancestor that can *hold* a block, and the insertion is rehearsed on a
 *   throwaway transaction before it is dispatched.
 * - **`storage.qrcode.hasQRCode` was write-once** (defect 31), so deleting the code made
 *   the editor permanently unable to insert another. There is no such flag: `hasQRCode()`
 *   and {@link documentHasQRCode} read the document.
 * - **`updateQRCode` was a no-op** (defect 32) — it passed an undeclared `{ options }`
 *   attribute, so size and position only ever changed through a direct DOM write in the
 *   toolbar. Every attribute here is a schema attribute changed by a command, and the
 *   node view derives its styles from those attributes.
 * - **The toolbar null-dereferenced after a delete** (defect 33) because it queried the
 *   whole document for `[data-type="qrcode"]`. Nothing in this extension does that: the
 *   commands resolve *their own* node through the selection and the document.
 * - **`text` was not in the schema** (defect 34), so the payload was lost on every save.
 *   It is an attribute, and it round-trips.
 * - **The raster was a fixed 200 px** (defect 34), so a code enlarged for print got
 *   blurrier the bigger it was. The width is derived from the requested size at
 *   `QR_PRINT_DPI` now.
 *
 * ## Asynchrony
 *
 * Generating a raster needs a `<canvas>`, so `qrcode` is imported lazily and the
 * generation is a promise. Tiptap's commands are synchronous, so a command that needs a
 * raster returns `true` — "accepted" — and dispatches when the image is ready. The two
 * rules that make that safe:
 *
 * - the *position* is resolved from the live document at dispatch time (an insertion) or
 *   re-checked before writing (an update), so a position captured before an `await` can
 *   never be used after it;
 * - the promise checks `editor.isDestroyed` before touching the view, so a host that
 *   unmounts the editor mid-flight cannot get a dispatch on a dead editor.
 *
 * Failures are reported through `options.onError`, because there is no other channel: the
 * command has already returned by the time the canvas fails.
 */

import { mergeAttributes, Node } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

import {
  mergeQRCodeAttrs,
  qrCodeAttributes,
  QR_CODE_TYPE_ATTRIBUTE,
  QR_CODE_TYPE_VALUE,
  renderQRCodeConfig
} from "./attributes";
import { generateQRCodeDataURL, generationOptions } from "./generate";
import {
  normalizeAttrs,
  QR_PRINT_DPI,
  qrCodeStyle,
  rasterInputsChanged,
  sameQRCodeAttrs,
  styleString
} from "./geometry";
import { createQRCodeNodeView } from "./nodeView";
import type { QRCodeAttrs, QRCodeInput, QRCodeOptions } from "./typing";

/** Re-export the contract, so a host imports everything from one place. */
export type {
  QRCodeAttrs,
  QRCodeConfig,
  QRCodeGenerationOptions,
  QRCodeInput,
  QRCodeNodeView,
  QRCodeNodeViewContext,
  QRCodeOptions,
  QRColor,
  QRErrorCorrectionLevel,
  QRLength,
  QRPosition,
  QRUnit
} from "./typing";
export { QR_UNITS } from "./typing";
export type { ToDataURL } from "./generate";
export { generateQRCodeDataURL, generationOptions, loadToDataURL } from "./generate";
export {
  decodeQRCodeConfig,
  encodeQRCodeConfig,
  isQRUnit,
  lengthToCss,
  normalizeAttrs,
  normalizeColor,
  normalizeConfig,
  normalizeLength,
  normalizeMargin,
  normalizePosition,
  qrCodeStyle,
  QR_CODE_Z_INDEX,
  QR_DEFAULT_ALT,
  QR_DEFAULT_COLOR,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_POSITION,
  QR_DEFAULT_SIZE,
  QR_DEFAULT_TEXT,
  QR_MAX_RASTER_PIXELS,
  QR_MIN_RASTER_PIXELS,
  QR_PRINT_DPI,
  rasterInputsChanged,
  sameLength,
  sameQRCodeAttrs,
  styleString,
  toCssPixels,
  toRasterPixels
} from "./geometry";
export {
  parseQRCodeAttributes,
  QR_CODE_ALT_ATTRIBUTE,
  QR_CODE_CONFIG_ATTRIBUTE,
  QR_CODE_SRC_ATTRIBUTE,
  QR_CODE_TEXT_ATTRIBUTE,
  QR_CODE_TYPE_ATTRIBUTE,
  QR_CODE_TYPE_VALUE
} from "./attributes";

/**
 * Editors with an insertion in flight.
 *
 * A `WeakSet`, not a flag on the extension: it holds no strong reference (so a destroyed
 * editor is collectable) and it cannot be shared between two editors. Without it a
 * double-click on 「插入二维码」 inserts two codes, because generation is asynchronous and
 * the second click arrives before the first has finished.
 */
const insertionsInFlight = new WeakSet<Editor>();

/** A QR code found in a document. */
export interface FoundQRCode {
  /** Absolute position before the node. */
  pos: number;
  node: ProseMirrorNode;
}

/** `true` when the document contains at least one QR code. */
export function docHasQRCode(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === "qrcode") {
      found = true;
      // Stop descending: one is enough, and a QR code has no content to search anyway.
      return false;
    }
    return true;
  });
  return found;
}

/**
 * `true` when the editor's document contains at least one QR code.
 *
 * The replacement for the legacy write-once `storage.qrcode.hasQRCode`: derived from the
 * document on every call, so deleting the code makes it `false` again (defect 31).
 */
export function documentHasQRCode(editor: Editor): boolean {
  return docHasQRCode(editor.state.doc);
}

/**
 * The QR code a command should act on.
 *
 * Resolution order, so an edit never depends on the caller having selected the right
 * thing (the legacy `updateAttributes(name, …)` silently did nothing unless a
 * `NodeSelection` happened to sit on the node):
 *
 * 1. a `NodeSelection` on a QR code — the user clearly means that one;
 * 2. the only QR code in the document;
 * 3. the QR code nearest the selection.
 */
export function findCurrentQRCode(state: EditorState): FoundQRCode | undefined {
  const selection = state.selection;

  if (selection instanceof NodeSelection && selection.node.type.name === "qrcode") {
    return { pos: selection.from, node: selection.node };
  }

  const found: FoundQRCode[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === "qrcode") {
      found.push({ pos, node });
      return false;
    }
    return true;
  });

  if (found.length === 0) return undefined;
  if (found.length === 1) return found[0];

  let best = found[0];
  let bestDistance = Math.abs(best.pos - selection.from);
  for (const candidate of found) {
    const distance = Math.abs(candidate.pos - selection.from);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * `true` when a node can actually be inserted at `pos`.
 *
 * A content expression can accept a node type and still reject it at *this* position
 * (a `listItem` must start with a paragraph, a table cell has its own expression), so the
 * real transform is the only authority. Rehearsing it on a throwaway transaction is what
 * turns legacy defect 30's `TransformError` into "the command returns `false`".
 */
function canInsertAt(state: EditorState, pos: number, node: ProseMirrorNode): boolean {
  if (pos < 0 || pos > state.doc.content.size) return false;
  try {
    state.tr.insert(pos, node);
    return true;
  } catch {
    return false;
  }
}

/**
 * The nearest position where a block-level node of `type` can legally be inserted.
 *
 * The walk starts at the caret and moves outwards. The innermost node that can hold a
 * block is the container the code belongs in; if it is not the node the caret is directly
 * inside (a paragraph, a heading, a `pageContent` with the caret in a paragraph) the code
 * goes *after* the block around the caret, so a paragraph is never split in half by a
 * stamp. When the document has no `page`/`pageContent` at all the top node is used, which
 * is what makes the extension work in a plain single-page editor too.
 */
export function resolveBlockInsertPosition(state: EditorState, type: NodeType): number | undefined {
  const probe: ProseMirrorNode = type.create();
  const container = Fragment.from(probe);
  const $from = state.selection.$from;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if (!$from.node(depth).type.validContent(container)) continue;

    // `$from.pos` is the caret itself, which is a legal slot when the caret sits directly
    // inside the container (between two blocks). Otherwise the code goes after the block
    // that contains the caret: `after(depth + 1)` is that block's end.
    const candidate = depth === $from.depth ? $from.pos : $from.after(depth + 1);
    if (canInsertAt(state, candidate, probe)) return candidate;
  }

  return undefined;
}

/**
 * Insert a fully-resolved node into the *live* document.
 *
 * Called only after an `await`, which is why it re-resolves the position and re-checks
 * `isDestroyed` instead of trusting anything captured earlier.
 */
function commitInsertion(editor: Editor, attrs: QRCodeAttrs): boolean {
  if (editor.isDestroyed) return false;

  const type = editor.state.schema.nodes.qrcode;
  if (!type) return false;

  const pos = resolveBlockInsertPosition(editor.state, type);
  if (pos === undefined) return false;

  const node = type.create({ ...attrs });
  const tr = editor.state.tr.insert(pos, node);
  // Select the new node, so the toolbar's size/position panel is editing it the moment it
  // appears — and so a second insert is an obvious no-op rather than a silent second stamp.
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.dispatch(tr);
  return true;
}

/**
 * Generate a raster and write it onto the QR code at `pos`, in **one** transaction.
 *
 * Attributes and `src` are written together on purpose: an intermediate transaction that
 * changed the size without the matching raster would render a stretched image for a frame,
 * and would put two steps in the undo history for one user action.
 */
function generateAndApply(editor: Editor, pos: number, attrs: QRCodeAttrs, options: QRCodeOptions): void {
  void generateQRCodeDataURL(attrs, generationOptions(options))
    .then((src) => {
      // The generation outlives the command, so the editor may be gone by now.
      if (editor.isDestroyed) return;

      const current = editor.state.doc.nodeAt(pos);
      // The position is re-checked rather than re-resolved. If the code was deleted or
      // replaced while the canvas was drawing, writing these attributes onto whatever now
      // sits at that offset would corrupt an unrelated node; doing nothing is the honest
      // outcome, and the window is a few milliseconds wide.
      if (!current || current.type.name !== "qrcode") return;

      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, src }));
    })
    .catch((error: unknown) => {
      options.onError(error);
    });
}

/** The `qrcode` node extension. */
export const QRCode = Node.create<QRCodeOptions>({
  name: "qrcode",

  /**
   * Block-level, an atom, and genuinely draggable.
   *
   * `draggable: true` is the fix for the customer's "moving" bug: the node is moved by a
   * real ProseMirror drag, which goes into the document and into the undo history, instead
   * of by writing `top`/`left` onto the element and losing it on the next render.
   * `atom: true` gives it no content, so the caret can never be parked inside it.
   */
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      errorCorrectionLevel: "M",
      dpi: QR_PRINT_DPI,
      // A silent failure is worse than a noisy one: generation is asynchronous, so a host
      // that wants to show a message has to subscribe, and a host that does not still gets
      // the failure in the console rather than nowhere.
      onError: (error: unknown) => {
        console.error("[snail] QR code generation failed", error);
      }
    };
  },

  addAttributes() {
    return qrCodeAttributes();
  },

  parseHTML() {
    return [
      {
        // `img` plus an attribute check rather than the selector
        // `img[data-type="qrcode"]`: the attribute check is what actually decides the
        // match, so an unrelated pasted `<img>` is left to the image extension, and the
        // rule works with a plain `getAttribute` stub in a test as well as with a real DOM.
        tag: "img",
        getAttrs: (element: HTMLElement) =>
          element.getAttribute(QR_CODE_TYPE_ATTRIBUTE) === QR_CODE_TYPE_VALUE ? {} : false
      }
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = normalizeAttrs(node.attrs as Partial<QRCodeAttrs>);

    return [
      "img",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          "data-type": QR_CODE_TYPE_VALUE,
          class: "s-editor-qrcode",
          // The same declarations the node view writes, so an exported document is
          // positioned and sized exactly like the editor showed it.
          style: styleString(qrCodeStyle(attrs))
        },
        // The four structured attributes, as one JSON blob. See `attributes.ts`.
        renderQRCodeConfig(attrs)
      )
    ];
  },

  addNodeView() {
    return (props) =>
      createQRCodeNodeView({
        name: "qrcode",
        attrs: normalizeAttrs(props.node.attrs as Partial<QRCodeAttrs>)
      });
  },

  addCommands() {
    const extension = this;

    return {
      /**
       * Insert a QR code.
       *
       * Returns `false` — never throws — when there is no legal position or no payload.
       * When a raster has to be generated the insertion happens when it is ready; a
       * caller that needs to know should watch the document (or `onError`).
       */
      insertQRCode:
        (attrs?: QRCodeInput) =>
        ({ editor, state }) => {
          const type = state.schema.nodes.qrcode;
          if (!type) return false;

          const next = normalizeAttrs(attrs);

          // A caller that already holds a raster — a re-insert, an import, a test — skips
          // the canvas entirely, and the command stays synchronous.
          if (next.src.length > 0) return commitInsertion(editor, next);

          if (next.text.trim().length === 0) return false;
          if (insertionsInFlight.has(editor)) return false;
          insertionsInFlight.add(editor);

          void generateQRCodeDataURL(next, generationOptions(extension.options))
            .then((src) => {
              // The position is resolved inside `commitInsertion`, from the live document,
              // so the insert can never land at a stale address.
              commitInsertion(editor, { ...next, src });
            })
            .catch((error: unknown) => {
              extension.options.onError(error);
            })
            .finally(() => {
              insertionsInFlight.delete(editor);
            });

          return true;
        },

      /**
       * Replace a QR code's attributes, addressed by the extension itself.
       *
       * `false` when there is no QR code, when the payload was emptied, or when nothing
       * would change — the last of which keeps a no-op out of the undo history.
       */
      updateQRCode:
        (attrs: QRCodeInput) =>
        ({ editor, state, tr, dispatch }) => {
          const found = findCurrentQRCode(state);
          if (!found) return false;

          const current = normalizeAttrs(found.node.attrs as Partial<QRCodeAttrs>);
          const next = mergeQRCodeAttrs(current, attrs);
          if (sameQRCodeAttrs(current, next)) return false;

          const explicitRaster = typeof attrs.src === "string" && attrs.src.length > 0;
          if (explicitRaster || !rasterInputsChanged(current, next)) {
            if (dispatch) tr.setNodeMarkup(found.pos, undefined, { ...next });
            return true;
          }

          if (next.text.trim().length === 0) return false;
          generateAndApply(editor, found.pos, next, extension.options);
          return true;
        },

      /** Delete the current QR code. `false` when the document has none. */
      removeQRCode:
        () =>
        ({ state, tr, dispatch }) => {
          const found = findCurrentQRCode(state);
          if (!found) return false;
          if (dispatch) tr.delete(found.pos, found.pos + found.node.nodeSize);
          return true;
        },

      /** Redraw the current QR code from its own attributes. */
      regenerateQRCode:
        () =>
        ({ editor, state }) => {
          const found = findCurrentQRCode(state);
          if (!found) return false;

          const attrs = normalizeAttrs(found.node.attrs as Partial<QRCodeAttrs>);
          if (attrs.text.trim().length === 0) return false;

          generateAndApply(editor, found.pos, attrs, extension.options);
          return true;
        },

      /**
       * Move the current QR code by a delta in its own unit.
       *
       * Pure document work — no raster is regenerated, so a drag or a nudge is instant.
       * The offset is clamped at `0` by the attribute normaliser, so a delta that would
       * push the code off the top-left corner stops at the corner instead of vanishing.
       */
      moveQRCode:
        (dx: number, dy: number) =>
        ({ state, tr, dispatch }) => {
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;

          const found = findCurrentQRCode(state);
          if (!found) return false;

          const current = normalizeAttrs(found.node.attrs as Partial<QRCodeAttrs>);
          const next = mergeQRCodeAttrs(current, {
            position: {
              ...current.position,
              x: current.position.x + dx,
              y: current.position.y + dy
            }
          });
          if (sameQRCodeAttrs(current, next)) return false;

          if (dispatch) tr.setNodeMarkup(found.pos, undefined, { ...next });
          return true;
        },

      /**
       * `true` when the document already contains a QR code.
       *
       * Derived from the document, never from a flag — that flag is why the legacy editor
       * could never insert a second code after deleting the first (defect 31). A host uses
       * it to decide between 「插入」 and 「编辑」, not to forbid a second code: a contract
       * may legitimately carry a payment code and a verification code.
       */
      hasQRCode:
        () =>
        ({ state }) =>
          docHasQRCode(state.doc)
    };
  }
});

/** The commands the extension adds. */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    qrcode: {
      /** Insert a QR code. `false` when there is nowhere legal to put one, or no payload. */
      insertQRCode: (attrs?: QRCodeInput) => ReturnType;

      /** Replace the current QR code's attributes. `false` when nothing changed. */
      updateQRCode: (attrs: QRCodeInput) => ReturnType;

      /** Delete the current QR code. `false` when the document has none. */
      removeQRCode: () => ReturnType;

      /** Redraw the current QR code from its attributes. */
      regenerateQRCode: () => ReturnType;

      /** Move the current QR code by `dx`/`dy` in its own unit. */
      moveQRCode: (dx: number, dy: number) => ReturnType;

      /** `true` when the document contains a QR code. Derived, never stored. */
      hasQRCode: () => ReturnType;
    };
  }
}

/** The default export, so `import QRCode from "./qrcode"` also works. */
export default QRCode;
