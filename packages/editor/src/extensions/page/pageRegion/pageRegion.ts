/**
 * `PageRegion`——页眉或页脚的三分之一：左、中或右。
 *
 * 页眉是「左 / 中 / 右，各自可编辑，而页码最多占据其中一个」，扁平的 `block*` 栏一样都表达不了：
 * 三分之一只能作为 CSS 列存在，于是没有任何东西能说明光标在哪一列，页码也只能是文本的兄弟节点而不是
 * *放进*某个槽位的东西。规则归 `utils/regions.ts`，本文件是这个节点。
 *
 * 节点视图只做三件事：说明自己是哪三分之一（`data-slot`）以及属于哪条栏（`data-side`，从父节点
 * 读取，所以一个节点类型同时服务两条栏）；说明自己是否正在被编辑（`is-editing`），靠跟随编辑器的
 * 事务——别的区域成为被编辑的那个时，节点视图自己的 `update` 不会被调用，而样式表需要这个答案来让
 * 光标只有一个家；说明自己是否被锁定（`is-locked`）：放着页码或 Logo 的区域。锁定由内容推导，从不
 * 存储，所以不可能与内容脱节（见 `utils/regions.ts`）。
 *
 * 新建的区域自带一个空段落：`block*` 也接受什么都没有，但没有块的空区域既点不中、也量不到、也输入不
 * 进去，而这正是这项工作最初要解决的「页眉无法编辑」。
 *
 * `PageRegion` — one third of a header or footer: left, centre or right.
 *
 * ## Why this node exists
 *
 * A header is "left / centre / right, each editable, and the page number may occupy exactly one
 * of them". A flat `block*` band can express none of that: the thirds would exist only as CSS
 * columns, so nothing could say which third the caret is in, and the page number would be a
 * sibling of the text rather than something *placed in* a slot. `utils/regions.ts` owns the rules;
 * this file is the node.
 *
 * ## The node view
 *
 * Three jobs, and nothing else:
 *
 * 1. **Say which third it is** (`data-slot`) and which band it belongs to (`data-side`, read from
 *    the parent node, so one node type serves both bands).
 * 2. **Say whether it is being edited** (`is-editing`), by following the editor's transactions —
 *    a node view's own `update` is not called when *another* region becomes the edited one, and
 *    the stylesheet needs that answer to give the caret exactly one home.
 * 3. **Say whether it is locked** (`is-locked`): a region holding the page number or the logo.
 *    Locked is derived from the content, never stored, so it cannot drift out of step with it
 *    (see `utils/regions.ts`).
 *
 * A fresh region starts with one empty paragraph: `block*` also accepts nothing at all, but an
 * empty region with no block is not clickable, not measurable and not typeable-into, which is
 * precisely the "the header cannot be edited" complaint this work started from.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor, NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import {
  DATA_TYPE,
  PAGE_REGION_CLASS,
  PAGE_REGION_CONTENT_CLASS,
  REGION_EDITING_CLASS,
  REGION_LOCKED_CLASS
} from "../constant/dom";
import type { RegionOptions } from "../typing/headerFooter";
import { readFurnitureEditing, sideOfBand } from "../utils/furnitureEditing";
import { PAGE_REGION_NODE } from "../utils/nodes";
import { readSlot, regionIsLocked } from "../utils/regions";

/**
 * 区域既未被锁定也未被编辑时显示的提示。
 *
 * The hint a region shows while it is neither locked nor being edited.
 */
const DEFAULT_HINT = "双击编辑";

/** 被锁定的区域显示的提示。 / The hint a locked region shows. */
const LOCKED_HINT = "此区域已用于页码或 Logo，不可编辑";

/**
 * `pageRegion` 扩展：页眉 / 页脚里承载块的三分之一。
 *
 * The `pageRegion` extension: one third of a header or footer.
 */
export const PageRegion = Node.create<RegionOptions>({
  name: PAGE_REGION_NODE,
  // A member of `block` so a band's content stays `block*`: a template saved before regions
  // existed holds ordinary blocks there, and a schema that refused them would drop the user's
  // header text while parsing instead of migrating it (`utils/regions.ts` normalises the band).
  group: "block",
  content: "block*",
  // A click inside one third must not extend a selection into the next.
  isolating: true,

  addOptions() {
    return {
      slot: "center",
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    return {
      slot: {
        default: this.options.slot ?? "center",
        parseHTML: (element) => element.getAttribute("data-slot"),
        renderHTML: (attributes) => ({ "data-slot": attributes.slot })
      }
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${DATA_TYPE.pageRegion}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes, {
        class: PAGE_REGION_CLASS,
        "data-type": DATA_TYPE.pageRegion
      }),
      0
    ];
  },

  addNodeView() {
    const hint = this.options.HTMLAttributes?.["data-hint"] ?? DEFAULT_HINT;
    return renderRegionNodeView(hint);
  }
});

/** 区域节点视图。 / The region node view. */
function renderRegionNodeView(hint: string): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    const dom = document.createElement("div");
    dom.className = PAGE_REGION_CLASS;
    dom.setAttribute("data-type", DATA_TYPE.pageRegion);

    const content = document.createElement("div");
    content.className = PAGE_REGION_CONTENT_CLASS;
    dom.appendChild(content);

    /**
     * 反映编辑状态：最多只能有一个区域处于 `is-editing`。
     *
     * Reflect the editing state: exactly one region may be `is-editing`.
     */
    const applyEditing = (): void => {
      const editing = readFurnitureEditing(editor.state);
      const mine =
        editing !== null && editing.side === dom.dataset.side && editing.slot === dom.dataset.slot;
      dom.classList.toggle(REGION_EDITING_CLASS, mine);
    };

    const apply = (current: PMNode): void => {
      const slot = readSlot(current.attrs.slot);
      dom.dataset.slot = slot;

      // The band's side comes from the parent node, so one node type serves both bands and a
      // region can never claim a side its band does not have.
      const parent = parentBand(editor, getPos());
      const side = parent ? sideOfBand(parent) : null;
      if (side) dom.dataset.side = side;
      else delete dom.dataset.side;

      const locked = regionIsLocked(current);
      dom.classList.toggle(REGION_LOCKED_CLASS, locked);
      dom.setAttribute("data-hint", locked ? LOCKED_HINT : hint);

      applyEditing();
    };

    // The editing state lives in a plugin, and a node view's `update` is only called for its own
    // node — so a region that is *not* the edited one has to follow the editor's transactions to
    // learn that it should stop highlighting.
    const onTransaction = (): void => applyEditing();
    editor.on("transaction", onTransaction);
    apply(node);

    return {
      dom,
      contentDOM: content,
      update: (updated: PMNode) => {
        if (updated.type.name !== PAGE_REGION_NODE) return false;
        apply(updated);
        return true;
      },
      destroy: () => {
        editor.off("transaction", onTransaction);
      },
      ignoreMutation: (mutation) => !content.contains(mutation.target)
    };
  };
}

/**
 * 容纳本区域的栏节点；位置不再能解析时为 `null`。
 *
 * The band node holding this region, or `null` when the position no longer resolves.
 */
function parentBand(editor: Editor, pos: number | undefined): PMNode | null {
  if (pos === undefined) return null;
  try {
    return editor.state.doc.resolve(pos).parent;
  } catch {
    // A node view can be asked to render while its position is being remapped by a transaction.
    return null;
  }
}

/**
 * 区域内容里是否有页码或 Logo（也就是该区域是否被锁定）。
 *
 * Whether a region's content holds a page number or a logo (i.e. the region is locked).
 */
function holdsLocked(node: PMNode): boolean {
  return regionIsLocked(node);
}
