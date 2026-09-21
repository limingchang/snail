/**
 * 分页引擎。
 *
 * 本模块刻意是**纯**的：它接收测量*结果*并返回 ProseMirror 偏移。它从不接触 DOM、
 * ProseMirror 或编辑器，因此它的全部断页行为都能在普通 Node 环境里做单元测试（见
 * `tests/page/pagination.spec.ts`）。DOM 那一半在 {@link ../utils/measure}。
 *
 * ## 它修掉了什么
 *
 * | 旧版缺陷 | 本引擎如何避开它 |
 * | --- | --- |
 * | 3 —— `slice(-0) === slice(0)` 满页丢整段 | `overflow <= 0`、`overflowLines <= 0` 即放得下 |
 * | 4 —— 用字符数当偏移 | 每个范围都是 `from`/`to` 的**位置**，绝非长度 |
 * | 5 —— 溢出内容被当作纯文本重新插入 | 计划返回偏移，由调用方移动*真实*切片 |
 * | 13 —— 不可拆的原子（表格/图片/二维码）被从中间拆开 | `splittable: false` 总是整体移动 |
 * | §2.1 —— 过大的不可拆块无限循环 | 会被报告在 {@link PaginationPlan.oversized}，且从不移动 |
 *
 * ## 坐标
 *
 * 一个 {@link MeasuredBlock} 带有块的绝对位置（`pos`）和它的 `size`（ProseMirror
 * `nodeSize`），因此它的内容从 `pos + 1` 到 `pos + size - 1`。`$nodes(name).pos` 是
 * 节点*之前*的位置——旧代码反复把它当成节点*内部*的位置（缺陷 6）——所以下面的
 * `contentEnd` 辅助函数是唯一写下这段算术的地方。
 *
 * {@link MeasuredLine.from} / {@link MeasuredLine.to} 同样是绝对 ProseMirror 位置。
 * 由于 ProseMirror 位置总是行内节点*之间*的边界（绝不在原子内部，原子恰好占一个位置），
 * 在行边界处切割绝不会拆开变量、二维码或任何其他行内原子。引擎另外还只会在测量器给出的
 * 边界处切割——它绝不凭空发明偏移——这一点由「绝不切开行内原子」的测试固定下来。
 *
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

/**
 * 块在真实 DOM 布局中测量出的一个排版行盒。
 *
 * One laid-out line box of a block, as measured from the real DOM layout.
 */
export interface MeasuredLine {
  /**
   * 该行的文字，仅用于诊断。引擎绝不会重新插入文字。
   *
   * The line's text, for diagnostics only. The engine never re-inserts text.
   */
  text: string;

  /** 行盒的宽度，单位为 CSS 像素。 / The line box's width in CSS pixels. */
  width: number;

  /**
   * 本行起始的绝对 ProseMirror 位置（含）。
   *
   * Absolute ProseMirror position this line starts at (inclusive).
   */
  from: number;

  /**
   * 本行结束的绝对 ProseMirror 位置（不含）。
   *
   * Absolute ProseMirror position this line ends at (exclusive).
   */
  to: number;

  /**
   * 行盒的高度，单位为 CSS 像素。
   *
   * 可选，因为调用方可能无法测量逐行高度；此时引擎改用块高度除以行数。
   *
   * The line box's height in CSS pixels.
   *
   * Optional because a caller may not be able to measure per-line heights; the engine
   * then divides the block height by the line count instead.
   */
  height?: number;
}

/**
 * 页面内容中的一个顶层块，带引擎所需的几何信息。
 *
 * A top-level block inside a `pageContent`, with the geometry the engine needs.
 */
export interface MeasuredBlock {
  /**
   * 块**之前**的绝对 ProseMirror 位置；它的内容从 `pos + 1` 开始。
   *
   * Absolute ProseMirror position **before** the block; its content starts at `pos + 1`.
   */
  pos: number;

  /**
   * 块的 `nodeSize`（ProseMirror），即整个节点移动时的 `to - from`。
   *
   * The block's `nodeSize` (ProseMirror), i.e. `to - from` if the whole node moves.
   */
  size: number;

  /** 排版后的高度，单位为 CSS 像素。 / Laid-out height in CSS pixels. */
  height: number;

  /**
   * 块的行盒，按文档顺序，前提是它可以被拆分。
   *
   * 对原子（图片、二维码）以及任何建立自身块格式化上下文的内容（表格）都不存在——
   * 见 {@link splittable}。
   *
   * The block's line boxes, in document order, when it can be split at all.
   *
   * Absent for atoms (image, QR code) and for anything that establishes its own
   * block formatting context (tables) — see {@link splittable}.
   */
  lines?: MeasuredLine[];

  /**
   * 块是否可以在行*之间*断开。
   *
   * `false` 意味着「永远整体移动」：表格、图片、二维码、任何原子。拆开其中之一要么会
   * 破坏该节点，要么（对高于页面的块）会让布局不稳定。
   *
   * Whether the block may be broken *between* lines.
   *
   * `false` means "move it whole, always": a table, an image, a QR code, any atom.
   * Splitting one of those would either corrupt the node or (for a block taller than
   * the page) make the layout unstable.
   */
  splittable: boolean;
}

/**
 * 单页提供的空间，以及要吸收多少测量误差。
 *
 * The space a single page offers, and how much measurement error to absorb.
 */
export interface PageMetrics {
  /**
   * 页面内容盒的可用高度，单位为 CSS 像素。
   *
   * Usable height of the page's content box, in CSS pixels.
   */
  contentHeight: number;

  /**
   * 在认为某物溢出之前容忍的像素余量。
   *
   * `getBoundingClientRect()` 的小数高度会在长合同上累积，因此在一个 1000px 的盒子里
   * 量出 1000.4px 的页面不该丢掉一个段落。默认值是
   * {@link DEFAULT_PAGINATION_TOLERANCE}（1px）；测试中传 `0` 可做精确比较。
   *
   * Pixels of slack tolerated before something is considered to overflow.
   *
   * Fractional `getBoundingClientRect()` heights accumulate across a long contract, so
   * a page measured at 1000.4px against a 1000px box must not shed a paragraph. The
   * default is {@link DEFAULT_PAGINATION_TOLERANCE} (1px); pass `0` for exact
   * comparisons in tests.
   */
  tolerance: number;
}

/**
 * 被移动的范围在下一页上必须如何重新插入。
 *
 * How a moved range has to be re-inserted on the following page.
 */
export type MoveKind =
  /**
   * `[from, to)` 处的整个节点会移动，并保留它的类型、属性和标记。
   *
   * The whole node at `[from, to)` moves and keeps its type, attributes and marks.
   */
  | "block"
  /**
   * 只有拥有 `blockPos` 的块的尾部会移动，从 `from` 到该块内容的末尾。
   *
   * Only the tail of the block that owns `blockPos` moves, from `from` to the block's content end.
   */
  | "tail";

/** 必须离开当前页的一段文档范围。 / A range of the document that must leave the current page. */
export interface MoveRange {
  /** 绝对 ProseMirror 位置，含端点。 / Absolute ProseMirror position, inclusive. */
  from: number;

  /** 绝对 ProseMirror 位置，不含端点。 / Absolute ProseMirror position, exclusive. */
  to: number;

  /** 见 {@link MoveKind}。 / See {@link MoveKind}. */
  kind: MoveKind;

  /**
   * 该范围所属块的绝对位置。
   *
   * 对 `kind: "tail"`，调用方用*这个*节点的类型、属性和标记重建被移动的内容，因此被切开的
   * 段落会保留它的缩进、对齐和行内格式（缺陷 5）。对 `kind: "block"`，它等于 `from`。
   *
   * Absolute position of the block this range belongs to.
   *
   * For `kind: "tail"` the caller rebuilds the moved content with *this* node's type,
   * attributes and marks, so a split paragraph keeps its indentation, alignment and
   * inline formatting (defect 5). For `kind: "block"` it equals `from`.
   */
  blockPos: number;
}

/**
 * 一个半开的 ProseMirror 范围，用于报告无法放置的块。
 *
 * A half-open ProseMirror range, used to report blocks that cannot be placed.
 */
export interface PlanRange {
  /** 绝对 ProseMirror 位置，含端点。 / Absolute ProseMirror position, inclusive. */
  from: number;
  /** 绝对 ProseMirror 位置，不含端点。 / Absolute ProseMirror position, exclusive. */
  to: number;
}

/**
 * 调用方应对一个页面做什么。
 *
 * `fits === (move.length === 0)`：没有任何东西需要移动时，页面正好「完成」。
 * {@link oversized} 单独报告，因为它描述的是移动无法解决的内容——调用方必须让它留在
 * 原处，否则布局会来回振荡。
 *
 * What the caller should do to one page.
 *
 * `fits === (move.length === 0)`: a page is "done" exactly when there is nothing left
 * to move. {@link oversized} is reported separately because it describes content that
 * moving cannot fix — the caller must leave it where it is or the layout oscillates.
 */
export interface PaginationPlan {
  /**
   * 要移到下一页的范围，按文档顺序升序。
   *
   * Ranges to move to the following page, in ascending document order.
   */
  move: MoveRange[];

  /** 页面完全不需要改动时为真。 / True when the page needs no change at all. */
  fits: boolean;

  /**
   * 已经位于一个空页顶部、却仍然放不下的块。
   *
   * 比纸张高的表格、比纸张高的图片，或比纸张高的第一行。移动它们会在下一页重现同样的
   * 状态，永远如此——这就是本方案有文档记载的「布局无限循环」
   * （`TIPTAP_RESEARCH.md` §2.1）——因此引擎拒绝移动它们，改为报告出来。调用方可以把它们
   * 展示给用户，但绝不能据此采取行动。
   *
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

/**
 * {@link PageMetrics.tolerance} 的默认值：累积小数误差的一个像素。
 *
 * Default {@link PageMetrics.tolerance}: one pixel of accumulated fractional error.
 */
export const DEFAULT_PAGINATION_TOLERANCE = 1;

/**
 * 规划一个页面。
 *
 * Plan one page.
 *
 * @param blocks 已测量的页面块 / The page's blocks in document order, already measured.
 * @param metrics 页面的可用高度与容差 / The page's usable height and tolerance.
 * @returns 要移到下一页的范围，以及无法放置的块 /
 *   The ranges to move to the next page, plus the blocks that cannot be placed.
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
 * {@link planPagination} 的镜像：*下一页*开头的块若能放回当前页的空隙，就放回去，
 * 这样删除内容会把文字往上拉，而不是留下一个洞（缺陷 16）。
 *
 * 刻意只处理整块。Word 还会用下一段的第一行填满空隙的最后一行；在这里那样做需要
 * 第二种 `MoveKind`（"head"）以及配套的重建规则，所以采用这个更简单、始终正确的行为，
 * 并把局限记录下来，而不是实现一半。
 *
 * The mirror image of {@link planPagination}: the leading blocks of the *following*
 * page that fit back into a gap on the current one, so deleting content pulls text
 * back up instead of leaving a hole (defect 16).
 *
 * Deliberately whole-blocks-only. Word also fills the last line of a gap with the first
 * line of the next paragraph; doing that here would need a second `MoveKind` ("head")
 * and a matching rebuild rule, so the simpler, always-correct behaviour is used and the
 * limitation is documented rather than half-implemented.
 *
 * @param blocks **下一页**的块，按文档顺序 / The *next* page's blocks in document order.
 * @param metrics 当前页的空闲空间即 `contentHeight` /
 *   `contentHeight` is the free space on the current page.
 * @returns 要移回的范围，按文档顺序升序；连第一个块都放不下时为空 /
 *   Ranges to move back, in ascending document order. Empty when even the first
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

/**
 * 测量高度之和，忽略坏布局可能产生的 `NaN`/负值。
 *
 * Sum of the measured heights, ignoring `NaN`/negative values a broken layout may produce.
 */
export function heightOf(blocks: MeasuredBlock[]): number {
  return totalHeight(blocks, blocks.length);
}

/** 前 `count` 个测量高度之和。 / Sum of the first `count` measured heights. */
function totalHeight(blocks: MeasuredBlock[], count: number): number {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += safeHeight(blocks[index]);
  }
  return total;
}

/**
 * 单个块的高度，`NaN`/负值按零处理。
 *
 * A single block's height, with `NaN`/negative values treated as zero.
 */
function safeHeight(block: MeasuredBlock): number {
  return Number.isFinite(block.height) && block.height > 0 ? block.height : 0;
}

/**
 * 块*内容*的不含端点的末尾：`$nodes(name).pos + size - 1`。
 *
 * The exclusive end of a block's *content*: `$nodes(name).pos + size - 1`.
 */
export function contentTypeEnd(block: MeasuredBlock): number {
  return block.pos + block.size - 1;
}

/**
 * 整个块的 `MoveRange`，包含它的起始标记。
 *
 * A `MoveRange` for the whole block, including its opening token.
 */
function wholeBlock(block: MeasuredBlock): MoveRange {
  return { from: block.pos, to: block.pos + block.size, kind: "block", blockPos: block.pos };
}

/**
 * 整个块作为普通范围，用于 {@link PaginationPlan.oversized} 报告。
 *
 * The whole block as a plain range, for {@link PaginationPlan.oversized} reporting.
 */
function wholeBlockRange(block: MeasuredBlock): PlanRange {
  return { from: block.pos, to: block.pos + block.size };
}

function lineCount(block: MeasuredBlock): number {
  return block.lines ? block.lines.length : 0;
}

/**
 * 块开头有多少行能放进 `remaining` 像素里。
 *
 * `null` 表示「这个块没有可用的行模型」——不可拆分，或完全没有行。
 *
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
 * 一行的高度：测量器给出了实测值就用它，否则用块的平均行高。绝不为负，也绝不是 `NaN`，
 * 因此上面的累加不会产生非单调的计数。
 *
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

/**
 * 累计高度超过 `limit` 的第一个块的下标，没有则为 `-1`。
 *
 * Index of the first block whose cumulative height exceeds `limit`, or `-1`.
 */
function findBreakingBlock(blocks: MeasuredBlock[], limit: number): number {
  let used = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    used += safeHeight(blocks[index]);
    if (used > limit) return index;
  }
  return -1;
}

/**
 * 非有限或负的容差会让比较失去意义；按 0 处理。
 *
 * A non-finite or negative tolerance would make the comparison meaningless; treat it as 0.
 */
function normaliseTolerance(tolerance: number): number {
  return Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0;
}
