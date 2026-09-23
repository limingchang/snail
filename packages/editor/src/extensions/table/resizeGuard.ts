/**
 * 表格列宽拖动的收尾保险。
 *
 * ## 症状
 *
 * 拖动一次列宽之后，整块编辑器都变成宽度调整的光标，再也拖不动第二列 —— 页面看起来卡住了。
 *
 * ## 原因
 *
 * 列宽拖动由 `prosemirror-tables` 的 `columnResizing` 插件负责，它把「正在拖哪一列」记在**插件状态**
 * 里：`mousedown` 时写入 `dragging`，然后自己在 `window` 上挂一个 `mouseup` 监听，在那个监听里先按
 * 拖动量改文档、再把 `dragging` 清掉。
 *
 * 而这一次 `updateColumnWidth` 用的是 `mousedown` 当时记下的**绝对位置**。本编辑器的自动分页会在
 * 后台直接搬动文档内容（那是它的职责），位置一旦变了，`updateColumnWidth` 就会解析到别的地方甚至
 * 抛错 —— 而它抛错的地方正好在「清掉 dragging」**之前**。于是：
 *
 * - `dragging` 永远留着，后续 `mousedown` 一开头就返回 `false`，再也开不了第二次拖动；
 * - 插件为每一列画的 `.column-resize-handle` 与 `column-resize-dragging` 装饰也留着，鼠标移到
 *   表格上就是宽度调整光标。
 *
 * ## 修法的两半
 *
 * 1. 分页在拖动期间**不动文档**（见 `pageContent/paginator.ts` 的 `isDraggingColumn`）：掐掉产生过期
 *    位置的那个源头。
 * 2. 这里兜底：一次 `mouseup` 之后的**下一个宏任务**里检查 `dragging` 是否还留着 —— 正常的拖动在那
 *    之前已经自己清掉了，还留着就说明上面那条路径失败了，于是替它清掉。用宏任务而不是在事件处理里
 *    直接清，是因为浏览器的 `window` 监听（也就是插件自己的收尾）要在这个事件冒泡到 window 之后才跑。
 *
 * A safety net for the end of a table column drag.
 *
 * ## The symptom
 *
 * After one column-width drag the whole editor shows the resize cursor and no second column can be dragged
 * — the page looks stuck.
 *
 * ## The cause
 *
 * Column resizing belongs to `prosemirror-tables`' `columnResizing` plugin, which keeps "which column is
 * being dragged" in its **plugin state**: `mousedown` writes `dragging`, and a `mouseup` listener the
 * plugin installs on `window` first applies the new width to the document and then clears `dragging`.
 *
 * That `updateColumnWidth` works from the **absolute position** captured at `mousedown`. This editor's
 * automatic pagination moves document content in the background — which is its job — so once positions
 * shift, `updateColumnWidth` resolves the wrong thing or throws, and where it throws is *before* the line
 * that clears `dragging`. The result:
 *
 * - `dragging` stays set, every later `mousedown` returns `false` immediately, and no second drag can
 *   start;
 * - the `.column-resize-handle` and `column-resize-dragging` decorations the plugin draws for every column
 *   stay on screen, so the pointer over the table is the resize cursor.
 *
 * ## The two halves of the fix
 *
 * 1. Pagination does not touch the document while a drag is in flight (see `isDraggingColumn` in
 *    `pageContent/paginator.ts`), which removes the source of the stale position.
 * 2. This file is the net: in the **next macrotask** after a `mouseup`, check whether `dragging` is still
 *    set. A normal drag has cleared it by then; if it is still set, that path failed and this clears it. A
 *    macrotask rather than clearing inside the handler, because the browser's `window` listener — the
 *    plugin's own finish — only runs once the event has bubbled to `window`.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { columnResizingPluginKey } from "@tiptap/pm/tables";

/**
 * 列宽拖动期间 `prosemirror-tables` 给被拖动单元格加的类。
 *
 * The class `prosemirror-tables` puts on the cells of a column that is being dragged.
 */
export const COLUMN_RESIZE_DRAGGING_CLASS = "column-resize-dragging";

/**
 * 是否正在拖动表格列宽。
 *
 * 从 DOM 读而不是去问插件状态：拖动期间那个类就挂在单元格上，而分页这一层只需要知道「现在有一个
 * 旷日持久的指针交互在进行，别动文档」，不需要认识表格扩展的状态形状。
 *
 * Whether a table column is being dragged right now.
 *
 * Read from the DOM rather than from the plugin state: the class is on the cells for exactly as long as
 * the drag lasts, and the pagination layer only needs to know "a long-lived pointer interaction is in
 * flight, do not touch the document" — it has no business knowing the table extension's state shape.
 */
export function isDraggingColumn(view: EditorView): boolean {
  return view.dom.querySelector(`.${COLUMN_RESIZE_DRAGGING_CLASS}`) !== null;
}

/**
 * 插件状态里是否还挂着一次没有收尾的拖动。
 *
 * 中文：`prosemirror-tables` 用 `dragging: false` 表示「没在拖」（不是 `null`），所以这里必须
 * 按真假判断，而不是判空 —— 否则每个健康的状态都会被当成卡住。
 *
 * Whether the plugin state still holds a drag that never finished.
 *
 * `prosemirror-tables` says "not dragging" with `dragging: false` (not `null`), so this has to test
 * truthiness rather than nullishness — otherwise every healthy state looks stuck.
 */
export function hasUnfinishedResize(state: EditorState): boolean {
  const value = columnResizingPluginKey.getState(state) as { dragging?: unknown } | undefined;
  return Boolean(value?.dragging);
}

/**
 * 替一次失败的收尾清掉拖动状态；确实清了才返回 `true`。
 *
 * Clear the drag state of a finish that failed; `true` only when something was cleared.
 */
export function endUnfinishedResize(view: EditorView): boolean {
  if (view.isDestroyed || !hasUnfinishedResize(view.state)) return false;

  view.dispatch(
    view.state.tr
      .setMeta(columnResizingPluginKey, { setDragging: null })
      // Housekeeping, not an edit: it must not become an undo step.
      .setMeta("addToHistory", false)
  );
  return true;
}

/** `tableResizeGuard` 扩展。 / The `tableResizeGuard` extension. */
export const TableResizeGuard = Extension.create({
  name: "tableResizeGuard",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("snailTableResizeGuard"),

        props: {
          handleDOMEvents: {
            /**
             * 松手之后（下一个宏任务）检查一次。
             *
             * `scheduleEnd` 可以被调用多次：同一轮里只有第一次真的会做事，因为第一次之后 `dragging`
             * 已经是 `null`。
             *
             * Check once, in the macrotask after the button came up.
             *
             * `scheduleEnd` may be called repeatedly: only the first call in a round does anything, because
             * by then `dragging` is already `null`.
             */
            mouseup: (view) => {
              scheduleEnd(view);
              // Never swallow the event: the plugin's own `window` handler and the browser's default
              // behaviour both still have to run.
              return false;
            }
          }
        }
      })
    ];
  }
});

/** 下一个宏任务里收尾。 / Finish in the next macrotask. */
function scheduleEnd(view: EditorView): void {
  setTimeout(() => {
    endUnfinishedResize(view);
  }, 0);
}

export default TableResizeGuard;
