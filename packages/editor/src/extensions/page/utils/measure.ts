/**
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

/** A vertical band of the block that the browser laid out as one line. */
interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** What one `pageContent` measured. */
export interface PageContentMeasurement {
  /** The page's blocks, in document order, with absolute ProseMirror positions. */
  blocks: MeasuredBlock[];

  /** Usable height of the page body: its border-box height minus padding and borders. */
  contentHeight: number;
}

/** Everything {@link measurePageContent} needs. */
export interface MeasurePageContentInput {
  /** The `pageContent` node view's **outer** element (`view.nodeDOM(contentPos)`). */
  element: HTMLElement;

  /** The `pageContent` node itself. */
  node: PMNode;

  /** Absolute ProseMirror position **before** the `pageContent` node. */
  pos: number;

  /** The view, for `posAtCoords`/`posAtDOM`. */
  view: EditorView;

  /**
   * Called when the measurement met an image that has not finished loading, so its
   * height is not final yet. The caller re-schedules a pass; without this a page holding
   * a tall image would keep the wrong break until the next keystroke.
   *
   * Optional, and called at most once per image per editor session.
   */
  onImagePending?: () => void;
}

/** Images already wired to {@link MeasurePageContentInput.onImagePending}. */
const watchedImages = new WeakSet<HTMLImageElement>();

/** Sanity cap: a layout that produced more line boxes than this is not worth trusting. */
const MAX_LINE_BOXES = 5000;

/**
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
  const contentHeight = availableContentHeight(input.element);

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

/** The block's line bands, in visual order, with same-line rects merged. */
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

/** The ProseMirror position at a viewport point, or `null` when the point is not over text. */
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

/** The text a line covers, for diagnostics only. Never re-inserted as text (defect 5). */
function lineText(node: PMNode, blockPos: number, from: number, to: number): string {
  try {
    // `Node.textBetween` offsets are relative to the *node start*, whose content begins at
    // 1 — hence the `- blockPos` rather than `- (blockPos + 1)`.
    return node.textBetween(from - blockPos, to - blockPos, "\n", (leaf) => leaf.type.name);
  } catch {
    return "";
  }
}

/** Re-measure once an image that was still loading has loaded. */
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

/** Two decimal places, so repeated passes over an unchanged document agree exactly. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
