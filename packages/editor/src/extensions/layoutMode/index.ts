/**
 * `layoutMode` 扩展 —— 用于分栏定位的无边框「布局表格」。
 *
 * ## 它做什么
 *
 * `layoutMode: true` 的表格会带着 `data-layout="true"` 和一个类名渲染，这样主题就能去掉*数据*
 * 表格需要的边框、单元格内边距和表头样式。这种表格的每一行也会被标记，这正是行级规则（无边框、
 * 无背景）得以跟着生效的前提。
 *
 * ## 真正要紧的那一处修复
 *
 * 旧的 `fixLayoutTable` 从 `onUpdate` 内部派发事务，于是每一次文档编辑都产生
 * `onUpdate → dispatch → onUpdate`，外加一次带着过期局部变量的多余全文档遍历。这里的 pass 先
 * 收集需要标记的内容，**只派发一次**，在无事可做时直接返回、根本不构造事务。它的运行时机是：
 *
 * - `onCreate` 里，这样从 HTML 载入、行上缺少标记的文档会在打开时被修好一次 —— 旧版本从不修复
 *   已经载入的文档；
 * - `onUpdate` 里，但只针对真正改变了文档的事务（只改选区的事务不可能动到这个标记）；
 * - 绝不针对它自己的事务，那个事务带着 {@link LAYOUT_MODE_META}。
 *
 * 这个 pass 是 `addToHistory: false` 的：该标记是派生出来的簿记，一次 Ctrl+Z 应当反转用户的
 * 编辑，而不是反转紧随其后的簿记。
 *
 * ## 没有命令
 *
 * 没什么可命令的：UI 用 Tiptap 自己的 `updateAttributes` 切换表格，它会找到光标所在的表格。
 * 再加一条 `setLayoutMode` 命令只会是同一件事的第二种做法。
 *
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

/**
 * 重新导出契约与纯函数 pass，让使用方只需一处导入。
 *
 * Re-export the contract and the pure pass, so a host has one import.
 */
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
 * 给标记各行的那次事务打上标签。
 *
 * 两个作用：让这个 pass 不进入撤销历史，以及阻止它自我重入 —— 嵌套的 `onUpdate` 看到该标记就
 * 立即返回。没有它，第二遍仍然找不到要改的东西（旧循环之所以能终止正是因为这一点），但会再
 * 遍历一次文档。
 *
 * Tags the transaction that marks the rows.
 *
 * Two jobs: it keeps the pass out of the undo history, and it is what stops the pass from
 * re-entering itself — the nested `onUpdate` sees the flag and returns immediately. Without
 * it the second pass would still find nothing to change (which is why the legacy loop
 * terminated at all) but would have walked the document again.
 */
const LAYOUT_MODE_META = "sEditorLayoutModeFixes";

/**
 * 为一个编辑器运行一次该 pass。
 *
 * Run the pass once for an editor.
 *
 * @returns 派发了一个事务时为 `true` / `true` when a transaction was dispatched.
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

/** `layoutMode` 扩展。 / The `layoutMode` extension. */
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
           * 默认 `false`，所以普通表格不携带任何东西。
           *
           * 用 `false` 而不是 `null`：这个值是布尔值，而主题的钩子是该属性是否存在，所以
           * 「不是布局表格」是一个真实状态，而不是缺失状态。
           *
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

/**
 * 默认导出，因此 `import LayoutMode from "./layoutMode"` 同样可用。
 *
 * The default export, so `import LayoutMode from "./layoutMode"` also works.
 */
export default LayoutMode;
