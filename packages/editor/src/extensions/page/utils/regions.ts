/**
 * 页眉或页脚的三区域模型——纯辅助函数。
 *
 * ## 为什么区域是文档节点
 *
 * 页眉是「左 / 中 / 右，各自可编辑，而页码可能恰好占据其中之一」。这里的每一个说法都是
 * 关于*文档*的：
 *
 * - 「各自可编辑」意味着每个三分之一格都可寻址，这样才能允许编辑其中一个而拒绝另外两个；
 * - 「页码占据其中之一」意味着页码节点必须*位于*那个三分之一格内部，这样把它从格子中移除
 *   就是一次普通的文档编辑，保存的模板也能保留放置位置；
 * - 「恰好一个」是一条需要由某处强制执行的不变式。
 *
 * 一个扁平的 `block*` 条带加上 CSS 分栏这些一条都表达不了：分栏只会存在于 DOM 里，页码
 * 会成为文字的兄弟节点而不是某个槽位的子节点，而且没有任何东西能区分「中间」和「第二个
 * 子节点」。
 *
 * ## 本模块负责什么
 *
 * 槽位词汇表、「哪个区域被锁定」（承载页码或 Logo 的那个），以及让条带始终保持恰好三个
 * 区域且顺序固定的规范化流程。这里的一切都接收 ProseMirror 节点并返回位置或片段——
 * 不涉及 DOM，也不涉及编辑器——因此和 `utils/` 的其余部分一样，规则不需要浏览器就能做
 * 单元测试。
 *
 * The three-region model of a header or footer — pure helpers.
 *
 * ## Why regions are document nodes
 *
 * A header is "left / centre / right, each editable, and the page number may occupy exactly one
 * of them". Every one of those words is a statement about the *document*:
 *
 * - "each editable" means each third has to be addressable, so that editing can be allowed in
 *   one third and refused in the other two;
 * - "the page number occupies one" means the page number node has to live *inside* that third,
 *   so that removing it from the third is a normal document edit and a saved template keeps the
 *   placement;
 * - "exactly one" is an invariant something has to enforce.
 *
 * A flat `block*` band plus CSS columns can express none of that: the columns would exist only
 * in the DOM, the page number would be a sibling of the text rather than a child of a slot, and
 * nothing could tell "the centre" from "the second child".
 *
 * ## What this module owns
 *
 * The slot vocabulary, "which region is locked" (the one holding the page number or the logo),
 * and the normalisation that keeps a band at exactly three regions in a fixed order. Everything
 * here takes ProseMirror nodes and returns positions or fragments — no DOM, no editor — so the
 * rules are unit-tested without a browser, like the rest of `utils/`.
 */

import { Fragment } from "@tiptap/pm/model";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";

import { FURNITURE_SLOTS, SLOT_ORDER } from "../typing/headerFooter";
import type { FurnitureSlot } from "../typing/headerFooter";
import { PAGE_LOGO_NODE, PAGE_NUMBER_NODE, PAGE_REGION_NODE } from "./nodes";

/** 一个带槽位与绝对位置的区域节点。 / A region node with its slot and absolute position. */
export interface RegionRef {
  /** 区域节点。 / The region node. */
  node: PMNode;
  /** 区域**之前**的绝对位置。 / Absolute position **before** the region. */
  pos: number;
  /**
   * 区域的槽位，从其属性读出，缺失或错误时回退为 `center`。
   *
   * The region's slot, read from its attribute with a `center` fallback.
   */
  slot: FurnitureSlot;
}

/** 条带的子节点，按槽位索引。 / A band's children as a lookup by slot. */
export type RegionMap = Partial<Record<FurnitureSlot, RegionRef>>;

/**
 * 读取区域的槽位；属性缺失或错误时回退为 `center`。
 *
 * Read a region's slot, falling back to `center` for an attribute that is missing or wrong.
 */
export function readSlot(value: unknown): FurnitureSlot {
  return typeof value === "string" && (FURNITURE_SLOTS as readonly string[]).includes(value)
    ? (value as FurnitureSlot)
    : "center";
}

/**
 * 条带子节点中的每个区域，按文档顺序。
 *
 * Every region among a band's children, in document order.
 */
export function collectRegions(band: PMNode, bandPos: number): RegionRef[] {
  const regions: RegionRef[] = [];
  band.forEach((child, offset) => {
    if (child.type.name !== PAGE_REGION_NODE) return;
    // `forEach` reports offsets relative to the band's *content* start, and the band's own
    // opening token is one position wide — the `+ 1` rule of defect 6, in one place.
    regions.push({ node: child, pos: bandPos + 1 + offset, slot: readSlot(child.attrs.slot) });
  });
  return regions;
}

/**
 * 条带的区域，按槽位索引。重复的槽位保留**第一个**。
 *
 * The regions of a band keyed by slot. A duplicated slot keeps the **first** one.
 */
export function regionMap(regions: readonly RegionRef[]): RegionMap {
  const map: RegionMap = {};
  for (const region of regions) {
    if (map[region.slot] === undefined) map[region.slot] = region;
  }
  return map;
}

/**
 * 区域是否*被锁定*——即它承载页码或 Logo。
 *
 * 锁定是派生出来的，绝不存储：属性就得与内容保持同步，而节点第一次被移动时两者就会
 * 失步。「这个区域承载一个页码」就是锁定的定义，所以每次都从内容读取。
 *
 * 搜索是**递归**的，因为两种被锁定的节点类型形状不同：Logo 是一个块，因此是区域的直接
 * 子节点，而页码是*行内*节点，因此位于作为直接子节点的段落内部。
 *
 * Whether a region is *locked* — i.e. it holds the page number or the logo.
 *
 * Locked is derived, never stored: an attribute would have to be kept in step with the content,
 * and the two would drift the first time a node was moved. "This region holds a page number" is
 * the definition of locked, so it is read from the content every time.
 *
 * The search is **recursive** because the two locked node types have different shapes: the logo is
 * a block, so it is a direct child of the region, while the page number is an *inline* node and
 * therefore lives inside a paragraph that is a direct child.
 */
export function regionIsLocked(region: PMNode): boolean {
  return (
    regionHoldsType(region, PAGE_NUMBER_NODE) || regionHoldsType(region, PAGE_LOGO_NODE)
  );
}

/**
 * 节点内部任何位置是否包含该类型的节点。
 *
 * Whether a node holds a node of this type anywhere inside it.
 */
export function regionHoldsType(node: PMNode, typeName: string): boolean {
  let found = false;
  node.descendants((child) => {
    if (child.type.name !== typeName) return true;
    found = true;
    return false;
  });
  return found;
}

/**
 * 节点内部任何位置是否包含页码或 Logo。
 *
 * Whether a node holds a page number or a logo anywhere inside it.
 */
export function holdsLockedContent(node: PMNode): boolean {
  if (node.type.name === PAGE_NUMBER_NODE || node.type.name === PAGE_LOGO_NODE) return true;
  return regionIsLocked(node);
}

/**
 * 在条带内部找到页码，无论它在哪里。
 *
 * Find the page number inside a band, wherever it sits.
 *
 * @returns 它的节点、绝对位置与所在区域，或 `null` /
 *   Its node, its absolute position and the region holding it, or `null`.
 */
export function findPageNumber(
  band: PMNode,
  bandPos: number
): { node: PMNode; pos: number; region: RegionRef } | null {
  return findLockedNode(band, bandPos, PAGE_NUMBER_NODE);
}

/** 在条带内部找到 Logo，无论它在哪里。 / Find the logo inside a band, wherever it sits. */
export function findLogo(
  band: PMNode,
  bandPos: number
): { node: PMNode; pos: number; region: RegionRef } | null {
  return findLockedNode(band, bandPos, PAGE_LOGO_NODE);
}

/**
 * {@link findPageNumber} 与 {@link findLogo} 共用的搜索。
 *
 * The shared search behind {@link findPageNumber} and {@link findLogo}.
 */
function findLockedNode(
  band: PMNode,
  bandPos: number,
  typeName: string
): { node: PMNode; pos: number; region: RegionRef } | null {
  for (const region of collectRegions(band, bandPos)) {
    let found: PMNode | null = null;
    let foundPos = -1;
    region.node.descendants((child, offset) => {
      if (child.type.name !== typeName) return true;
      // The region's content starts at `pos + 1`, and `descendants` offsets are relative to it.
      found = child;
      foundPos = region.pos + 1 + offset;
      return false;
    });
    if (found !== null) return { node: found, pos: foundPos, region };
  }
  return null;
}

/**
 * 区域内容的末尾：新块被追加的位置。
 *
 * The end of a region's content: where a new block is appended.
 */
export function regionContentEnd(region: RegionRef): number {
  return region.pos + region.node.nodeSize - 1;
}

/**
 * 构建条带诞生时带的三个区域。
 *
 * Build the three regions a band starts life with.
 *
 * @returns schema 没有 `pageRegion`（调用方把它移除了）时返回 `undefined` /
 *   `undefined` when the schema has no `pageRegion` (a consumer that removed it), so the
 *   caller can fall back to an empty band instead of throwing.
 */
export function createRegionNodes(schema: Schema): PMNode[] | undefined {
  const regionType = schema.nodes[PAGE_REGION_NODE];
  if (!regionType) return undefined;

  const paragraph = schema.nodes["paragraph"];
  return SLOT_ORDER.map((slot) =>
    regionType.create(
      { slot },
      paragraph ? Fragment.from(paragraph.create()) : undefined
    )
  );
}

/**
 * 规范化事务：让每个条带恰好是三个区域，且按槽位顺序排列。
 *
 * schema 刻意是宽松的（条带接受 `block*`），因为旧版本保存的模板会把普通块直接放在页眉里，
 * 而拒绝这一点的 schema 会在解析时**丢掉用户的文字**，而不是迁移它。所以不变式改在这里
 * 恢复：
 *
 * - 条带中散落的块被移进它们所属的区域——中间那个，因为扁平条带没有槽位，而中间正是它
 *   的文字以前被渲染的位置；
 * - 缺失的区域以空内容创建；
 * - 重复的槽位保留它的第一个区域，并把其余区域的内容折进其中；
 * - 区域重排为左、中、右。
 *
 * 重建按**从后往前的条带顺序**应用，因为替换一个条带会改变它之后每个条带的位置。
 *
 * The normalisation transaction: make every band exactly three regions, in slot order.
 *
 * The schema is deliberately permissive (a band accepts `block*`), because a template saved by
 * an older version holds ordinary blocks directly inside its header, and a schema that rejected
 * that would **drop the user's text** while parsing instead of migrating it. So the invariant is
 * restored here instead:
 *
 * - a band's stray blocks are moved into the region they belong to — the centre one, since a
 *   flat band had no slots and the centre is where its text was rendered before;
 * - a missing region is created empty;
 * - a duplicated slot keeps its first region and folds the others' content into it;
 * - regions are reordered into left, centre, right.
 *
 * The rebuild is applied **last band first**, because replacing a band changes the positions of
 * every band after it.
 *
 * @returns 条带新的子节点；条带已经满足不变式时返回 `null` /
 *   The band's new children, or `null` when the band already satisfies the invariant.
 */
export function planBandRegions(band: PMNode, bandPos: number): { from: number; to: number; content: Fragment } | null {
  const regions = collectRegions(band, bandPos);
  const map = regionMap(regions);

  const stray: PMNode[] = [];
  const duplicates: PMNode[] = [];
  band.forEach((child) => {
    if (child.type.name === PAGE_REGION_NODE) {
      const slot = readSlot(child.attrs.slot);
      const first = map[slot];
      // The first region with this slot is kept; any later one is folded into it below.
      if (first !== undefined && first.node !== child) duplicates.push(child);
      return;
    }
    stray.push(child);
  });

  const complete =
    regions.length === SLOT_ORDER.length &&
    duplicates.length === 0 &&
    stray.length === 0 &&
    // An empty region is a hole the user cannot click into, so a band with one is rebuilt too.
    // That is also what replaces the block a page number or a logo leaf behind when it moves.
    SLOT_ORDER.every((slot) => (map[slot]?.node.childCount ?? 0) > 0);
  if (complete) return null;

  const regionType = band.type.schema.nodes[PAGE_REGION_NODE];
  if (!regionType) return null;

  const paragraph = band.type.schema.nodes["paragraph"];
  const children: PMNode[] = [];

  for (const slot of SLOT_ORDER) {
    const existing = map[slot];
    const extra: PMNode[] = [...duplicates.filter((node) => readSlot(node.attrs.slot) === slot)];
    // A band with no regions at all keeps its content: it becomes the centre region.
    const inherited = existing === undefined && slot === "center" ? stray : [];

    if (existing === undefined && inherited.length === 0 && extra.length === 0) {
      children.push(regionType.create({ slot }, paragraph ? Fragment.from(paragraph.create()) : undefined));
      continue;
    }

    const content: PMNode[] = [];
    if (existing) {
      existing.node.forEach((child) => content.push(child));
    }
    for (const node of inherited) content.push(node);
    for (const node of extra) {
      node.forEach((child) => content.push(child));
    }

    if (content.length === 0 && paragraph) content.push(paragraph.create());
    children.push(regionType.create({ slot }, content.length > 0 ? Fragment.from(content) : undefined));
  }

  // A band that had only *duplicate* regions and no strays still needs no rebuild when the
  // result is identical, but comparing fragments here would cost more than the rebuild.
  return { from: bandPos + 1, to: bandPos + band.nodeSize - 1, content: Fragment.from(children) };
}
