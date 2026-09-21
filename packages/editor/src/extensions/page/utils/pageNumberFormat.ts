/**
 * 规划页码——放在哪里、显示什么。纯函数，因此不需要 DOM 就能测试。
 *
 * ## 为什么不只是「写属性」
 *
 * 显而易见的实现（`for every pageNumber node: setNodeAttribute(..., "format", f)`）在用户
 * 真正处于的状态下完全不起作用：启用页脚创建的是一个*空*页脚，还没有 `pageNumber` 节点，
 * 于是没有东西可写，面板只能报告页脚里没有页码——那是死路，而不是解释。
 * 选择一种格式**就是**用户索要页码的方式，因此这个规划器会补上缺失的那个，并更新已存在
 * 的那些。
 *
 * ## 不只是格式，还有位置
 *
 * 页码**位于某一个条带的某一个区域内部**（页眉或页脚的左 / 中 / 右），而且它在哪个区域，
 * 哪个区域就被锁定。因此面板需要的三个操作是三份独立的计划：
 *
 * 1. **选了一种格式**——每个已有的页码都被重新格式化；没有页码的页面会在
 *    {@link DEFAULT_PAGE_NUMBER_PLACEMENT} 得到一个。
 * 2. **选了一个位置**——页码被移进那个区域；条带和页码不存在时会先创建。
 * 3. **选了「不显示」**——每个页码都被移除，它所在的区域随之解锁。
 *
 * 三者移动页码时都会保留它**当前的文本**：把页脚里的页码移到页眉的左边三分之一，绝不能
 * 悄悄把 `第 X 页 / 共 Y 页` 重置为默认值。
 *
 * ## 三者共有的规则
 *
 * 1. **每页恰好一个页码。**版面上的任何位置若已有页码，就更新或移动它；只有完全没有页码的
 *    页面才会得到一个新的。
 * 2. **位置命令会创建自己的版面配件。**在没有页脚的文档上「放到页脚」会创建页脚，因为
 *    这正是该请求的含义。
 * 3. **页面按从后往前访问。**插入或删除会移动其后的所有位置，因此升序遍历会把失效的位置
 *    拼接进事务——正是旧版刷新命令造成的破坏（缺陷 11）。每次编辑后，所有位置也会从事务
 *    自己的文档重新读取。
 *
 * 位置本身来自 {@link PageRef}：`pos` 是节点**之前**的位置，`pos + 1` 是它的内容起点，
 * 因此区域的内容末尾是 `pos + nodeSize - 1`。
 *
 * Planning a page number — where it goes and what it says. Pure, so it is testable without a DOM.
 *
 * ## Why this is not just "write the attribute"
 *
 * The obvious implementation (`for every pageNumber node: setNodeAttribute(..., "format", f)`)
 * does nothing at all in the state a user is actually in when they pick a format. Enabling the
 * footer creates an *empty* footer: there is no `pageNumber` node yet, so there is nothing to
 * write to, and the panel can only report that the footer has no number — a dead end rather than
 * an explanation. Choosing a format **is** how a user asks for a page number, so this planner
 * creates the one that is missing and updates the ones that exist.
 *
 * ## Placement, not just format
 *
 * A page number lives **inside one region** of one band (left / centre / right of the header or
 * the footer), and that region is locked while it is there. The three operations the panel needs
 * are therefore separate plans:
 *
 * | what the user did | what happens |
 * | --- | --- |
 * | picked a format | every existing number is re-formatted; a page with none gets one in {@link DEFAULT_PAGE_NUMBER_PLACEMENT} |
 * | picked a position | the number is moved into that region — the band and the number are created when they do not exist yet |
 * | picked 不显示 | every number is removed, which unlocks the region it was in |
 *
 * All three keep the number's **current text** when they move it: moving a footer number into the
 * header's left third must not silently reset `第 X 页 / 共 Y 页` to the default.
 *
 * ## The rules all three share
 *
 * 1. **Exactly one number per page.** A number anywhere in the furniture is found and updated or
 *    moved; only a page with none gets a new one.
 * 2. **Placements create their furniture.** "Put it in the footer" on a document with no footer
 *    creates the footer, because that is what the request means.
 * 3. **Pages are visited last to first.** An insert or a delete shifts every position after it, so
 *    an ascending pass would splice stale positions into the transaction — the corruption the
 *    legacy flush commands produced (defect 11). Every position is also re-read from the
 *    transaction's own document after each edit.
 *
 * The positions themselves come from {@link PageRef}: `pos` is the position **before** a node and
 * `pos + 1` its content start, so a region's content end is `pos + nodeSize - 1`.
 */

import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

import { DEFAULT_FURNITURE_HEIGHT } from "../constant/defaults";
import type { FurnitureSide, FurnitureSlot } from "../typing/headerFooter";
import { DEFAULT_PAGE_NUMBER_ATTRIBUTES } from "../constant/defaults";
import { ensureBand } from "./furniture";
import { collectPages, findChild, PAGE_FOOTER_NODE, PAGE_HEADER_NODE, PAGE_NUMBER_NODE } from "./nodes";
import type { PageChildRef, PageRef } from "./nodes";
import {
  collectRegions,
  findPageNumber,
  planBandRegions,
  regionContentEnd,
  regionHoldsType,
  regionMap
} from "./regions";
import type { RegionRef } from "./regions";

/**
 * 页码所在的位置：哪个条带，以及它的哪三分之一。
 *
 * Where a page number sits: which band, and which third of it.
 */
export interface PageNumberPlacement {
  /** `"top"` 为页眉，`"bottom"` 为页脚。 / `"top"` for the header, `"bottom"` for the footer. */
  side: FurnitureSide;
  /** 该条带的哪三分之一。 / Which third of that band. */
  slot: FurnitureSlot;
}

/**
 * 用户通过选择一种格式来索要页码时，页码去往哪里。
 *
 * 页脚的中间三分之一是每一种文字处理软件里的惯例，因此它也是在没有任何其他信息时
 * 「我想要一个页码」最不令人意外的答案。
 *
 * Where a page number goes when the user asks for one by picking a format.
 *
 * The footer's centre third is the convention in every word processor, so it is also the least
 * surprising answer for "I want a page number" with no other information.
 */
export const DEFAULT_PAGE_NUMBER_PLACEMENT: PageNumberPlacement = { side: "bottom", slot: "center" };

/**
 * 两个条带，按其节点在页面中可能出现的顺序排列。
 *
 * The two bands, in the order their nodes may appear in a page.
 */
const SIDES: readonly FurnitureSide[] = ["top", "bottom"];

/**
 * *为*页码而创建的条带的默认属性。
 *
 * The default attributes of a band created *for* a page number.
 */
function bandDefaults(): { height: number; showLine: boolean } {
  return { height: DEFAULT_FURNITURE_HEIGHT, showLine: false };
}

/**
 * 文档中具有该 1 起序号的页面，没有则为 `null`。
 *
 * The page with this 1-based ordinal in a document, or `null`.
 */
function pageAt(doc: EditorState["doc"], ordinal: number): PageRef | null {
  return collectPages(doc).find((page) => page.ordinal === ordinal) ?? null;
}

/**
 * 某个页面的条带；该页面没有这一侧时返回 `null`。
 *
 * One page's band, or `null` when that page has none of that side.
 */
function bandOf(page: PageRef, side: FurnitureSide): PageChildRef | null {
  return findChild(page, side === "top" ? PAGE_HEADER_NODE : PAGE_FOOTER_NODE);
}

/**
 * 某个条带内部的页码，无论它在条带中的哪个位置。
 *
 * The number inside one band, wherever in the band it sits.
 */
function numberIn(page: PageRef, side: FurnitureSide): { pos: number; node: PageChildRef["node"] } | null {
  const band = bandOf(page, side);
  if (!band) return null;
  const found = findPageNumber(band.node, band.pos);
  return found ? { pos: found.pos, node: found.node } : null;
}

/**
 * 页面页码当前使用的格式，没有则返回默认值。
 *
 * 在任何东西被移动*之前*读取，这样放置操作能保留用户选择的文本。
 *
 * The format the page's number currently uses, or the default.
 *
 * Read *before* anything is moved, so a placement keeps the text the user chose.
 */
function currentFormat(page: PageRef, fallback: string): string {
  for (const side of SIDES) {
    const found = numberIn(page, side);
    const value = found?.node.attrs.format;
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return fallback;
}

/**
 * 让每一页都拥有 `format` 格式页码的事务；不会产生任何变化时返回 `null`
 * （没有页面能承载页码，或每个页码都已经那样显示）。
 *
 * `tr` 默认为 `state.tr`，这样测试可以针对一个裸 `EditorState` 做规划；命令会传入它被调用时
 * 的那个事务，因此链式命令能保留累积的步骤。
 *
 * The transaction that gives every page a page number with `format`, or `null` when nothing would
 * change (no page to hold one, or every number already reads that way).
 *
 * `tr` defaults to `state.tr` so a test can plan against a bare `EditorState`; the command passes
 * the transaction it was called with so a chained command keeps its accumulated steps.
 */
export function planPageNumberFormat(
  state: EditorState,
  format: string,
  tr: Transaction = state.tr
): Transaction | null {
  const pageNumberType = state.schema.nodes[PAGE_NUMBER_NODE];
  if (!pageNumberType) return null;

  const ordinals = ordinalsLastFirst(state.doc);
  let changed = false;

  for (const ordinal of ordinals) {
    const page = pageAt(tr.doc, ordinal);
    if (!page) continue;

    let existing: { pos: number; node: PageChildRef["node"] } | null = null;
    for (const side of SIDES) {
      existing = numberIn(page, side);
      if (existing) break;
    }

    if (existing) {
      // `tr.doc`, not `state.doc`: an earlier iteration may have inserted at a higher position.
      if (tr.doc.nodeAt(existing.pos)?.attrs.format === format) continue;
      tr.setNodeAttribute(existing.pos, "format", format);
      changed = true;
      continue;
    }

    changed = createNumber(tr, state, ordinal, format, DEFAULT_PAGE_NUMBER_PLACEMENT) || changed;
  }

  return changed ? tr : null;
}

/**
 * 把每一页的页码移动（或创建）到同一个区域的事务；每一页都已经恰好在那里时返回 `null`。
 *
 * The transaction that moves (or creates) every page's number in one region, or `null` when every
 * page already has it exactly there.
 */
export function planPageNumberPlacement(
  state: EditorState,
  placement: PageNumberPlacement,
  tr: Transaction = state.tr
): Transaction | null {
  const pageNumberType = state.schema.nodes[PAGE_NUMBER_NODE];
  if (!pageNumberType) return null;

  let changed = false;

  for (const ordinal of ordinalsLastFirst(state.doc)) {
    const page = pageAt(tr.doc, ordinal);
    if (!page) continue;

    const format = currentFormat(page, DEFAULT_PAGE_NUMBER_ATTRIBUTES.format);
    const current = placedSlot(page);
    const hasNumber = SIDES.some((side) => numberIn(page, side) !== null);
    if (hasNumber && current && current.side === placement.side && current.slot === placement.slot) {
      continue;
    }

    // Out with the old placement, in with the new one: the region it leaves is unlocked, and the
    // region it enters is locked.
    for (const side of SIDES) {
      const found = numberIn(page, side);
      if (!found) continue;
      tr.delete(found.pos, found.pos + found.node.nodeSize);
      changed = true;
    }

    changed = createNumber(tr, state, ordinal, format, placement) || changed;
  }

  return changed ? tr : null;
}

/**
 * 移除所有页码（面板上的「不显示」）的事务；一个都没有时返回 `null`。
 *
 * The transaction that removes every page number (the panel's 不显示), or `null` when none.
 */
export function planPageNumberRemoval(state: EditorState, tr: Transaction = state.tr): Transaction | null {
  let changed = false;

  for (const ordinal of ordinalsLastFirst(state.doc)) {
    const page = pageAt(tr.doc, ordinal);
    if (!page) continue;

    for (const side of SIDES) {
      const found = numberIn(page, side);
      if (!found) continue;
      tr.delete(found.pos, found.pos + found.node.nodeSize);
      changed = true;
    }
  }

  return changed ? tr : null;
}

/**
 * 页面页码当前所在的区域；该页面没有页码时返回 `null`。
 *
 * The region a page's number currently sits in, or `null` when the page has no number.
 */
export function placedSlot(page: PageRef): PageNumberPlacement | null {
  for (const side of SIDES) {
    const band = bandOf(page, side);
    if (!band) continue;
    if (!findPageNumber(band.node, band.pos)) continue;

    for (const region of collectRegions(band.node, band.pos)) {
      if (regionHoldsType(region.node, PAGE_NUMBER_NODE)) return { side, slot: region.slot };
    }
  }
  return null;
}

/**
 * 在 `placement` 里创建某一页的页码，条带和区域缺失时一并创建。
 *
 * 页码是一个**行内**节点，因此不能直接作为区域的子节点（`block*`）：它会进入区域里最后一个
 * 文本块内部，若该区域完全没有文本块，则进入为它创建的一个段落内部。这也让承载页码的区域
 * 看起来符合用户预期——页码落在区域自己的文字行上，而不是单独占一个块。
 *
 * Create one page's number in `placement`, creating the band and the region when they are missing.
 *
 * The number is an **inline** node, so it cannot be a direct child of a region (`block*`): it goes
 * inside the region's last textblock, or inside a paragraph created for it when the region has no
 * textblock at all. That is also what makes a region holding a number look the way a user expects —
 * the number sits on the region's text line, not alone in a block of its own.
 *
 * @returns 事务是否发生了变化 / Whether the transaction changed.
 */
function createNumber(
  tr: Transaction,
  state: EditorState,
  ordinal: number,
  format: string,
  placement: PageNumberPlacement
): boolean {
  const pageNumberType = state.schema.nodes[PAGE_NUMBER_NODE];
  if (!pageNumberType) return false;

  let page = pageAt(tr.doc, ordinal);
  if (!page) return false;

  // "Put it in the footer" on a document without a footer creates the footer: that is what the
  // request means, and it is the dead end this whole module exists to remove.
  ensureBand(tr, page, placement.side, state.schema, bandDefaults());

  page = pageAt(tr.doc, ordinal);
  if (!page) return false;

  let band = bandOf(page, placement.side);
  if (!band) return false;

  // A band can be incomplete: a template saved before regions existed has no regions at all, and a
  // band the user emptied can be missing one. Complete it *before* looking the target region up —
  // otherwise a placement would delete the old number and insert nothing, which is a lost number
  // rather than a failed command.
  if (!regionMap(collectRegions(band.node, band.pos))[placement.slot]) {
    const plan = planBandRegions(band.node, band.pos);
    if (plan) {
      tr.replaceWith(plan.from, plan.to, plan.content);
      page = pageAt(tr.doc, ordinal);
      if (!page) return false;
      band = bandOf(page, placement.side);
      if (!band) return false;
    }
  }

  const region = regionMap(collectRegions(band.node, band.pos))[placement.slot];
  if (!region) return false;

  const target = appendTarget(region);
  if (target === null) return false;

  const number = pageNumberType.create({ format });
  // An inline node cannot be a direct child of a region: it is wrapped in a paragraph when the
  // region has no textblock of its own to receive it.
  const content = target.wrapIn ? target.wrapIn.type.create(target.wrapIn.attrs, number) : number;
  tr.insert(target.pos, content);
  return true;
}

/**
 * 新的行内节点在区域内部的落点。
 *
 * Where a new inline node goes inside a region.
 *
 * @returns 插入位置，以及区域没有文本块时用来包裹该节点的块 /
 *   The position to insert at, and the block to wrap the node in when the region has no
 *   textblock — `null` when the schema has no paragraph and there is nothing to insert into.
 */
function appendTarget(region: RegionRef): { pos: number; wrapIn: PMNode | null } | null {
  let textblockPos = -1;
  let textblock: PMNode | null = null;

  region.node.forEach((child, offset) => {
    if (!child.isTextblock) return;
    textblockPos = region.pos + 1 + offset;
    textblock = child;
  });

  const last = textblock as PMNode | null;
  if (last !== null && textblockPos >= 0) {
    // The end of the block's content: one position for the block's own token, plus its content.
    return { pos: textblockPos + 1 + last.content.size, wrapIn: null };
  }

  const paragraphType = region.node.type.schema.nodes["paragraph"];
  if (!paragraphType) return null;
  return { pos: regionContentEnd(region), wrapIn: paragraphType.create() };
}

/** 每一页的 1 起序号，从大到小。 / Every page's 1-based ordinal, highest first. */
function ordinalsLastFirst(doc: EditorState["doc"]): number[] {
  return collectPages(doc)
    .map((page) => page.ordinal)
    .reverse();
}
