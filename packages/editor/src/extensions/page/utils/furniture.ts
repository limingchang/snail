/**
 * 页眉 / 页脚扩展的工厂。
 *
 * 旧版包里 `PageHeader` 与 `PageFooter` 有约 95% 相同，而这两份拷贝逐渐分叉：一个里属性叫
 * `headerLing`，另一个里选项叫 `headerLine`，并且各自带着自己那份位置已失效的刷新命令
 * （缺陷 11）。这里只有一份实现和两个名字。
 *
 * ## 一个条带由三个区域组成
 *
 * `content: "block*"` 而不是 `"pageRegion*"` 是刻意的。在区域存在之前保存的模板会把普通块
 * 直接放在页眉里，而拒绝它们的 schema 会在解析时**丢掉用户的文字**，而不是迁移它。
 * `pageRegion` 是 `block` 组的成员，因此两种形状都合法，而「恰好三个区域、按槽位顺序」这一
 * 不变式由 `../page.ts` 里的规范化流程恢复（见 `utils/regions.ts`）。
 *
 * ## 顺序规则（缺陷 11）
 *
 * 当一次事务里要改动多个页面时，页面按**从后往前**的顺序访问。插入或删除页眉会移动
 * 它之后的所有位置，所以升序遍历会拼接出失效的位置——这正是旧版 `__flush*` 命令造成的
 * 破坏。降序访问可以让所有尚未访问的位置保持有效。
 *
 * ## 条带插入的位置（缺陷 43）
 *
 * 页眉插在正文**之前**，页脚插在正文**之后**。这不是细节：页面的内容表达式是一个
 * 序列（`pageHeader? pageContent pageFooter?`），而两者都插到 `page.pos + 1`——
 * 第一版的做法——会生成页脚在页眉之上的结果，那不是文档。
 *
 * The header/footer extension factory.
 *
 * `PageHeader` and `PageFooter` were ~95 % identical in the legacy package, and the two
 * copies drifted: the attribute was `headerLing` in one and the option `headerLine` in
 * the other, and both had their own stale-position flush command (defect 11). Here there
 * is exactly one implementation and two names.
 *
 * ## A band is three regions
 *
 * `content: "block*"` rather than `"pageRegion*"` on purpose. A template saved before regions
 * existed holds ordinary blocks directly in its header, and a schema that refused them would
 * **drop the user's text while parsing** instead of migrating it. `pageRegion` is a member of the
 * `block` group, so both shapes are legal, and the invariant — exactly three regions, in slot
 * order — is restored by the normaliser in `../page.ts` (see `utils/regions.ts`).
 *
 * ## Ordering rule (defect 11)
 *
 * Whenever several pages are mutated in one transaction, the pages are visited **last to
 * first**. Inserting or deleting a header shifts every position after it, so an ascending
 * loop would splice stale positions — the corruption the legacy `__flush*` commands
 * produced. Descending visits leave all not-yet-visited positions valid.
 *
 * ## Where a band is inserted (defect 43)
 *
 * A header goes **before** the body and a footer **after** it. That is not a detail: the page's
 * content expression is a sequence (`pageHeader? pageContent pageFooter?`), and inserting both at
 * `page.pos + 1` — as the first version did — produced a footer above a header, which is not a
 * document.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";

import { DEFAULT_FURNITURE_HEIGHT, DEFAULT_FURNITURE_LINE } from "../constant/defaults";
import type { FurnitureAttributes, FurnitureSide } from "../typing/headerFooter";
import { FURNITURE_META } from "./furnitureEditing";
import type { FurnitureMeta } from "./furnitureEditing";
import { renderFurnitureNodeView } from "./furnitureView";
import {
  collectPages,
  findChild,
  PAGE_CONTENT_NODE,
  PAGE_FOOTER_NODE,
  PAGE_HEADER_NODE
} from "./nodes";
import type { PageRef } from "./nodes";
import { createRegionNodes, planBandRegions } from "./regions";

/**
 * 版面配件扩展的已解析选项。`side` 是内部字段：它决定用哪个名字。
 *
 * Resolved options of a furniture extension. `side` is internal: it selects the name.
 */
interface FurnitureOptions {
  side: FurnitureSide;
  height: number;
  showLine: boolean;
  HTMLAttributes: Record<string, string>;
}

/** 一侧贡献的名字集合。 / The names one side contributes. */
interface FurnitureNames {
  node: string;
  dataType: string;
  add: string;
  remove: string;
  height: string;
}

const NAMES: Record<FurnitureSide, FurnitureNames> = {
  top: {
    node: PAGE_HEADER_NODE,
    dataType: "page-header",
    add: "addHeader",
    remove: "removeHeader",
    height: "setHeaderHeight"
  },
  bottom: {
    node: PAGE_FOOTER_NODE,
    dataType: "page-footer",
    add: "addFooter",
    remove: "removeFooter",
    height: "setFooterHeight"
  }
};

/**
 * 创建页眉（`side: "top"`）或页脚（`side: "bottom"`）扩展。
 *
 * 两者都是 `isolating` 的，因此在页眉内部的点击绝不会把选区扩展到它之外；两者也都容忍
 * 没有它们的页面——这是旧版 `createPage` 根本无法构建的状态（缺陷 9）。
 *
 * Create the header (`side: "top"`) or footer (`side: "bottom"`) extension.
 *
 * Both are `isolating`, so a click inside the header never extends a selection out of it,
 * and both tolerate a page without them — the state the legacy `createPage` could not
 * build at all (defect 9).
 */
export function createPageFurniture(side: FurnitureSide): Node<FurnitureOptions> {
  const names = NAMES[side];

  return Node.create<FurnitureOptions>({
    name: names.node,
    group: "page",
    content: "block*",
    isolating: true,

    addOptions() {
      return {
        side,
        height: DEFAULT_FURNITURE_HEIGHT,
        showLine: DEFAULT_FURNITURE_LINE,
        HTMLAttributes: {}
      };
    },

    addAttributes() {
      return {
        height: { default: this.options.height },
        // One spelling, attribute and option alike (defect 20). A stored template may still carry
        // the legacy `align` attribute: it is simply not declared any more, so ProseMirror drops
        // it — a band's alignment is per region now (`SLOT_ALIGN`).
        showLine: { default: this.options.showLine }
      };
    },

    parseHTML() {
      return [{ tag: `div[data-type="${names.dataType}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          "data-type": names.dataType
        }),
        0
      ];
    },

    addNodeView() {
      return renderFurnitureNodeView(side);
    },

    addCommands() {
      const defaults: FurnitureAttributes = {
        height: this.options.height,
        showLine: this.options.showLine
      };

      if (side === "top") {
        return {
          addHeader: (pageIndex?: number) => (props: CommandProps) =>
            addFurniture(props, names, defaults, pageIndex),
          removeHeader: (pageIndex?: number) => (props: CommandProps) =>
            removeFurniture(props, names, pageIndex),
          setHeaderHeight: (height: number, pageIndex?: number) => (props: CommandProps) =>
            setFurnitureHeight(props, names, height, pageIndex)
        };
      }

      return {
        addFooter: (pageIndex?: number) => (props: CommandProps) =>
          addFurniture(props, names, defaults, pageIndex),
        removeFooter: (pageIndex?: number) => (props: CommandProps) =>
          removeFurniture(props, names, pageIndex),
        setFooterHeight: (height: number, pageIndex?: number) => (props: CommandProps) =>
          setFurnitureHeight(props, names, height, pageIndex)
      };
    }
  });
}

/**
 * 页眉扩展（`pageHeader` + `addHeader`/`removeHeader`/…）。
 *
 * The header extension (`pageHeader` + `addHeader`/`removeHeader`/…).
 */
export const PageHeader = createPageFurniture("top");

/**
 * 页脚扩展（`pageFooter` + `addFooter`/`removeFooter`/…）。
 *
 * The footer extension (`pageFooter` + `addFooter`/`removeFooter`/…).
 */
export const PageFooter = createPageFurniture("bottom");

/**
 * 确保某个页面有 `side` 这一侧的条带，缺失时创建它（连同它的三个区域）。
 *
 * 它被 `addHeader`/`addFooter` 以及放置类命令 `setPageNumberSlot` 与 `setLogo` 共用，
 * 因为在没有页脚的文档上「把页码放到页脚」应当*创建*页脚而不是失败。这正是这轮修复的
 * 出发点：用户通过选择「放在哪里」来表达他需要承载它的版面配件。
 *
 * Make sure one page has the band for `side`, creating it (with its three regions) when missing.
 *
 * Shared by `addHeader`/`addFooter` and by the placements — `setPageNumberSlot` and `setLogo` —
 * because "put the number in the footer" on a document that has no footer should *create* the
 * footer rather than fail. That is the whole point of the fix this work started from: choosing
 * where something goes is how the user asks for the furniture that holds it.
 *
 * @returns 插入了一个条带时为 `true` / `true` when a band was inserted.
 */
export function ensureBand(
  transaction: Transaction,
  page: PageRef,
  side: FurnitureSide,
  schema: Schema,
  attributes: FurnitureAttributes
): boolean {
  const names = NAMES[side];
  const nodeType = schema.nodes[names.node];
  if (!nodeType) return false;
  if (findChild(page, names.node)) return false;

  const band = nodeType.create(attributes, emptyFurnitureContent(schema));
  transaction.insert(furnitureInsertPos(page, names.node), band);
  return true;
}

/** 某一侧条带的节点类型名。 / The node type name of a band's side. */
export function bandNodeName(side: FurnitureSide): string {
  return NAMES[side].node;
}

/**
 * 让每个条带始终保持恰好三个可用区域的插件。
 *
 * ## 为什么用插件而不只是一个命令
 *
 * 条带的内容表达式刻意是 `block*`：在区域出现之前保存的模板会在页眉里放普通块，
 * 而拒绝它们的 schema 会在解析时丢掉用户的文字，而不是迁移它。这种容忍的代价是不变式
 * 必须在某处恢复——而 `appendTransaction` 是唯一能看到*每一个*文档的地方，无论文档
 * 从何而来：一次粘贴、调用方自己的 `setContent`，还是从服务器载入的模板。
 *
 * ## 它做什么，以及刻意不做什么
 *
 * 它会补上缺失的区域、把散落的块包进中间那个区域、把重复的槽位合并进它的第一个区域、
 * 按左 / 中 / 右重排，并给被清空的区域一个新的段落（没有块的区域无法点击进入）。
 * 除此之外它绝不改动区域的*内容*，而且它是幂等的：已经满足不变式的条带完全不产生事务，
 * 所以每个条带每次变更只花一次比较。
 *
 * The plugin that keeps every band at exactly three usable regions.
 *
 * ## Why a plugin and not only a command
 *
 * A band's content expression is `block*`, on purpose: a template saved before regions existed
 * holds ordinary blocks in its header, and a schema that refused them would drop the user's text
 * while parsing rather than migrating it. The price of that tolerance is that the invariant has to
 * be restored somewhere — and `appendTransaction` is the one place that sees *every* document,
 * whatever produced it: a paste, a consumer's own `setContent`, a template loaded from a server.
 *
 * ## What it does, and what it deliberately does not
 *
 * It adds the missing regions, wraps stray blocks into the centre one, folds a duplicated slot
 * into its first region, reorders to left / centre / right, and gives an emptied region a fresh
 * paragraph (a region with no block cannot be clicked into). It never touches a region's *content*
 * otherwise, and it is idempotent: a band that already satisfies the invariant produces no
 * transaction at all, so this costs one comparison per band per change.
 */
export function createFurnitureRegionsPlugin(): Plugin {
  return new Plugin({
    key: furnitureRegionsPluginKey,

    appendTransaction: (transactions, _oldState, newState) => {
      // Nothing was edited (a selection-only change): there is nothing to normalise.
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      // Note: a transaction of *ours* is normalised too. Removing a page number leaves an empty
      // region behind, and that is exactly what needs a fresh paragraph. ProseMirror calls
      // `appendTransaction` again for the transaction this returns, so termination rests on the
      // plan being idempotent: the second pass finds nothing to change and returns `null`.

      const tr = newState.tr;
      let changed = false;

      // Last band first: replacing a band shifts every position after it.
      const bands = collectPages(newState.doc)
        .flatMap((page) =>
          [PAGE_HEADER_NODE, PAGE_FOOTER_NODE]
            .map((name) => findChild(page, name))
            .filter((child): child is NonNullable<typeof child> => child !== null)
        )
        .reverse();

      for (const band of bands) {
        const plan = planBandRegions(band.node, band.pos);
        if (!plan) continue;
        tr.replaceWith(plan.from, plan.to, plan.content);
        changed = true;
      }

      if (!changed) return null;
      // Layout repair, never an undo step: one Ctrl+Z must not restore a malformed band.
      tr.setMeta("addToHistory", false);
      return tr;
    }
  });
}

/** 标识区域规范化插件。 / Identifies the region-normalising plugin. */
export const furnitureRegionsPluginKey = new PluginKey("snailFurnitureRegions");

/**
 * 新建条带的初始内容：三个空区域。
 *
 * 完全没有区域的条带是合法的（`block*`）但没用——没有东西可点击，也没有地方可输入——
 * 所以本包创建的每个条带都是完整的。当调用方从 schema 中移除了 `PageRegion` 时，
 * `createRegionNodes` 返回 `undefined`，此时条带以空内容创建而不是抛错。
 *
 * The content a fresh band starts with: the three empty regions.
 *
 * A band with no regions at all is legal (`block*`) but useless — nothing to click, nothing to
 * type into — so every band this package creates arrives complete. `createRegionNodes` returns
 * `undefined` when the consumer removed `PageRegion` from the schema, in which case the band is
 * created empty rather than throwing.
 */
export function emptyFurnitureContent(schema: Schema): Fragment | undefined {
  const regions = createRegionNodes(schema);
  if (regions) return Fragment.from(regions);

  const paragraph = schema.nodes["paragraph"];
  return paragraph ? Fragment.from(paragraph.create()) : undefined;
}

/**
 * 给缺少该版面配件节点的页面添加它。
 *
 * `pageIndex`（1 起）把改动限制在单个页面，这正是让「只有部分页面有页眉」成为受支持
 * 的状态而不是损坏状态的原因。
 *
 * Add the furniture node to the pages that lack it.
 *
 * `pageIndex` (1-based) limits the change to one page, which is what makes "only some
 * pages have a header" a supported state rather than a broken one.
 */
function addFurniture(
  props: CommandProps,
  names: FurnitureNames,
  defaults: FurnitureAttributes,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const nodeType = state.schema.nodes[names.node];
  if (!nodeType) return false;

  const pages = selectPages(state.doc, pageIndex);
  // The first piece of furniture already in the document is the template, so a header the
  // user has styled is what the next page gets.
  const templateAttributes = firstFurnitureAttributes(pages, names.node, defaults);

  let changed = false;
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    if (findChild(page, names.node)) continue;

    const band = nodeType.create(templateAttributes, emptyFurnitureContent(state.schema));
    tr.insert(furnitureInsertPos(page, names.node), band);
    changed = true;
  }

  if (changed) {
    // Our own command: the transaction filter must let it through without the user having to open
    // a band first (see `utils/furnitureEditing.ts`).
    markFurnitureCommand(tr);
    if (dispatch) dispatch(tr);
  }
  return changed;
}

/**
 * 从拥有该版面配件节点的页面中移除它；缺失时绝不抛错。
 *
 * Remove the furniture node from the pages that have one. Never throws when absent.
 */
function removeFurniture(
  props: CommandProps,
  names: FurnitureNames,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const pages = selectPages(state.doc, pageIndex);

  let changed = false;
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const child = findChild(pages[index], names.node);
    if (!child) continue;
    tr.delete(child.pos, child.pos + child.node.nodeSize);
    changed = true;
  }

  if (changed) {
    markFurnitureCommand(tr);
    if (dispatch) dispatch(tr);
  }
  return changed;
}

/**
 * 设置每个版面配件节点的框高度。
 *
 * 当每个节点都已经是该值时返回 `false`，这样调用方可以省掉一次重绘和一条无意义的历史
 * 记录（旧版 `setPageFormat` 总是返回 `true`，缺陷 17）。
 *
 * Set the box height on every furniture node.
 *
 * Returns `false` when every node already has that value, so a caller can avoid a redraw
 * and a pointless history entry (the legacy `setPageFormat` returned `true` always,
 * defect 17).
 */
function setFurnitureHeight(
  props: CommandProps,
  names: FurnitureNames,
  height: number,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const pages = selectPages(state.doc, pageIndex);

  let changed = false;
  for (const page of pages) {
    const child = findChild(page, names.node);
    if (!child) continue;
    if (child.node.attrs.height === height) continue;
    // Attribute steps do not shift positions, so ascending order is safe here.
    tr.setNodeAttribute(child.pos, "height", height);
    changed = true;
  }

  if (changed) {
    markFurnitureCommand(tr);
    if (dispatch) dispatch(tr);
  }
  return changed;
}

/**
 * 这类条带在它所属页面中的位置。
 *
 * 页眉在正文之前，页脚在正文之后——即页面的内容表达式所声明的序列。两种情况下正文都是
 * 锚点：放在 `page.pos + 1` 会让页脚跑到页眉之上，而追加到页面末尾会让页脚落在旧文档
 * 仍然存放于该处的页眉之后。
 *
 * Where a band of this type belongs inside its page.
 *
 * A header goes before the body, a footer after it — the sequence the page's content expression
 * declares. The body is the anchor in both cases: `page.pos + 1` would put a footer above a
 * header, and appending at the page's end would put a footer after a header that a legacy document
 * still stores there.
 */
function furnitureInsertPos(page: PageRef, typeName: string): number {
  if (typeName === PAGE_HEADER_NODE) return page.pos + 1;

  const content = findChild(page, PAGE_CONTENT_NODE);
  if (!content) return page.pos + page.node.nodeSize - 1;
  return content.pos + content.node.nodeSize;
}

/**
 * 把事务标记为版面配件自身的命令之一。
 *
 * Mark a transaction as one of the furniture's own commands.
 */
function markFurnitureCommand(transaction: Transaction): void {
  // The filter lets a command through without the user having to open a band first, and the
  // editing state is left exactly as it was.
  transaction.setMeta(FURNITURE_META, { type: "command", command: true } satisfies FurnitureMeta);
}

/**
 * 命令作用的页面：全部页面，或给定的 1 起编号那一页。
 *
 * The pages a command targets: all of them, or the one with the given 1-based number.
 */
function selectPages(doc: PMNode, pageIndex: number | undefined): PageRef[] {
  const pages = collectPages(doc);
  if (pageIndex === undefined) return pages;
  return pages.filter((page) => page.ordinal === pageIndex);
}

/**
 * 已存在的第一个版面配件节点的属性，用作新建节点的模板。
 *
 * The attributes of the first furniture node present, used as the template for new ones.
 */
function firstFurnitureAttributes(
  pages: PageRef[],
  typeName: string,
  defaults: FurnitureAttributes
): FurnitureAttributes {
  for (const page of pages) {
    const child = findChild(page, typeName);
    if (!child) continue;
    const attributes: Record<string, unknown> = child.node.attrs;
    return {
      height:
        typeof attributes.height === "number" && Number.isFinite(attributes.height)
          ? attributes.height
          : defaults.height,
      showLine: typeof attributes.showLine === "boolean" ? attributes.showLine : defaults.showLine
    };
  }
  return defaults;
}
