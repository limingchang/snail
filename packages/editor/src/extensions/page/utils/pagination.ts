/**
 * The pagination engine.
 *
 * This module is deliberately **pure**: it takes measurement *results* and returns
 * ProseMirror offsets. It never touches the DOM, ProseMirror, or the editor, so its
 * whole breaking behaviour is unit-testable in a plain Node environment (see
 * `tests/page/pagination.spec.ts`). The DOM half lives in {@link ../utils/measure}.
 *
 * ## What it fixes
 *
 * | Legacy defect | How this engine avoids it |
 * | --- | --- |
 * | 3 — `slice(-0) === slice(0)` shed a whole paragraph at exact capacity | `overflow <= 0` and `overflowLines <= 0` both mean "fits" |
 * | 4 — character counts used as ProseMirror offsets | every range is a `from`/`to` **ProseMirror position**, never a length |
 * | 5 — overflow re-inserted as plain text | the plan returns offsets, so the caller moves the *real* slice with its marks and inline nodes |
 * | 13 — an unsplittable atom (table/image/QR) split mid-node | `splittable: false` always moves the whole node |
 * | §2.1 — an oversized unsplittable block loops the layout forever | such a block is *reported* in {@link PaginationPlan.oversized} and never moved |
 *
 * ## Coordinates
 *
 * A {@link MeasuredBlock} carries the absolute position of the block (`pos`) and its
 * `size` (ProseMirror `nodeSize`), so its content runs from `pos + 1` to
 * `pos + size - 1`. `$nodes(name).pos` is the position *before* a node — the legacy
 * code repeatedly used it as the position *inside* the node (defect 6) — so the
 * `contentEnd` helper below is the only place that arithmetic is written down.
 *
 * {@link MeasuredLine.from} / {@link MeasuredLine.to} are absolute ProseMirror
 * positions too. Because a ProseMirror position is always a boundary *between* inline
 * nodes (never inside an atom, which occupies exactly one position), a cut made at a
 * line boundary can never split a variable, a QR code or any other inline atom. The
 * engine additionally only ever cuts at a boundary the measurer supplied — it never
 * invents an offset — which the "never cuts an inline atom" test pins down.
 */

/** One laid-out line box of a block, as measured from the real DOM layout. */
export interface MeasuredLine {
  /** The line's text, for diagnostics only. The engine never re-inserts text. */
  text: string;

  /** The line box's width in CSS pixels. */
  width: number;

  /** Absolute ProseMirror position this line starts at (inclusive). */
  from: number;

  /** Absolute ProseMirror position this line ends at (exclusive). */
  to: number;

  /**
   * The line box's height in CSS pixels.
   *
   * Optional because a caller may not be able to measure per-line heights; the engine
   * then divides the block height by the line count instead.
   */
  height?: number;
}

/** A top-level block inside a `pageContent`, with the geometry the engine needs. */
export interface MeasuredBlock {
  /** Absolute ProseMirror position **before** the block; its content starts at `pos + 1`. */
  pos: number;

  /** The block's `nodeSize` (ProseMirror), i.e. `to - from` if the whole node moves. */
  size: number;

  /** Laid-out height in CSS pixels. */
  height: number;

  /**
   * The block's line boxes, in document order, when it can be split at all.
   *
   * Absent for atoms (image, QR code) and for anything that establishes its own
   * block formatting context (tables) — see {@link splittable}.
   */
  lines?: MeasuredLine[];

  /**
   * Whether the block may be broken *between* lines.
   *
   * `false` means "move it whole, always": a table, an image, a QR code, any atom.
   * Splitting one of those would either corrupt the node or (for a block taller than
   * the page) make the layout unstable.
   */
  splittable: boolean;
}

/** The space a single page offers, and how much measurement error to absorb. */
export interface PageMetrics {
  /** Usable height of the page's content box, in CSS pixels. */
  contentHeight: number;

  /**
   * Pixels of slack tolerated before something is considered to overflow.
   *
   * Fractional `getBoundingClientRect()` heights accumulate across a long contract, so
   * a page measured at 1000.4px against a 1000px box must not shed a paragraph. The
   * default is {@link DEFAULT_PAGINATION_TOLERANCE} (1px); pass `0` for exact
   * comparisons in tests.
   */
  tolerance: number;
}

/** How a moved range has to be re-inserted on the following page. */
export type MoveKind =
  /** The whole node at `[from, to)` moves and keeps its type, attributes and marks. */
  | "block"
  /** Only the tail of the block that owns `blockPos` moves, from `from` to the block's content end. */
  | "tail";

/** A range of the document that must leave the current page. */
export interface MoveRange {
  /** Absolute ProseMirror position, inclusive. */
  from: number;

  /** Absolute ProseMirror position, exclusive. */
  to: number;

  /** See {@link MoveKind}. */
  kind: MoveKind;

  /**
   * Absolute position of the block this range belongs to.
   *
   * For `kind: "tail"` the caller rebuilds the moved content with *this* node's type,
   * attributes and marks, so a split paragraph keeps its indentation, alignment and
   * inline formatting (defect 5). For `kind: "block"` it equals `from`.
   */
  blockPos: number;
}

/** A half-open ProseMirror range, used to report blocks that cannot be placed. */
export interface PlanRange {
  from: number;
  to: number;
}

/**
 * What the caller should do to one page.
 *
 * `fits === (move.length === 0)`: a page is "done" exactly when there is nothing left
 * to move. {@link oversized} is reported separately because it describes content that
 * moving cannot fix — the caller must leave it where it is or the layout oscillates.
 */
export interface PaginationPlan {
  /** Ranges to move to the following page, in ascending document order. */
  move: MoveRange[];

  /** True when the page needs no change at all. */
  fits: boolean;

  /**
   * Blocks that already sit at the top of an otherwise empty page and still do not fit.
   *
   * A table taller than the sheet, an image taller than the sheet, or a first line
   * taller than the sheet. Moving them would reproduce the same state on the next page
   * forever, which is the documented "infinite layout loop" of this approach
   * (`TIPTAP_RESEARCH.md` §2.1) — so the engine refuses to move them and reports them
   * instead. The caller may surface them to the user, but must not act on them.
   */
  oversized: PlanRange[];
}

/** Default {@link PageMetrics.tolerance}: one pixel of accumulated fractional error. */
export const DEFAULT_PAGINATION_TOLERANCE = 1;

/**
 * Plan one page.
 *
 * @param blocks The page's blocks in document order, already measured.
 * @param metrics The page's usable height and tolerance.
 * @returns The ranges to move to the next page, plus the blocks that cannot be placed.
 */
export function planPagination(blocks: MeasuredBlock[], metrics: PageMetrics): PaginationPlan {
  const tolerance = normaliseTolerance(metrics.tolerance);
  const contentHeight = Number.isFinite(metrics.contentHeight) ? metrics.contentHeight : 0;

  if (blocks.length === 0) {
    return { move: [], fits: true, oversized: [] };
  }

  // A page with no usable height can hold nothing at all. Report every block as
  // unplaceable rather than returning "move everything": moving cannot help, and a
  // caller that keeps trying would spin. (`contentHeight` is 0 in a hidden or
  // not-yet-laid-out container, where the honest answer is "do nothing".)
  if (contentHeight <= 0) {
    return {
      move: [],
      fits: false,
      oversized: blocks.map(wholeBlockRange)
    };
  }

  const limit = contentHeight + tolerance;
  const breaking = findBreakingBlock(blocks, limit);
  if (breaking < 0) {
    // Everything fits — including the exactly-full page, which is defect 3's case.
    return { move: [], fits: true, oversized: [] };
  }

  const breakingBlock = blocks[breaking];
  const usedBefore = totalHeight(blocks, breaking);
  const move: MoveRange[] = [];
  const oversized: PlanRange[] = [];

  const fittingLines = countFittingLines(breakingBlock, contentHeight - usedBefore, tolerance);

  if (fittingLines === null) {
    // Not splittable (table, image, QR code, atom) or no line information: the block
    // moves whole, never mid-node (defect 13).
    if (usedBefore <= 0) {
      // It is already alone at the top of the page and still overflows, so moving it
      // buys nothing. Report it and leave it in place.
      oversized.push(wholeBlockRange(breakingBlock));
    } else {
      move.push(wholeBlock(breakingBlock));
    }
  } else if (fittingLines <= 0) {
    // Not one line fits in the remaining space. If the page is empty this is a line
    // taller than the sheet — unplaceable. Otherwise the whole block moves, and the
    // next page (which starts empty) can usually split it.
    if (usedBefore <= 0) {
      oversized.push(wholeBlockRange(breakingBlock));
    } else {
      move.push(wholeBlock(breakingBlock));
    }
  } else if (fittingLines >= lineCount(breakingBlock)) {
    // The line model says the whole block fits even though its measured height
    // overflows — padding, a collapsed margin, or a stale measurement. Splitting on
    // contradictory evidence is worse than moving, so move the whole block.
    move.push(wholeBlock(breakingBlock));
  } else {
    // The real case: keep the lines that fit, move the rest as the block's tail, so the
    // caller can rebuild it with the same type/attrs/marks and the real inline content.
    const firstMoved = breakingBlock.lines?.[fittingLines];
    const tailFrom = firstMoved ? Math.max(firstMoved.from, breakingBlock.pos + 1) : -1;
    const tailTo = contentTypeEnd(breakingBlock);
    if (tailFrom >= 0 && tailTo > tailFrom) {
      move.push({
        from: tailFrom,
        to: tailTo,
        kind: "tail",
        blockPos: breakingBlock.pos
      });
    } else {
      // Degenerate measurement (a line that starts at or after the block's end). Never
      // produce an empty or inverted range; move the node instead.
      move.push(wholeBlock(breakingBlock));
    }
  }

  // Everything after the breaking block overflows by definition.
  for (let index = breaking + 1; index < blocks.length; index += 1) {
    move.push(wholeBlock(blocks[index]));
  }

  return { move, fits: move.length === 0, oversized };
}

/**
 * The mirror image of {@link planPagination}: the leading blocks of the *following*
 * page that fit back into a gap on the current one, so deleting content pulls text
 * back up instead of leaving a hole (defect 16).
 *
 * Deliberately whole-blocks-only. Word also fills the last line of a gap with the first
 * line of the next paragraph; doing that here would need a second `MoveKind` ("head")
 * and a matching rebuild rule, so the simpler, always-correct behaviour is used and the
 * limitation is documented rather than half-implemented.
 *
 * @param blocks The *next* page's blocks in document order.
 * @param metrics `contentHeight` is the free space on the current page.
 * @returns Ranges to move back, in ascending document order. Empty when even the first
 *   block does not fit.
 */
export function planPullback(blocks: MeasuredBlock[], metrics: PageMetrics): MoveRange[] {
  const tolerance = normaliseTolerance(metrics.tolerance);
  const contentHeight = Number.isFinite(metrics.contentHeight) ? metrics.contentHeight : 0;
  if (contentHeight <= 0) return [];

  const limit = contentHeight + tolerance;
  const picked: MoveRange[] = [];
  let used = 0;

  for (const block of blocks) {
    const height = safeHeight(block);
    // `used + height > limit` rather than `>=`: an exactly-full page is a fit, which is
    // the same rule as defect 3 — see planPagination.
    if (used + height > limit) break;
    used += height;
    picked.push(wholeBlock(block));
  }

  return picked;
}

/** Sum of the measured heights, ignoring `NaN`/negative values a broken layout may produce. */
export function heightOf(blocks: MeasuredBlock[]): number {
  return totalHeight(blocks, blocks.length);
}

/** Sum of the first `count` measured heights. */
function totalHeight(blocks: MeasuredBlock[], count: number): number {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += safeHeight(blocks[index]);
  }
  return total;
}

/** A single block's height, with `NaN`/negative values treated as zero. */
function safeHeight(block: MeasuredBlock): number {
  return Number.isFinite(block.height) && block.height > 0 ? block.height : 0;
}

/** The exclusive end of a block's *content*: `$nodes(name).pos + size - 1`. */
export function contentTypeEnd(block: MeasuredBlock): number {
  return block.pos + block.size - 1;
}

/** A `MoveRange` for the whole block, including its opening token. */
function wholeBlock(block: MeasuredBlock): MoveRange {
  return { from: block.pos, to: block.pos + block.size, kind: "block", blockPos: block.pos };
}

/** The whole block as a plain range, for {@link PaginationPlan.oversized} reporting. */
function wholeBlockRange(block: MeasuredBlock): PlanRange {
  return { from: block.pos, to: block.pos + block.size };
}

function lineCount(block: MeasuredBlock): number {
  return block.lines ? block.lines.length : 0;
}

/**
 * How many of the block's leading lines fit into `remaining` pixels.
 *
 * `null` means "this block has no usable line model" — unsplittable, or no lines at all.
 */
function countFittingLines(
  block: MeasuredBlock,
  remaining: number,
  tolerance: number
): number | null {
  const lines = block.lines;
  if (!block.splittable || !lines || lines.length === 0) return null;

  const available = remaining + tolerance;
  let used = 0;
  let fitting = 0;

  for (const line of lines) {
    const height = lineHeight(block, line);
    // `> available` and not `>=`: a line that ends exactly at the bottom edge fits.
    if (used + height > available) break;
    used += height;
    fitting += 1;
  }

  return fitting;
}

/**
 * One line's height: the measured value when the measurer provided one, otherwise the
 * block's average line height. Never negative and never `NaN`, so the accumulation
 * above cannot produce a non-monotonic count.
 */
function lineHeight(block: MeasuredBlock, line: MeasuredLine): number {
  if (typeof line.height === "number" && Number.isFinite(line.height) && line.height > 0) {
    return line.height;
  }
  const count = lineCount(block);
  if (count > 0 && Number.isFinite(block.height) && block.height > 0) {
    return block.height / count;
  }
  return 0;
}

/** Index of the first block whose cumulative height exceeds `limit`, or `-1`. */
function findBreakingBlock(blocks: MeasuredBlock[], limit: number): number {
  let used = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    used += safeHeight(blocks[index]);
    if (used > limit) return index;
  }
  return -1;
}

/** A non-finite or negative tolerance would make the comparison meaningless; treat it as 0. */
function normaliseTolerance(tolerance: number): number {
  return Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0;
}
