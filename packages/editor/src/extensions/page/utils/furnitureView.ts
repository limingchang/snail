/**
 * 页眉 / 页脚的节点视图，两侧共用。
 *
 * ## `contentEditable` 被刻意保持不动
 *
 * 旧版视图在它作为 `contentDOM` 返回的**同一个**元素上设置了 `contentEditable = "false"`
 * （缺陷 19）。于是 ProseMirror 得到一个被告知「不可编辑」的可编辑区域：光标能进去，
 * 但输入事件到不了编辑器。
 *
 * 这里 `dom` 是外框，`contentDOM` 是 ProseMirror 完全掌控的内层元素。两者都可编辑，
 * 而外框的高度和分隔线属于样式，不属于内容。
 *
 * ## 对齐方式去了哪里
 *
 * 这个视图以前会根据条带的 `align` 属性写 `dom.style.textAlign`。现在一个条带是三个区域，
 * 每个区域有自己的对齐方式（`SLOT_ALIGN`），所以外框上的一个 `text-align` 只会与它们
 * 矛盾；改由样式表对齐左、中、右三格。
 *
 * The header/footer node view, shared by both sides.
 *
 * ## `contentEditable` is deliberately left alone
 *
 * The legacy view set `contentEditable = "false"` on the *same* element it returned as
 * `contentDOM` (defect 19). ProseMirror then had an editable region it had been told was
 * not editable: the caret could enter, but input events did not reach the editor.
 *
 * Here `dom` is the box and `contentDOM` is an inner element that ProseMirror owns
 * completely. Both are editable, and the box's height and rule are style, not content.
 *
 * ## Where the alignment went
 *
 * This view used to write `dom.style.textAlign` from the band's `align` attribute. A band is three
 * regions now, each with its own alignment (`SLOT_ALIGN`), so one `text-align` on the box could
 * only contradict them; the stylesheet aligns the left, centre and right thirds instead.
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
import { DEFAULT_FURNITURE_HEIGHT, DEFAULT_FURNITURE_LINE } from "../constant/defaults";
import { readBoolean, readNumber } from "./attributes";
import type { FurnitureSide } from "../typing/headerFooter";

/** `side` 那一侧的页眉或页脚节点视图。 / The header or footer node view for `side`. */
export function renderFurnitureNodeView(side: FurnitureSide): NodeViewRenderer {
  const boxClass = side === "top" ? PAGE_HEADER_CLASS : PAGE_FOOTER_CLASS;
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

function readShowLine(node: PMNode): boolean {
  return readBoolean(node.attrs.showLine, DEFAULT_FURNITURE_LINE);
}
