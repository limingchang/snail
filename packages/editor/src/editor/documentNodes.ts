/**
 * 读取与写入文档的结构性节点。
 *
 * 一个要显示页面设置、页码样式或二维码尺寸的面板必须从**文档**里读，而不是从扩展的选项里
 * 读。旧页面面板保留了自己的一份局部 `pageSettings`，从不根据文档初始化（缺陷 42），于是
 * 它对一个设置完全不同的页面显示出 Word 的默认值，而它的第一次编辑就把页面静默地重置成
 * 那些默认值。读模型才是修复；扩展的选项只是*初始*值。
 *
 * ## 为什么这里不用 `updateAttributes`
 *
 * Tiptap 的 `updateAttributes(type, attrs)` 只作用于当前选区内的节点。一个改动「页码格式」
 * 的面板意味着**每一页**，而光标位于页面*内容*里 —— 不在页脚节点上 —— 所以那条命令会静默
 * 地什么都不做。这与缺陷 22 是同一类 bug（一次只有在 `NodeSelection` 恰好落在节点上时才
 * 生效的变量编辑）。这里的一切都在一个 transaction 里按位置寻址节点。
 *
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

/**
 * 文档里找到的一个节点，附带它*起点*的位置。
 *
 * One node found in the document, with the position of its *start*.
 */
export interface DocumentNode {
  /**
   * 节点之前的位置，正是 `setNodeMarkup` 与 `delete` 想要的。
   *
   * The position before the node, which is what `setNodeMarkup` and `delete` want.
   */
  pos: number;

  /** 节点的属性，按存储的样子。 / The node's attributes, as stored. */
  attrs: Record<string, unknown>;
}

/**
 * 文档里某个类型的全部节点，按文档顺序。
 *
 * Every node of a type in the document, in document order.
 */
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

/** 某个类型的第一个节点，或 `undefined`。 / The first node of a type, or `undefined`. */
export function findFirstNode(editor: Editor | undefined, typeName: string): DocumentNode | undefined {
  return findNodes(editor, typeName)[0];
}

/**
 * 当 schema 含有某个节点类型时为 `true`，这样面板永远不会调用不存在的命令。
 *
 * `true` when the schema contains a node type, so a panel never calls a missing command.
 */
export function hasNodeType(editor: Editor | undefined, typeName: string): boolean {
  return editor?.schema.nodes[typeName] !== undefined;
}

/**
 * 把属性合并进某个类型的每一个节点。
 *
 * ProseMirror 自己的 `computeAttrs` 会丢掉不认识的属性名，所以一个猜错名字的面板是空操作，
 * 而不是破坏。因此调用方可以写 `{ height }`，无需知道页面扩展把它拼成 `height` 还是
 * `ling`。
 *
 * Merge attributes into every node of a type.
 *
 * Unknown attribute names are dropped by ProseMirror's own `computeAttrs`, so a panel
 * that guesses a name the extension does not declare is a no-op rather than a
 * corruption. That is why the callers can write `{ height }` without knowing whether the
 * page extension spells it `height` or `ling`.
 *
 * @returns 有多少个节点被改动，这样调用方能在无事可做时告诉用户，而不是假装成功了 /
 * how many nodes were changed, so a caller can tell the user when there was
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

/** 从某个类型的第一个节点读一个属性。 / Read one attribute from the first node of a type. */
export function readNodeAttribute(
  editor: Editor | undefined,
  typeName: string,
  attribute: string
): unknown {
  return findFirstNode(editor, typeName)?.attrs[attribute];
}

/**
 * 在若干个候选属性名中读出第一个有值的。
 *
 * 页面扩展的地区属性拼法并不属于公开契约（缺陷 20 正是 `headerLine` 与 `headerLing` 之间
 * 的拼写漂移），所以面板会把每一种合理拼法都读一遍，而不是对一个确实配置过的页面显示出
 * 空控件。
 *
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

/**
 * 文档的页面几何参数，即 page 节点所持有的样子。
 *
 * The document's page geometry, as the page node holds it.
 */
export interface DocumentPageSetup {
  /** 纸张格式。 / The paper format. */
  paperFormat?: unknown;
  /** 纸张方向。 / The paper orientation. */
  orientation?: unknown;
  /** 页边距。 / The margins. */
  margins?: unknown;
}

/**
 * 从第一个 `page` 节点读出的页面几何参数。每个字段都可能缺失。
 *
 * Page geometry read from the first `page` node. Every field may be absent.
 */
export function readDocumentPageSetup(editor: Editor | undefined): DocumentPageSetup {
  const attrs = findFirstNode(editor, "page")?.attrs;
  return {
    paperFormat: attrs?.paperFormat,
    orientation: attrs?.orientation,
    margins: attrs?.margins
  };
}

/**
 * 当前使用的页码样式。
 *
 * 一个 `pageNumber` 节点的 `format`，从文档里第一个页码读出。旧面板提供三个硬编码的预设，
 * 并把*所选预设的下标*写进一个页脚属性，于是一份带着自定义样式打开的文档会显示第一个
 * 预设。
 *
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
