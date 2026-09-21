/**
 * 「正在编辑哪个条带的哪个区域」——双击手势背后的状态。
 *
 * ## 为什么条带不是随时可编辑的
 *
 * 页眉是版面配件：它在每一页上重复，不是正文文字所在之处，写条款时误点进去绝不是用户的
 * 本意。Word 的解法是把页眉排除在正文的编辑流之外并要求双击；本模块就是把这个模型显式
 * 化：
 *
 * - **双击某个区域即进入它。**该区域变为可编辑，光标落入其中，其余区域——以及另一侧的
 *   条带——都被拒绝。
 * - **点击同一侧条带的其他区域会切换过去。**用户一旦进入版面配件，在左、中、右三格之间
 *   移动就不该再需要一次双击。
 * - **点击正文或按 `Escape` 即离开。**编辑版面配件是一种模式，离开模式的方式和其他模式
 *   一样。
 * - **被锁定的区域永远不可编辑**（见 `regions.ts`）：它承载页码或 Logo。
 *
 * ## 「拒绝」是如何实现的
 *
 * 两层，因为任何一层单独都有漏洞：
 *
 * 1. **CSS**（`page/style/page.scss`）：未被编辑的区域带
 *    `pointer-events: none; user-select: none`，因此点击无法在其中放置光标，也没有可被
 *    覆盖输入的选区。这是用户能感觉到的部分。
 * 2. **`filterTransaction`**：在没有区域处于编辑状态时，任何触及版面配件的
 *    改文档事务都被拒绝。CSS 挡住了光标，但 Ctrl+A、跨越页眉的粘贴，或调用方自己的
 *    命令仍可能触达它——而一个能被误编辑的页眉正是这整套模型要修掉的缺陷。
 *
 * 本模块自己的命令所派发的事务会被放行，标记为 `addToHistory: false` 的事务也会——
 * 撤销 / 重做（它会合法地改写用户曾经编辑过的页眉）以及分页流程正是靠这一点继续工作。
 *
 * "Which region of which band is being edited" — the state behind the double-click gesture.
 *
 * ## Why the bands are not always editable
 *
 * A header is furniture: it repeats on every page, it is not where the document's text lives, and
 * a stray click into it while writing a clause is never what the user meant. Word solves this by
 * leaving the header out of the body's editing flow and asking for a double-click; this module is
 * that model, made explicit:
 *
 * - **A double-click on a region enters it.** The region becomes editable, the caret lands inside
 *   it, and the other regions — and the other band — are refused.
 * - **A click on another region of the same band switches to it.** Once the user is in the
 *   furniture, moving between the left, centre and right thirds should not need another
 *   double-click.
 * - **A click in the body, or `Escape`, leaves.** Editing furniture is a mode, and the way out is
 *   the way out of any mode.
 * - **A locked region is never editable** (see `regions.ts`): it holds the page number or the logo.
 *
 * ## How "refused" is implemented
 *
 * Two layers, because either alone has a hole:
 *
 * 1. **CSS** (`page/style/page.scss`): a region that is not being edited has
 *    `pointer-events: none; user-select: none`, so a click cannot put a caret in it and there is
 *    no selection to type over. This is what the user feels.
 * 2. **`filterTransaction`**: a document-changing transaction that touches furniture is rejected
 *    while no region is being edited. CSS stops the caret, but Ctrl+A, a paste with a selection
 *    that spans the header, or a consumer's own command could still reach it — and a header that
 *    can be edited by accident is the defect this whole model exists to fix.
 *
 * Transactions this module's own commands dispatch are allowed through, and so are transactions
 * marked `addToHistory: false` — that is how undo/redo (which legitimately rewrites a header the
 * user once edited) and the pagination pass keep working.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { DATA_TYPE, REGION_EDITING_CLASS } from "../constant/dom";
import type { FurnitureSide, FurnitureSlot } from "../typing/headerFooter";
import { PAGE_FOOTER_NODE, PAGE_HEADER_NODE, collectPages, findChild } from "./nodes";
import { collectRegions, regionIsLocked, regionMap } from "./regions";

/** 标识版面配件编辑插件。 / Identifies the furniture-editing plugin. */
export const furnitureEditingPluginKey = new PluginKey("snailFurnitureEditing");

/**
 * Meta 键：改变编辑目标的事务，或我们自己的某个命令。
 *
 * Meta key: a transaction that changes the editing target, or one of our own commands.
 */
export const FURNITURE_META = "snailFurniture";

/** 正在编辑的区域，没有则为空。 / The region being edited, or nothing. */
export interface FurnitureEditingState {
  /** 条带的侧。 / The band's side. */
  side: FurnitureSide;
  /** 条带内的槽位。 / The slot inside that band. */
  slot: FurnitureSlot;
}

/** 事务可以就编辑状态说明的内容。 / What a transaction may say about the editing state. */
export interface FurnitureMeta {
  /**
   * 该事务对编辑状态做了什么。
   *
   * `command` 不改变它：我们自己的命令可能在用户正身处某个条带时运行，而改变版面配件的
   * 高度绝不能把用户从里面赶出来。
   *
   * What the transaction does to the editing state.
   *
   * `command` leaves it alone: a command of ours may run while the user is inside a band, and
   * changing the furniture's height must not throw them out of it.
   */
  type: "enter" | "exit" | "command";
  /** 条带的侧；仅在进入时读取。 / The band's side; read for `enter` only. */
  side?: FurnitureSide;
  /** 目标槽位；仅在进入时读取。 / The target slot; read for `enter` only. */
  slot?: FurnitureSlot;
  /**
   * 由版面配件**命令**设置（放置页码、添加条带等）。
   *
   * 事务过滤器会让这些事务通过而不必进入编辑模式：它们按位置寻址、可撤销，拒绝它们会让
   * 工具栏自己的按钮在没有条带恰好打开时失效。
   *
   * Set by a furniture **command** (place a page number, add a band, …).
   *
   * The transaction filter lets those through without entering edit mode: they are addressed by
   * position, they are undoable, and refusing them would make the toolbar's own buttons fail
   * whenever no band happened to be open.
   */
  command?: boolean;
}

/** 页面上的一个条带，及其节点的位置。 / A band of a page, with the position of the node. */
export interface BandRef {
  /** 条带的侧。 / The band's side. */
  side: FurnitureSide;
  /** 条带节点。 / The band node. */
  node: PMNode;
  /** 条带**之前**的绝对位置。 / Absolute position **before** the band. */
  pos: number;
  /** 条带所属的 1 起页码。 / 1-based page number the band belongs to. */
  page: number;
}

/** 读取编辑状态，没有则返回 `null`。 / Read the editing state from a state, or `null`. */
export function readFurnitureEditing(state: EditorState): FurnitureEditingState | null {
  const value = furnitureEditingPluginKey.getState(state) as FurnitureEditingState | null | undefined;
  return value ?? null;
}

/**
 * 事务是否是我们自己的版面配件命令（见 {@link FurnitureMeta.command}）。
 *
 * Whether a transaction is a furniture command of ours (see {@link FurnitureMeta.command}).
 */
export function isFurnitureCommand(transaction: Transaction): boolean {
  const meta = transaction.getMeta(FURNITURE_META) as FurnitureMeta | undefined;
  return meta?.command === true;
}

/**
 * 条带的侧，从条带节点类型读出；不是条带的节点返回 `null`。
 *
 * The band's side, read from the band node type. `null` for a node that is not a band.
 */
export function sideOfBand(node: PMNode): FurnitureSide | null {
  if (node.type.name === PAGE_HEADER_NODE) return "top";
  if (node.type.name === PAGE_FOOTER_NODE) return "bottom";
  return null;
}

/** 文档中的每个条带，逐页列出。 / Every band in the document, page by page. */
export function collectBands(doc: PMNode): BandRef[] {
  const bands: BandRef[] = [];

  for (const page of collectPages(doc)) {
    for (const [name, side] of [
      [PAGE_HEADER_NODE, "top"],
      [PAGE_FOOTER_NODE, "bottom"]
    ] as const) {
      const child = findChild(page, name);
      if (child) bands.push({ side, node: child.node, pos: child.pos, page: page.ordinal });
    }
  }

  return bands;
}

/**
 * 进入一个区域时光标落下的位置。
 *
 * `regionPos + 2` 位于该区域的第一个块内部：一个位置给区域自身的起始标记，另一个
 * 位置给块本身。结果会被夹到区域的末尾，因此内容为空的区域也不会解析到自身之外。
 *
 * Where the caret lands when entering a region.
 *
 * `regionPos + 2` is inside the region's first block: one position for the region's own opening
 * token and one for the block's. It is clamped to the region's end, so a region whose content is
 * empty cannot resolve outside itself.
 */
export function regionCaretPos(regionPos: number, regionSize: number): number {
  return Math.min(regionPos + 2, regionPos + regionSize - 1);
}

/**
 * 进入某个区域的事务；该区域不存在或被锁定时返回 `null`。
 *
 * The transaction that enters a region, or `null` when that region does not exist or is locked.
 *
 * @param options.select 是否在同一次事务里放置光标 /
 *   Place the caret as part of the same transaction. `false` leaves the
 *   selection alone, which is what a click wants: the browser is about to place the caret exactly
 *   where the pointer is, and moving it here would fight that.
 */
export function planEnterFurniture(
  state: EditorState,
  side: FurnitureSide,
  slot: FurnitureSlot,
  options: { select?: boolean } = {}
): Transaction | null {
  for (const band of collectBands(state.doc)) {
    if (band.side !== side) continue;

    const region = regionMap(collectRegions(band.node, band.pos))[slot];
    if (!region) continue;
    if (regionIsLocked(region.node)) return null;

    const meta: FurnitureMeta = { type: "enter", side, slot };
    const transaction = state.tr.setMeta(FURNITURE_META, meta);
    if (options.select !== false) {
      const pos = regionCaretPos(region.pos, region.node.nodeSize);
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(pos), 1));
    }
    return transaction;
  }
  return null;
}

/**
 * 离开版面配件的事务；当时没有在编辑任何区域时返回 `null`。
 *
 * The transaction that leaves the furniture, or `null` when nothing was being edited.
 */
export function planExitFurniture(state: EditorState): Transaction | null {
  if (readFurnitureEditing(state) === null) return null;
  const meta: FurnitureMeta = { type: "exit" };
  return state.tr.setMeta(FURNITURE_META, meta);
}

/**
 * 一次事务改动的文档范围。
 *
 * 这些范围取自各个步骤自身的映射，而不是对比前后两个文档：每个步骤本来就带着它影响的
 * 范围，而真正没有变化的范围（属性步骤、只改选区的事务）则什么都不报告。
 *
 * 步骤的新旧范围形状不同：**插入**的旧范围宽度为零、新范围很宽，**删除**则相反。
 * 取两者的并集才能让这两种情况都对过滤器可见——只看旧范围会静默忽略每一次按键，
 * 而这正是本过滤器要堵上的「输入落进了页眉」这个漏洞。
 *
 * The document ranges a transaction changes.
 *
 * Read from the steps' own maps rather than by diffing the two documents: every step already
 * carries the range it affected, and a range that genuinely did not change (an attribute step, a
 * selection-only transaction) reports nothing at all.
 *
 * A step's old and new extents differ in shape: an **insertion** has a zero-width old range and a
 * wide new one, a **deletion** the other way round. Taking the union of the two is what makes both
 * visible to the filter — judging by the old extent alone silently ignores every keystroke, which
 * is exactly the "typing reached the header" hole this filter exists to close.
 */
export function touchedRanges(transaction: Transaction): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  for (const step of transaction.steps) {
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      const from = Math.min(oldStart, newStart);
      const to = Math.max(oldEnd, newEnd);
      if (to <= from) return;
      ranges.push({ from, to });
    });
  }

  return ranges;
}

/**
 * 一次文档改动是否可以继续。
 *
 * 以下情况放行：事务是我们自己的、它被标记为 `addToHistory: false`（撤销 / 重做与分页
 * 流程）、改动完全没有触及版面配件，或者它只触及当前正在编辑的那个区域——而那个区域
 * 绝不会是被锁定的。
 *
 * Whether a document change may proceed.
 *
 * Allowed when the transaction is ours, it is marked `addToHistory: false` (undo/redo and the
 * pagination pass), the change does not touch furniture at all, or it touches only the region
 * currently being edited — which is never a locked one.
 */
export function isFurnitureEditAllowed(
  previous: EditorState,
  transaction: Transaction,
  editing: FurnitureEditingState | null
): boolean {
  if (!transaction.docChanged) return true;
  if (isFurnitureCommand(transaction)) return true;
  if (transaction.getMeta("addToHistory") === false) return true;

  const ranges = touchedRanges(transaction);
  if (ranges.length === 0) return true;

  // The touched ranges are in the *new* document, so the bands are read from the transaction's
  // own state: a band that was just created is correctly seen as new, and one that was removed is
  // not looked up at all.
  const bands = collectBands(transaction.doc);
  const touchedBands = ranges.filter((range) =>
    bands.some((band) => range.to > band.pos && range.from < band.pos + band.node.nodeSize)
  );
  if (touchedBands.length === 0) return true;
  if (editing === null) return false;

  for (const band of bands) {
    if (band.side !== editing.side) continue;

    const region = regionMap(collectRegions(band.node, band.pos))[editing.slot];
    if (!region) return false;
    if (regionIsLocked(region.node)) return false;

    const from = region.pos;
    const to = region.pos + region.node.nodeSize;
    return touchedBands.every((range) => range.from >= from && range.to <= to);
  }

  return false;
}

/**
 * 一个 DOM 元素属于哪个区域（如果有）。
 *
 * 从 DOM 而非位置读取，因为点击到达时 ProseMirror 还没来得及映射它：对事件目标调用
 * `closest()` 是精确的，而落在条带内边距上的点击若用 `posAtDOM` 可能解析到条带而不是
 * 区域。
 *
 * Which region a DOM element belongs to, if any.
 *
 * Read from the DOM rather than from a position because the click arrives before ProseMirror has
 * mapped it: `closest()` on the event target is exact, whereas `posAtDOM` on a click that landed
 * on the band's padding can resolve to the band instead of to a region.
 */
export function regionFromElement(
  element: HTMLElement | null
): { side: FurnitureSide; slot: FurnitureSlot } | null {
  const region = element?.closest?.(`[data-type="${DATA_TYPE.pageRegion}"]`) as HTMLElement | null;
  if (!region) return null;

  const slot = region.getAttribute("data-slot");
  const side = region.getAttribute("data-side");
  if (slot !== "left" && slot !== "center" && slot !== "right") return null;
  if (side !== "top" && side !== "bottom") return null;

  return { side, slot };
}

/** 元素是否位于任何版面配件之内。 / Whether the element is inside any furniture at all. */
export function isInsideFurniture(element: HTMLElement | null): boolean {
  return Boolean(
    element?.closest?.(
      `[data-type="${DATA_TYPE.pageHeader}"], [data-type="${DATA_TYPE.pageFooter}"]`
    )
  );
}

/**
 * 该状态所指的条带是否仍存在于文档中。
 *
 * Whether the state still names a band that exists in the document.
 */
function bandStillExists(doc: PMNode, editing: FurnitureEditingState): boolean {
  return collectBands(doc).some((band) => band.side === editing.side);
}

/**
 * 创建持有编辑状态、手势与过滤器三者的插件。
 *
 * Create the plugin that owns the editing state, the gestures and the filter.
 */
export function createFurnitureEditingPlugin(): Plugin {
  return new Plugin<FurnitureEditingState | null>({
    key: furnitureEditingPluginKey,

    state: {
      init: () => null,
      apply: (transaction, value) => {
        const meta = transaction.getMeta(FURNITURE_META) as FurnitureMeta | undefined;

        if (!meta) {
          // A document change that removes the band being edited also ends the edit: otherwise the
          // state would point at a region that no longer exists, and the filter would refuse every
          // subsequent edit while believing the user is somewhere they are not.
          if (value === null || !transaction.docChanged) return value;
          return bandStillExists(transaction.doc, value) ? value : null;
        }

        if (meta.type === "exit") return null;
        // A command changes the furniture but not where the user is.
        if (meta.type === "command") return value;
        if (meta.side && meta.slot) return { side: meta.side, slot: meta.slot };
        return value;
      }
    },

    /**
     * 标记正在编辑的条带。
     *
     * ProseMirror 会把节点装饰应用到节点视图的**外层**元素上，而这正是样式表所需的
     * 「编辑时不透明度 1，否则 0.8」。
     *
     * Mark the band being edited.
     *
     * ProseMirror applies a node decoration to a node view's **outer** element, which is exactly
     * what the stylesheet needs for "opacity 1 while editing, 0.8 otherwise".
     */
    decorations(state: EditorState) {
      const editing = readFurnitureEditing(state);
      if (!editing) return null;

      const decorations: Decoration[] = [];
      for (const band of collectBands(state.doc)) {
        if (band.side !== editing.side) continue;
        decorations.push(
          Decoration.node(band.pos, band.pos + band.node.nodeSize, { class: REGION_EDITING_CLASS })
        );
      }

      return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
    },

    /**
     * 事务过滤器。
     *
     * 返回 `false` 会让 ProseMirror 丢弃该事务，因此被拒绝的编辑完全不产生变化——
     * 没有半途应用的步骤，也没有被破坏的输入法组合。
     *
     * The transaction filter.
     *
     * Returning `false` makes ProseMirror drop the transaction, so a refused edit changes nothing
     * at all — no half-applied step, no broken composition.
     */
    filterTransaction: (transaction, state) => {
      const editing = furnitureEditingPluginKey.getState(state) as FurnitureEditingState | null | undefined;
      return isFurnitureEditAllowed(state, transaction, editing ?? null);
    },

    props: {
      handleDOMEvents: {
        dblclick: (view, event) => {
          if (!view.editable) return false;
          const target = regionFromElement(event.target as HTMLElement | null);
          if (!target) return false;

          const transaction = planEnterFurniture(view.state, target.side, target.slot);
          if (!transaction) return false;

          view.dispatch(transaction);
          view.focus();
          // `false`: the browser's own double-click selection then happens inside the region,
          // which is editable by now — so a word is selected the way the user expects.
          return false;
        },

        mousedown: (view, event) => {
          if (!view.editable) return false;

          const editing = readFurnitureEditing(view.state);
          const target = regionFromElement(event.target as HTMLElement | null);

          if (target === null) {
            // A click in the body (or anywhere outside the furniture) leaves the band. Guarded by
            // `editing !== null` so the common case allocates nothing.
            if (editing !== null) {
              const exit = planExitFurniture(view.state);
              if (exit) view.dispatch(exit);
            }
            return false;
          }

          if (editing !== null && editing.side === target.side && editing.slot === target.slot) {
            // Already here: let the browser place the caret exactly where it was clicked.
            return false;
          }

          const transaction = planEnterFurniture(view.state, target.side, target.slot, { select: false });
          if (!transaction) return false;
          view.dispatch(transaction);
          return false;
        },

        keydown: (view, event) => {
          if (event.key !== "Escape") return false;
          const transaction = planExitFurniture(view.state);
          if (!transaction) return false;
          view.dispatch(transaction);
          return true;
        }
      }
    }
  });
}
