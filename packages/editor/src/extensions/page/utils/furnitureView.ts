/**
 * The header/footer node view, shared by both sides.
 *
 * ## `contentEditable` is deliberately left alone
 *
 * The legacy view set `contentEditable = "false"` on the *same* element it returned as
 * `contentDOM` (defect 19). ProseMirror then had an editable region it had been told was
 * not editable: the caret could enter, but input events did not reach the editor.
 *
 * Here `dom` is the box and `contentDOM` is an inner element that ProseMirror owns
 * completely. Both are editable, and the box's height/alignment are style, not content.
 */

import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import {
  DATA_TYPE,
  FURNITURE_CONTENT_CLASS,
  FURNITURE_LINE_CLASS,
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS
} from "../constant/dom";
import {
  DEFAULT_FOOTER_ALIGN,
  DEFAULT_FURNITURE_HEIGHT,
  DEFAULT_FURNITURE_LINE,
  DEFAULT_HEADER_ALIGN
} from "../constant/defaults";
import { readBoolean, readNumber, readTextAlign } from "./attributes";
import type { FurnitureSide, TextAlign } from "../typing/headerFooter";

/** The header or footer node view for `side`. */
export function renderFurnitureNodeView(side: FurnitureSide): NodeViewRenderer {
  const boxClass = side === "top" ? PAGE_HEADER_CLASS : PAGE_FOOTER_CLASS;
  const defaultAlign = side === "top" ? DEFAULT_HEADER_ALIGN : DEFAULT_FOOTER_ALIGN;
  const dataType = side === "top" ? DATA_TYPE.pageHeader : DATA_TYPE.pageFooter;

  return ({ node }) => {
    const dom = document.createElement("div");
    dom.className = boxClass;
    dom.setAttribute("data-type", dataType);

    const content = document.createElement("div");
    content.className = FURNITURE_CONTENT_CLASS;
    dom.appendChild(content);

    const apply = (current: PMNode): void => {
      // Read the *node*, never `extension.options`: that mistake is defect 20 (per-node
      // heights were silently ignored because the view read the extension default).
      dom.style.height = `${readHeight(current)}px`;
      dom.style.textAlign = readAlign(current, defaultAlign);
      dom.classList.toggle(FURNITURE_LINE_CLASS, readShowLine(current));
    };
    apply(node);

    return {
      dom,
      contentDOM: content,
      update: (updated) => {
        if (updated.type !== node.type) return false;
        apply(updated);
        return true;
      },
      destroy: () => {
        // No timers and no listeners: the legacy header view inserted its text from a
        // `setTimeout` that was never cleared, so it could fire after teardown.
      },
      ignoreMutation: (mutation) => !content.contains(mutation.target)
    };
  };
}

function readHeight(node: PMNode): number {
  return Math.max(0, readNumber(node.attrs.height, DEFAULT_FURNITURE_HEIGHT));
}

function readAlign(node: PMNode, fallback: TextAlign): TextAlign {
  return readTextAlign(node.attrs.align, fallback);
}

function readShowLine(node: PMNode): boolean {
  return readBoolean(node.attrs.showLine, DEFAULT_FURNITURE_LINE);
}
