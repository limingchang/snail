import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGINATION_TOLERANCE,
  planPagination,
  planPullback
} from "../../src/extensions/page/utils/pagination";
import type {
  MeasuredBlock,
  MeasuredLine,
  MoveRange
} from "../../src/extensions/page/utils/pagination";

/**
 * These tests exercise the pagination **engine** only. Measurement is injected, so the
 * whole breaking behaviour — including the defects it exists to prevent — is verified
 * without a DOM. The DOM measurer (`extensions/page/utils/measure.ts`) deliberately
 * stays outside this suite: it needs real layout, and asserting it against a fake would
 * assert a fiction (see the rationale in `vitest.config.ts`).
 *
 * Positions are chosen so that a line's `from`/`to` is also easy to read by hand:
 * a text block at `pos` has content `[pos + 1, pos + size - 1)`, split into 10-position
 * "characters" per line.
 */

const POSITIONS_PER_LINE = 10;
const BLOCK_OPEN_CLOSE = 2;

interface Placed {
  /** The block as the engine sees it. */
  measured: MeasuredBlock;
  /** `lineFroms[i]` is the ProseMirror position that line `i` starts at. */
  lineFroms: number[];
  /** The height of each of the block's lines, in pixels. */
  lineHeights: number[];
  /** True for an atom that must never be split. */
  atom: boolean;
}

/**
 * Build a paragraph-like block: `lineHeights.length` lines, each owning
 * {@link POSITIONS_PER_LINE} positions of content.
 */
function textBlock(pos: number, lineHeights: number[], splittable = true): Placed {
  const contentSize = lineHeights.length * POSITIONS_PER_LINE;
  const size = contentSize + BLOCK_OPEN_CLOSE;
  const lines: MeasuredLine[] = lineHeights.map((height, index) => {
    const from = pos + 1 + index * POSITIONS_PER_LINE;
    return {
      text: `line-${index}`,
      width: 100,
      from,
      to: from + POSITIONS_PER_LINE,
      height
    };
  });

  return {
    measured: {
      pos,
      size,
      height: lineHeights.reduce((total, height) => total + height, 0),
      lines,
      splittable
    },
    lineFroms: lines.map((line) => line.from),
    lineHeights,
    atom: false
  };
}

/** Build a leaf atom (image / QR code): one position, no content, never splittable. */
function atomBlock(pos: number, height: number): Placed {
  return {
    measured: { pos, size: 1, height, splittable: false },
    lineFroms: [],
    lineHeights: [],
    atom: true
  };
}

/** The block list a page sees. */
function blocksOf(placed: Placed[]): MeasuredBlock[] {
  return placed.map((entry) => entry.measured);
}

function metrics(contentHeight: number, tolerance = DEFAULT_PAGINATION_TOLERANCE) {
  return { contentHeight, tolerance };
}

/**
 * Apply a forward plan to a two-page model, exactly the way the orchestrator does:
 * every returned range leaves the current page and lands at the *start* of the next one
 * (in document order), and a `tail` range keeps the head of its block behind.
 */
function applyForwardPlan(
  current: Placed[],
  next: Placed[],
  move: MoveRange[]
): { current: Placed[]; next: Placed[] } {
  const kept: Placed[] = [];
  const moved: Placed[] = [];

  for (const entry of current) {
    const whole = move.find(
      (range) => range.kind === "block" && range.from === entry.measured.pos
    );
    if (whole) {
      moved.push(entry);
      continue;
    }

    const tail = move.find(
      (range) => range.kind === "tail" && range.blockPos === entry.measured.pos
    );
    if (tail) {
      const splitIndex = entry.lineFroms.indexOf(tail.from);
      expect(splitIndex, "a tail range must start on a measured line boundary").toBeGreaterThan(0);
      const head = textBlock(entry.measured.pos, entry.lineHeights.slice(0, splitIndex));
      // The tail keeps the same 10-position-per-line geometry, so its content starts
      // where the original block's did.
      const tailStart =
        entry.lineFroms[splitIndex] - (splitIndex * POSITIONS_PER_LINE) - 1;
      const tailBlock = textBlock(tailStart, entry.lineHeights.slice(splitIndex));
      kept.push(head);
      moved.push(tailBlock);
      continue;
    }

    kept.push(entry);
  }

  return { current: kept, next: [...moved, ...next] };
}

/**
 * Re-flow a document of pages until every page fits, mirroring
 * `paginateDocument`'s forward pass. Returns the settled pages.
 */
function reflow(
  pages: Placed[][],
  contentHeight: number,
  tolerance = DEFAULT_PAGINATION_TOLERANCE,
  maxSteps = 100
): Placed[][] {
  const result = pages.map((page) => [...page]);
  let pageIndex = 0;
  let steps = 0;

  while (pageIndex < result.length && steps < maxSteps) {
    steps += 1;
    const plan = planPagination(blocksOf(result[pageIndex]), metrics(contentHeight, tolerance));

    if (plan.move.length === 0) {
      pageIndex += 1;
      continue;
    }

    if (!result[pageIndex + 1]) result.push([]);
    const applied = applyForwardPlan(result[pageIndex], result[pageIndex + 1], plan.move);
    result[pageIndex] = applied.current;
    result[pageIndex + 1] = applied.next;
  }

  expect(steps, "reflow must terminate").toBeLessThan(maxSteps);
  return result;
}

describe("planPagination", () => {
  it("fits exactly at capacity and sheds nothing (defect 3)", () => {
    // Five lines of 20px = exactly 100px on a 100px page.
    const page = [textBlock(1, [20, 20, 20, 20, 20])];

    for (const tolerance of [0, 1, 4]) {
      const plan = planPagination(blocksOf(page), metrics(100, tolerance));
      expect(plan.fits).toBe(true);
      expect(plan.move).toEqual([]);
      expect(plan.oversized).toEqual([]);
    }
  });

  it("overflows by one line and moves only that line's offsets (defect 4/5)", () => {
    // Six lines of 20px = 120px on a 100px page: lines 0..4 fit, line 5 moves.
    const paragraph = textBlock(1, [20, 20, 20, 20, 20, 20]);
    const plan = planPagination(blocksOf([paragraph]), metrics(100));

    expect(plan.fits).toBe(false);
    expect(plan.move).toHaveLength(1);

    const [range] = plan.move;
    expect(range.kind).toBe("tail");
    expect(range.blockPos).toBe(1);
    // The cut is the *measured line boundary*, not a character count: line 5 starts at
    // 1 + 1 + 5 * 10 = 52.
    expect(range.from).toBe(52);
    expect(range.from).toBe(paragraph.lineFroms[5]);
    // …and the range ends at the block's content end: 1 + (60 + 2) - 1 = 62.
    expect(range.to).toBe(62);
    expect(range.to).toBe(paragraph.measured.pos + paragraph.measured.size - 1);
  });

  it("treats a block taller than a page as unplaceable when it is already alone (no loop)", () => {
    const image = atomBlock(1, 300);
    const plan = planPagination(blocksOf([image]), metrics(100));

    // Nothing to move: moving a 300px atom onto an empty 100px page would reproduce the
    // same overflow forever (TIPTAP_RESEARCH.md §2.1).
    expect(plan.move).toEqual([]);
    expect(plan.fits).toBe(true);
    expect(plan.oversized).toEqual([{ from: 1, to: 2 }]);
  });

  it("moves an oversized atom whole first, then stops instead of looping", () => {
    const small = textBlock(1, [20, 20]);
    const image = atomBlock(small.measured.pos + small.measured.size, 300);
    const page = blocksOf([small, image]);

    const first = planPagination(page, metrics(100));
    expect(first.move).toEqual([
      {
        from: image.measured.pos,
        to: image.measured.pos + image.measured.size,
        kind: "block",
        blockPos: image.measured.pos
      }
    ]);
    expect(first.oversized).toEqual([]);

    // Second pass: the image now starts an empty page, so it is reported and left alone.
    const second = planPagination(blocksOf([image]), metrics(100));
    expect(second.move).toEqual([]);
    expect(second.oversized).toHaveLength(1);
  });

  it("splits a paragraph taller than a page one page at a time (progress, not a loop)", () => {
    // 15 lines x 20px = 300px on a 100px sheet.
    const heights = Array.from({ length: 15 }, () => 20);
    let current = textBlock(1, heights);
    let guard = 0;

    while (guard < 20) {
      guard += 1;
      const plan = planPagination(blocksOf([current]), metrics(100));
      if (plan.move.length === 0) break;

      const [range] = plan.move;
      expect(range.kind).toBe("tail");
      const splitIndex = current.lineFroms.indexOf(range.from);
      expect(splitIndex).toBeGreaterThan(0);

      const remaining = current.lineHeights.length - splitIndex;
      // Each pass moves strictly fewer lines than the last, so this cannot spin.
      expect(remaining).toBeLessThan(current.lineHeights.length);
      const tailStart = current.lineFroms[splitIndex] - splitIndex * POSITIONS_PER_LINE - 1;
      current = textBlock(tailStart, current.lineHeights.slice(splitIndex));
    }

    expect(guard).toBeLessThan(20);
    // 300px of 20px lines on 100px pages: five lines per page, three pages.
    expect(guard).toBe(3);
  });

  it("moves an unsplittable block at the boundary whole, never mid-node (defect 13)", () => {
    const lead = textBlock(1, [20, 20]);
    const tablePos = lead.measured.pos + lead.measured.size;
    const table = atomBlock(tablePos, 60);

    // 40 + 60 = 100 on a 100px page is a *fit* — the boundary case defects 3 and 17 got wrong.
    expect(planPagination(blocksOf([lead, table]), metrics(100, 0)).fits).toBe(true);

    // At 90px the table no longer fits and must move as one node.
    const plan = planPagination(blocksOf([lead, table]), metrics(90, 0));
    expect(plan.move).toEqual([
      { from: tablePos, to: tablePos + 1, kind: "block", blockPos: tablePos }
    ]);
    expect(plan.oversized).toEqual([]);
  });

  it("accumulates across two pages and settles", () => {
    // Five 40px paragraphs on a 120px page: three fit, two accumulate onto page two.
    const positions = [1, 23, 45, 67, 89];
    const page = positions.map((pos) => textBlock(pos, [20, 20]));
    const settled = reflow([page], 120);

    expect(settled).toHaveLength(2);
    expect(settled[0]).toHaveLength(3);
    expect(settled[1]).toHaveLength(2);

    // A second re-flow of the already-settled document changes nothing: the plan is
    // idempotent, which is what stops the "one rAF pass per change" design from looping.
    const again = reflow(settled, 120);
    expect(again.map((entry) => entry.length)).toEqual([3, 2]);
  });

  it("keeps every returned endpoint on a boundary the measurer supplied", () => {
    // A block whose second line ends with an inline atom at position 20. The measurer
    // never offers an offset inside the atom, so a cut can only be before or after it.
    const paragraph = textBlock(1, [20, 20, 20, 20]);
    const atomFrom = paragraph.lineFroms[1] + POSITIONS_PER_LINE - 1; // 20
    const atomTo = atomFrom + 1; // 21

    const supplied = new Set<number>([
      paragraph.measured.pos,
      paragraph.measured.pos + paragraph.measured.size,
      paragraph.measured.pos + paragraph.measured.size - 1,
      ...paragraph.lineFroms
    ]);

    for (const contentHeight of [20, 40, 60, 80, 100]) {
      const plan = planPagination(blocksOf([paragraph]), metrics(contentHeight, 0));
      for (const range of plan.move) {
        expect(supplied.has(range.from), `from ${range.from} is not a supplied boundary`).toBe(true);
        expect(supplied.has(range.to), `to ${range.to} is not a supplied boundary`).toBe(true);
        // The atom occupies exactly one ProseMirror position, so no integer offset can
        // fall strictly inside it — the legacy character-count arithmetic could, which is
        // what replaced a straddling variable with its literal label (defect 5).
        expect(range.from <= atomFrom || range.from >= atomTo).toBe(true);
        expect(range.to <= atomFrom || range.to >= atomTo).toBe(true);
      }
    }

    // The specific cut for a two-line page is the line that starts right after the atom.
    const plan = planPagination(blocksOf([paragraph]), metrics(40, 0));
    expect(plan.move.map((range) => range.from)).toEqual([atomTo]);
  });

  it("reports nothing and moves nothing for an empty page", () => {
    expect(planPagination([], metrics(100))).toEqual({ move: [], fits: true, oversized: [] });
  });

  it("refuses to move anything when the page has no usable height (hidden container)", () => {
    const page = [textBlock(1, [20]), textBlock(23, [20])];
    const plan = planPagination(blocksOf(page), metrics(0));

    // A `display: none` subtree measures 0 for both the page and its blocks. The honest
    // answer is "do nothing" — never "move everything", which would empty the document.
    expect(plan.move).toEqual([]);
    expect(plan.oversized).toHaveLength(2);
  });
});

describe("planPullback", () => {
  it("pulls whole blocks back into the free space, and nothing when the first does not fit", () => {
    const next = [textBlock(100, [20, 20]), textBlock(122, [20, 20])];

    // 60px free: the first block (40px) fits, the second (40px) does not.
    expect(planPullback(blocksOf(next), metrics(60))).toEqual([
      { from: 100, to: 122, kind: "block", blockPos: 100 }
    ]);

    // Exactly the free space is still a fit — the same tolerance rule as forward.
    expect(planPullback(blocksOf(next), metrics(80))).toHaveLength(2);

    // 20px free cannot take a 40px block.
    expect(planPullback(blocksOf(next), metrics(20))).toEqual([]);
  });

  it("never pulls an atom back partially", () => {
    const image = atomBlock(1, 120);

    // 119px free with a 1px tolerance is *not* enough for a 120px block…
    expect(planPullback([image.measured], metrics(119, 0))).toEqual([]);
    // …while the default 1px tolerance treats an exactly-full page as a fit, the same rule
    // the forward pass uses (defect 3).
    expect(planPullback([image.measured], metrics(119))).toEqual([
      { from: 1, to: 2, kind: "block", blockPos: 1 }
    ]);
    expect(planPullback([image.measured], metrics(120, 0))).toEqual([
      { from: 1, to: 2, kind: "block", blockPos: 1 }
    ]);
  });
});
