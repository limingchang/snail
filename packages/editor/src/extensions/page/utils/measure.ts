/**
 * DOM 测量器。
 *
 * 刻意做得很薄。它只回答一个问题——「每个块有多高，它的行在哪里断开？」——并把答案交给
 * `./pagination.ts` 里的纯引擎。它自己不做任何决策，所以真正有趣的逻辑不需要浏览器就能
 * 单元测试。
 *
 * ## 本文件所做的取舍
 *
 * 旧版 `measuror.ts` 在 `<canvas>` 上重新实现了文本测量：它自己遍历带样式的文本段、
 * 用手写的分词正则去猜断词、在热循环里为每个 CJK 字符调用一次 `measureText`，还一边
 * 测量一边往控制台打印。它的结果对 `letter-spacing`、对 `text-indent`、对任何不是它
 * 猜的那个字体都是错的，而且在 canvas 不可用时会直接抛错。
 *
 * 这个测量器反其道而行：它去问浏览器。行盒来自 `Range.getClientRects()`——真实布局、
 * 真实字体、真实行高——每一行的 ProseMirror 偏移来自 `posAtCoords`/`posAtDOM`，也就是
 * 光标所用的同一套映射。代价是测量会触发布局读取，因此调用方必须在每个动画帧里合并成
 * 一次遍历来执行（见 `pageContent/paginator.ts`），绝不能每次按键都做。这就是那笔交易：
 * 正确性来自已经排好文字的引擎，用合并调度来支付。
 *
 * ## 这里保持的规则
 *
 * - **没有 `console.log`。**
 * - **模块作用域不接触 DOM。**`document`、`window` 和 `getComputedStyle` 只在节点视图
 *   挂载后调用的函数内部被访问，因此在 SSR 期间导入本模块是安全的（顶层只有类型导入）。
 * - **CSS 长度是解析出来的，不是 `parseFloat` 出来的**——见 `./length.ts`（缺陷 12）。
 * - **`IMG` 子节点会被测量**（缺陷 13：旧版高度计算器跳过了它们，于是二维码贡献零高度，
 *   永远无法触发分页）。
 *
 * The DOM measurer.
 *
 * Deliberately thin. It answers one question — "how tall is each block, and where do its
 * lines break?" — and hands the answer to the pure engine in `./pagination.ts`. It never
 * decides anything, so the interesting logic stays unit-testable without a browser.
 *
 * ## The trade-off this file makes
 *
 * The legacy `measuror.ts` re-implemented text measurement on a `<canvas>`: it walked
 * the styled runs itself, guessed at word-breaking with a hand-written segmentation
 * regex, ran one `measureText` per CJK character in the hot loop and printed to the
 * console as it went. Its results were wrong for letter-spacing, for `text-indent`,
 * for anything but the font it guessed, and it threw outright when canvas was
 * unavailable.
 *
 * This measurer does the opposite: it asks the browser. Line boxes come from
 * `Range.getClientRects()` — the real layout, the real font, the real line-height — and
 * each line's ProseMirror offsets come from `posAtCoords`/`posAtDOM`, which is the same
 * mapping the caret uses. The cost is that a measurement triggers layout reads, so the
 * caller must run it from one coalesced pass per animation frame (see
 * `pageContent/paginator.ts`) and never per keystroke. That is the trade: correctness
 * from the engine that already lays the text out, paid for with coalescing.
 *
 * ## Rules kept here
 *
 * - **No `console.log`.**
 * - **No DOM at module scope.** `document`, `window` and `getComputedStyle` are touched
 *   only inside functions that the node view calls after mount, so importing this module
 *   during SSR is safe (only type-only imports sit at the top).
 * - **CSS lengths are resolved, not `parseFloat`ed** — see `./length.ts` (defect 12).
 * - **`IMG` children are measured** (defect 13: the legacy height calculator skipped
 *   them, so a QR code contributed zero height and could never trigger a break).
 */

import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import { PAGE_CONTENT_INNER_CLASS } from "../constant/dom";
import { resolveCssLengthOr } from "./length";
import type { MeasuredBlock, MeasuredLine } from "./pagination";

/**
 * 块中被浏览器排成一行的那个竖直条带。
 *
 * A vertical band of the block that the browser laid out as one line.
 */
interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 一次 `pageContent` 测量得到的结果。 / What one `pageContent` measured. */
export interface PageContentMeasurement {
  /**
   * 页面的块，按文档顺序，带绝对 ProseMirror 位置。
   *
   * The page's blocks, in document order, with absolute ProseMirror positions.
   */
  blocks: MeasuredBlock[];

  /**
   * 页面正文的可用高度：其边框盒高度减去内边距和边框。
   *
   * Usable height of the page body: its border-box height minus padding and borders.
   */
  contentHeight: number;
}

/** {@link measurePageContent} 所需的全部输入。 / Everything {@link measurePageContent} needs. */
export interface MeasurePageContentInput {
  /**
   * `pageContent` 节点视图的**外层**元素（`view.nodeDOM(contentPos)`）。
   *
   * The `pageContent` node view's **outer** element (`view.nodeDOM(contentPos)`).
   */
  element: HTMLElement;

  /** `pageContent` 节点本身。 / The `pageContent` node itself. */
  node: PMNode;

  /**
   * `pageContent` 节点**之前**的绝对 ProseMirror 位置。
   *
   * Absolute ProseMirror position **before** the `pageContent` node.
   */
  pos: number;

  /** 视图，用于 `posAtCoords`/`posAtDOM`。 / The view, for `posAtCoords`/`posAtDOM`. */
  view: EditorView;

  /**
   * 当测量遇到一张尚未加载完的图片时调用，它的高度还不是最终值。调用方据此重新安排一次
   * 遍历；没有它，含高图的页面会一直保留错误的分页，直到下一次按键。
   *
   * 可选，且每张图片在每个编辑器会话中至多调用一次。
   *
   * Called when the measurement met an image that has not finished loading, so its
   * height is not final yet. The caller re-schedules a pass; without this a page holding
   * a tall image would keep the wrong break until the next keystroke.
   *
   * Optional, and called at most once per image per editor session.
   */
  onImagePending?: () => void;
}

/**
 * 已经接上 {@link MeasurePageContentInput.onImagePending} 的图片。
 *
 * Images already wired to {@link MeasurePageContentInput.onImagePending}.
 */
const watchedImages = new WeakSet<HTMLImageElement>();

/**
 * 合理性上限：布局产出的行盒多于此数就不值得信任。
 *
 * Sanity cap: a layout that produced more line boxes than this is not worth trusting.
 */
const MAX_LINE_BOXES = 5000;

/**
 * 测量一个页面正文。
 *
 * 块的位置与正文的 DOM 子元素**按索引**配对：节点视图为每个块恰好渲染一个元素，
 * 因此第 n 个元素就是第 n 个子节点。（对块元素调用 `view.posAtDOM` 依赖 bias——
 * 按参数不同得到「节点之前」或「节点内部」——这正是缺陷 6 背后的歧义，所以它只用于
 * 文本节点，那里的答案没有歧义。）
 *
 * Measure one page body.
 *
 * Block positions are paired with the body's DOM children **by index**: a node view
 * renders exactly one element per block, so the n-th element is the n-th child node.
 * (`view.posAtDOM` on a block element is bias-dependent — "before the node" or "inside
 * it" depending on the argument — which is exactly the ambiguity behind defect 6, so it
 * is used only for text nodes, where the answer is unambiguous.)
 */
export function measurePageContent(input: MeasurePageContentInput): PageContentMeasurement {
  const contentElement = resolveContentElement(input.element);
  // The *inner* element carries the page margins as its padding (see `page.scss`), so the usable height is
  // that element's box minus its own padding. Measuring the outer one would silently hand the blocks the
  // margins as extra room.
  const contentHeight = availableContentHeight(contentElement);

  const blocks: MeasuredBlock[] = [];
  const elementChildren = contentElement.children;
  let index = 0;

  input.node.forEach((child, offset) => {
    const element = elementChildren.item(index);
    index += 1;
    if (!element) return;

    const blockPos = input.pos + 1 + offset;
    const height = measureBlockHeight(element as HTMLElement, child, input.onImagePending);

    if (child.isTextblock) {
      const lines = measureBlockLines(
        element as HTMLElement,
        child,
        blockPos,
        input.view,
        height
      );
      blocks.push({ pos: blockPos, size: child.nodeSize, height, lines, splittable: true });
      return;
    }

    // Tables, images, QR codes and every other atom: they can only ever move whole, so no
    // line model is produced and the engine will never cut them (defect 13).
    blocks.push({ pos: blockPos, size: child.nodeSize, height, splittable: false });
  });

  return { blocks, contentHeight };
}

/**
 * 块被渲染进的那个元素。
 *
 * 节点视图会返回一个独立的内层 `contentDOM`；兜底分支让测量器在没有我们的节点视图时
 * 渲染的页面正文上仍能工作（无头渲染，或替换掉它的调用方）。
 *
 * The element the blocks are rendered into.
 *
 * The node view returns a distinct inner `contentDOM`; the fallback keeps the measurer
 * working for a page body rendered without our node view (a headless render, or a
 * consumer that replaced it).
 */
export function resolveContentElement(outer: HTMLElement): HTMLElement {
  const first = outer.firstElementChild;
  if (first instanceof HTMLElement && first.classList.contains(PAGE_CONTENT_INNER_CLASS)) {
    return first;
  }
  return outer;
}

/**
 * 页面正文的可用高度，单位为 CSS 像素。
 *
 * 用的是边框盒（`getBoundingClientRect`，带小数且精确）减去解析后的内边距和边框宽度，
 * 而不是 `clientHeight`——后者会取整到整像素，并且不含边框；在 96 dpi 的 A4 纸上，
 * 单是取整每页就差出至多一个像素。
 *
 * Usable height of a page body, in CSS pixels.
 *
 * Uses the border box (`getBoundingClientRect`, fractional and exact) minus resolved
 * padding and border widths rather than `clientHeight`, which rounds to whole pixels and
 * excludes borders — on an A4 sheet at 96 dpi the rounding alone is up to a pixel per
 * page.
 */
export function availableContentHeight(element: HTMLElement): number {
  const view = element.ownerDocument?.defaultView;
  if (!view) return element.clientHeight;

  const rect = element.getBoundingClientRect();
  const style = view.getComputedStyle(element);
  const fontSize = resolveCssLengthOr(style.fontSize, 16);
  const context = { fontSize, rootFontSize: 16, percentBase: rect.height };

  const vertical =
    resolveCssLengthOr(style.paddingTop, 0, context) +
    resolveCssLengthOr(style.paddingBottom, 0, context) +
    resolveCssLengthOr(style.borderTopWidth, 0, context) +
    resolveCssLengthOr(style.borderBottomWidth, 0, context);

  return Math.max(0, rect.height - vertical);
}

/**
 * 一个块排布后的高度，含外边距。
 *
 * 主要来源是矩形（而不是 `offsetHeight`），因为对 `<img>` 这类行内替换元素它是正确的：
 * 图片节点渲染成的行内图片，其 `offsetHeight` 为 0，这正是缺陷 13 丢掉二维码和图片
 * 高度的原因。
 *
 * One block's laid-out height, margins included.
 *
 * The rect (not `offsetHeight`) is the primary source because it is correct for inline
 * replaced elements such as the `<img>` an image node renders as: `offsetHeight` is 0
 * for an inline image, which is precisely how defect 13 lost QR-code and image height.
 */
function measureBlockHeight(
  element: HTMLElement | null,
  node: PMNode,
  onImagePending: (() => void) | undefined
): number {
  if (!element) return 0;

  if (element.tagName === "IMG") {
    watchImage(element as HTMLImageElement, onImagePending);
  }

  const view = element.ownerDocument?.defaultView;
  const rect = element.getBoundingClientRect();
  let height = rect.height;

  if (!(height > 0)) {
    // Not laid out yet, or a node view that renders nothing visible. Fall back to the
    // box model, then to an explicitly authored CSS height.
    const style = view?.getComputedStyle(element);
    height = element.offsetHeight || element.scrollHeight;
    if (!(height > 0) && style) {
      const fontSize = resolveCssLengthOr(style.fontSize, 16);
      height = resolveCssLengthOr(style.height, 0, { fontSize, rootFontSize: 16 });
    }
  }

  let verticalMargins = 0;
  if (view) {
    const style = view.getComputedStyle(element);
    const fontSize = resolveCssLengthOr(style.fontSize, 16);
    const context = { fontSize, rootFontSize: 16, percentBase: rect.width };
    // Negative margins are ignored: a page-break budget should not be *reduced* by a
    // margin, and a collapsing negative margin inside the body is a layout bug that the
    // page break must not amplify.
    verticalMargins =
      Math.max(0, resolveCssLengthOr(style.marginTop, 0, context)) +
      Math.max(0, resolveCssLengthOr(style.marginBottom, 0, context));
  }

  // Snap to hundredths: the raw float carries binary noise that would make two passes
  // over an unchanged document produce micro-different totals, and the engine's tolerance
  // (1px) absorbs the remaining fraction.
  return round2(Math.max(0, height) + verticalMargins);
}

/**
 * 块的行盒，映射到 ProseMirror 偏移。
 *
 * 行盒是浏览器自己的（对块的内容调用 `Range.getClientRects()`），按竖直条带合并，
 * 因为一行视觉行可能产生多个矩形（一段粗体、一个行内原子、一个由标记产生的 `<span>`）。
 *
 * 只测量每一行的**起点**；一行的终点就是下一行的起点，最后一行的终点是块的内容末尾。
 * 这让各个范围在构造上就是连续的，让引擎里的求和保持精确，并且——因为 ProseMirror
 * 位置是行内节点之间的边界——保证任何行边界都不会落在行内原子（变量、二维码）内部，
 * 那正是缺陷 5 的根因。
 *
 * The block's line boxes, mapped to ProseMirror offsets.
 *
 * The line boxes are the browser's own (`Range.getClientRects()` over the block's
 * contents), merged by vertical band because one visual line can produce several rects
 * (a bold run, an inline atom, a `<span>` from a mark).
 *
 * Only each line's **start** is measured; a line ends where the next one begins, and the
 * last one ends at the block's content end. That makes the ranges contiguous by
 * construction, keeps the summation in the engine exact, and — because ProseMirror
 * positions are boundaries between inline nodes — guarantees that no line boundary can
 * fall inside an inline atom (a variable, a QR code), which is defect 5's root cause.
 */
function measureBlockLines(
  element: HTMLElement,
  node: PMNode,
  blockPos: number,
  view: EditorView,
  blockHeight: number
): MeasuredLine[] | undefined {
  const boxes = lineBoxesOf(element);
  if (boxes.length === 0) return undefined;

  const contentFrom = blockPos + 1;
  const contentTo = blockPos + node.nodeSize - 1;
  if (contentTo <= contentFrom) return undefined;

  const starts: number[] = [];
  let previous = contentFrom;

  for (const box of boxes) {
    const middle = (box.top + box.bottom) / 2;
    const hit = positionAtPoint(view, box.left + 1, middle);
    // Clamp into this block, then force monotonicity: a stale or rescaled rect must not
    // produce an out-of-order or inverted range.
    let start = hit === null ? previous : Math.min(Math.max(hit, contentFrom), contentTo);
    if (start < previous) start = previous;
    if (start >= contentTo) break;
    starts.push(start);
    previous = start;
  }

  if (starts.length === 0) return undefined;

  const averageLineHeight = round2(blockHeight / Math.max(1, boxes.length));
  const lines: MeasuredLine[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index];
    const to = index + 1 < starts.length ? starts[index + 1] : contentTo;
    if (to <= from) continue;

    const box = boxes[index];
    lines.push({
      text: lineText(node, blockPos, from, to),
      width: box ? round2(Math.max(0, box.right - box.left)) : 0,
      // The box height is used when it is meaningful; otherwise the block's average keeps
      // the engine's line-height arithmetic stable.
      height:
        box && box.bottom - box.top > 0 ? round2(box.bottom - box.top) : averageLineHeight,
      from,
      to
    });
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * 块的行条带，按视觉顺序，同一行的矩形已合并。
 *
 * The block's line bands, in visual order, with same-line rects merged.
 */
function lineBoxesOf(element: HTMLElement): LineBox[] {
  const doc = element.ownerDocument;
  if (!doc) return [];

  let raw: DOMRectList;
  try {
    const range = doc.createRange();
    range.selectNodeContents(element);
    raw = range.getClientRects();
  } catch {
    return [];
  }

  const rects: LineBox[] = [];
  const limit = Math.min(raw.length, MAX_LINE_BOXES);
  for (let index = 0; index < limit; index += 1) {
    const rect = raw[index];
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    rects.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  }

  rects.sort((a, b) => a.top - b.top || a.left - b.left);

  const merged: LineBox[] = [];
  for (const rect of rects) {
    const last = merged[merged.length - 1];
    // Two rects overlap vertically → they belong to one visual line.
    if (last && rect.top < last.bottom - 0.5 && rect.bottom > last.top + 0.5) {
      last.top = Math.min(last.top, rect.top);
      last.bottom = Math.max(last.bottom, rect.bottom);
      last.left = Math.min(last.left, rect.left);
      last.right = Math.max(last.right, rect.right);
      continue;
    }
    merged.push({ ...rect });
  }

  return merged;
}

/**
 * 视口坐标点处的 ProseMirror 位置；该点不在文字上时返回 `null`。
 *
 * The ProseMirror position at a viewport point, or `null` when the point is not over text.
 */
function positionAtPoint(view: EditorView, x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  try {
    const hit = view.posAtCoords({ left: x, top: y });
    return hit ? hit.pos : null;
  } catch {
    // `posAtCoords` walks the DOM tree; a detached or mid-update view can make it throw.
    // A measurement pass must never take the editor down with it.
    return null;
  }
}

/**
 * 一行覆盖的文字，仅用于诊断；绝不会被重新插入为文字（缺陷 5）。
 *
 * The text a line covers, for diagnostics only. Never re-inserted as text (defect 5).
 */
function lineText(node: PMNode, blockPos: number, from: number, to: number): string {
  try {
    // `Node.textBetween` offsets are relative to the *node start*, whose content begins at
    // 1 — hence the `- blockPos` rather than `- (blockPos + 1)`.
    return node.textBetween(from - blockPos, to - blockPos, "\n", (leaf) => leaf.type.name);
  } catch {
    return "";
  }
}

/**
 * 在仍在加载的图片加载完成后再测量一次。
 *
 * Re-measure once an image that was still loading has loaded.
 */
function watchImage(image: HTMLImageElement, onImagePending: (() => void) | undefined): void {
  if (!onImagePending || watchedImages.has(image)) return;
  if (image.complete) return;

  watchedImages.add(image);
  const notify = () => {
    image.removeEventListener("load", notify);
    image.removeEventListener("error", notify);
    onImagePending();
  };
  image.addEventListener("load", notify);
  image.addEventListener("error", notify);
}

/**
 * 保留两位小数，使对未改动文档的重复遍历结果完全一致。
 *
 * Two decimal places, so repeated passes over an unchanged document agree exactly.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
