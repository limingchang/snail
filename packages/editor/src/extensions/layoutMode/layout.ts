/**
 * `layoutMode` 的文档遍历 pass —— 纯函数。
 *
 * ## 它替换掉的 bug
 *
 * 旧的 `fixLayoutTable` 从扩展的 `onUpdate` 里调用，并且每当有一行缺少标记时就从同一个事件里
 * 派发一个事务：
 *
 * ```text
 * onUpdate → dispatch → onUpdate → dispatch → …
 * ```
 *
 * 它之所以会终止，只是因为第二遍已经找不到要改的东西，于是每一次文档编辑都要多付一次全文档遍历
 * *和*一次额外派发，而嵌套的派发还带着第一次派发被应用之前捕获的局部变量重新进入。
 *
 * 替代方案是一个幂等的 pass：收集需要标记的位置，带着重入标记派发**一次**，收集结果为空时提前
 * 返回 —— 这样一个表格都已被标记的文档只需一次遍历、零次事务。
 *
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

/** 布局表格/行渲染出的属性。 / The attribute a layout table/row renders into. */
export const LAYOUT_MODE_ATTRIBUTE = "data-layout";

/** 让一个表格成为布局表格的节点类型。 / The node type that makes a table a layout table. */
export const LAYOUT_MODE_TABLE = "table";

/** 行的节点类型。 / The node type of a row. */
export const LAYOUT_MODE_ROW = "tableRow";

/**
 * {@link LAYOUT_MODE_ATTRIBUTE} 被写入的取值。
 *
 * The value {@link LAYOUT_MODE_ATTRIBUTE} is written with.
 */
export const LAYOUT_MODE_VALUE = "true";

/**
 * 读取 {@link LAYOUT_MODE_ATTRIBUTE}。
 *
 * `""`（裸的 `data-layout` 属性，HTML 作者会这么写，而且在其他任何检查属性的惯用法里都为真）
 * 也算已设置；只有显式的 `"false"`/`"0"` 不算。
 *
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
 * 声明该属性的节点类型。
 *
 * `table` 总是被包含，且结果会去重，所以传入 `["tableRow", "table"]` 的调用方不会在 `table` 上
 * 把该属性声明两次 —— 那会让 Tiptap 视版本不同而静默合并或直接拒绝。
 *
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
 * 属于布局表格但尚未被标记的每一个 `tableRow`。
 *
 * 只考虑表格的**直接**行。`node.descendants` 还会触达嵌在单元格里的普通表格的行，把外层表格的
 * 标记盖到那些行上会静默地把一个数据表格变成布局表格 —— 这正是旧实现的 bug，因为它用
 * `node.descendants` 遍历行。
 *
 * 外层遍历会继续下探，所以嵌在普通表格里的布局表格仍会被找到，并带上它自己的绝对位置。
 *
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
 * @returns 按文档顺序的绝对位置；无需改动时为空。 /
 *   the absolute positions, in document order. Empty when nothing needs changing.
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

/**
 * 文档里任何一个表格是布局表格时为 `true`。
 *
 * `true` when any table in the document is a layout table.
 */
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
