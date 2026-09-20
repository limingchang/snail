/**
 * The pagination orchestrator.
 *
 * It is the only code that connects the three halves of the feature: measurement
 * (`utils/measure.ts`), the pure engine (`utils/pagination.ts`) and ProseMirror.
 *
 * ## How it drives the engine
 *
 * ```text
 * doc change ──▶ schedule (one rAF, coalesced)
 *                 │
 *                 ├─ document.fonts.ready  ── first measurement waits for the real font (defect 15)
 *                 │
 *                 ▼
 *            for each page, top-down:
 *              measure its pageContent  ──▶ MeasuredBlock[]  (absolute PM positions)
 *              planPagination(blocks, {contentHeight, tolerance})
 *                 │
 *                 ├─ move === []  ──▶ advance to the next page
 *                 └─ move !== []  ──▶ ONE transaction (addToHistory: false):
 *                                       slices read from the original doc,
 *                                       ranges deleted last-to-first,
 *                                       pieces inserted at the *next* body's content start
 *                                       (`contentStart(nextContent.pos)`, i.e. `pos + 1` —
 *                                       never `pos - 1` and never `nextPage.pos + 1`, defect 6),
 *                                       renumber + storage.total in the same pass
 *                                     then re-measure the same page (it may still overflow)
 *            then, bottom-up: pull whole blocks back onto a page with room (defect 16)
 * ```
 *
 * ## The guards, and why each one exists
 *
 * - **One scheduled pass.** `requestAnimationFrame`, coalesced: a burst of keystrokes
 *   produces one measurement, not one per character (defect 14's cost, defect 2's
 *   inverted IME gate).
 * - **`running` / `storage.page.paginating`.** Pagination dispatches from inside the
 *   document's own update cycle, so without a re-entrancy guard the update it produces
 *   re-enters the pass with stale positions (defect 7).
 * - **`addToHistory: false` on every transaction.** Layout must never be undoable: one
 *   Ctrl+Z would otherwise undo a page break instead of the user's typing.
 * - **`MAX_STEPS`.** A hard stop. The engine already refuses to move an unplaceable block
 *   (so it cannot oscillate), and every accepted move strictly removes content from the
 *   page, but a bug in a node view's measurement must not hang the editor — the documented
 *   failure mode of this approach is a layout that never stabilises
 *   (`TIPTAP_RESEARCH.md` §2.1).
 *
 * ## What it deliberately does not do
 *
 * It never touches `pageHeader`, `pageFooter` or `pageLogo`. The page break is a property
 * of the *body*, and the furniture is repeated by `createPageNode` — that is why a page
 * number is a node whose label is computed at render time rather than text stamped into
 * every page (defect 1).
 */

import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Fragment, Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import type { PageStorage } from "../typing/page";
import type { PageContentStorage, PaginationController, PaginationDiagnostics } from "../typing/pageContent";
import { createPageNode } from "../utils/createPage";
import { measurePageContent } from "../utils/measure";
import type { PageContentMeasurement } from "../utils/measure";
import { collectPages, contentStart, findPageContent } from "../utils/nodes";
import type { PageRef } from "../utils/nodes";
import { heightOf, planPagination, planPullback } from "../utils/pagination";
import type { MoveRange } from "../utils/pagination";

/** Identifies the pagination plugin (useful for `editor.unregisterPlugin`). */
export const paginationPluginKey = new PluginKey("snailPagePagination");

/**
 * Meta key set on every transaction this module dispatches.
 *
 * The plugin's own `update` hook checks it so a pass does not re-schedule itself forever;
 * it also lets a consumer detect (and ignore) a layout-only transaction.
 */
export const PAGINATION_META = "snailPagination";

/** Upper bound on the work one pass may do, so a bad measurement cannot hang the editor. */
const MAX_STEPS = 200;

/** How many frames the fallback scheduler waits when `requestAnimationFrame` is absent. */
const FALLBACK_FRAME_MS = 16;

/** Everything a pass needs; threaded through instead of module state, so passes cannot mix. */
interface PassContext {
  view: EditorView;
  editor: Editor;
  tolerance: number;
  /** Dispatch one of our own transactions (marks the "our turn" flag the plugin checks). */
  dispatch: (transaction: Transaction) => void;
  /** Ask for another pass (used when an image finishes loading). */
  schedule: () => void;
}

/** Create the pagination plugin for `editor`. */
export function createPaginationPlugin(options: { editor: Editor; tolerance: number }): Plugin {
  const { editor, tolerance } = options;

  return new Plugin({
    key: paginationPluginKey,

    view: (view) => {
      const ownerDocument = view.dom.ownerDocument;
      const fonts = ownerDocument ? ownerDocument.fonts : undefined;

      let frame: number | null = null;
      let frameKind: "raf" | "timeout" = "timeout";
      let running = false;
      let destroyed = false;
      let ourTurn = false;
      let fontsSettled = false;
      let fontsPromise: Promise<void> | null = null;

      const storage = (): PageContentStorage => editor.storage.pageContent;
      const pageStorage = (): PageStorage | undefined => editor.storage.page as PageStorage | undefined;

      const setPaginating = (value: boolean): void => {
        const page = pageStorage();
        if (page) page.paginating = value;
      };

      const cancel = (): void => {
        if (frame === null) return;
        if (frameKind === "raf" && typeof globalThis.cancelAnimationFrame === "function") {
          globalThis.cancelAnimationFrame(frame);
        } else {
          clearTimeout(frame as unknown as ReturnType<typeof setTimeout>);
        }
        frame = null;
      };

      const schedule = (): void => {
        if (destroyed || frame !== null) return;
        const run = (): void => {
          frame = null;
          runNow(false);
        };
        if (typeof globalThis.requestAnimationFrame === "function") {
          frameKind = "raf";
          frame = globalThis.requestAnimationFrame(run);
        } else {
          frameKind = "timeout";
          frame = setTimeout(run, FALLBACK_FRAME_MS) as unknown as number;
        }
      };

      /**
       * Wait for the document's fonts before the first measurement.
       *
       * Web fonts swap in after first paint, so a document measured with the fallback font
       * reflows and every break shifts. `document.fonts.ready` is the documented gate
       * (defect 15). A late `loadingdone` re-schedules, so a font that arrives after the
       * first pass still gets its re-measure.
       *
       * @returns `true` when measurement may proceed now.
       */
      const fontsReady = (): boolean => {
        if (fontsSettled) return true;
        if (!fonts || typeof fonts.ready?.then !== "function") {
          fontsSettled = true;
          return true;
        }
        if (!fontsPromise) {
          fontsPromise = Promise.resolve(fonts.ready)
            .then(() => {
              fontsSettled = true;
              schedule();
            })
            .catch(() => {
              fontsSettled = true;
              schedule();
            });
        }
        return false;
      };

      const context = (): PassContext => ({
        view,
        editor,
        tolerance,
        dispatch: (transaction) => {
          if (!transaction.docChanged) return;
          // Set around the dispatch so the `update` it triggers does not schedule another
          // pass: ProseMirror calls the plugin's `update` synchronously from `dispatch`.
          ourTurn = true;
          try {
            view.dispatch(transaction);
          } finally {
            ourTurn = false;
          }
        },
        schedule
      });

      /** Run a pass now. `force` runs it even when automatic pagination is switched off. */
      const runNow = (force: boolean): boolean => {
        if (destroyed || running) return false;
        if (!force && !storage().autoPagination) return false;
        if (!fontsReady()) return false;

        running = true;
        setPaginating(true);
        let diagnostics: PaginationDiagnostics;
        try {
          diagnostics = paginateDocument(context(), force);
        } finally {
          running = false;
          setPaginating(false);
        }
        storage().lastPlan = diagnostics;
        return diagnostics.changed;
      };

      const controller: PaginationController = {
        request: () => {
          if (destroyed) return;
          if (fontsSettled) {
            schedule();
            return;
          }
          // Not ready to measure yet: `fontsReady` schedules the pass once the fonts land.
          fontsReady();
        },
        flush: () => runNow(true),
        isRunning: () => running
      };

      storage().controller = controller;
      storage().tolerance = tolerance;

      const onLoadingDone = (): void => schedule();
      if (fonts && typeof fonts.addEventListener === "function") {
        fonts.addEventListener("loadingdone", onLoadingDone);
      }

      // The first pass runs once the view exists and the fonts have settled. An editor
      // mounted later than its document simply gets its first pass on the first edit.
      schedule();

      return {
        update: (_view, previousState) => {
          if (ourTurn) return;
          // A selection-only transaction cannot change layout: comparing document identity
          // is O(1) and skips the measurement entirely.
          if (view.state.doc === previousState.doc) return;
          schedule();
        },
        destroy: () => {
          destroyed = true;
          cancel();
          if (fonts && typeof fonts.removeEventListener === "function") {
            fonts.removeEventListener("loadingdone", onLoadingDone);
          }
          storage().controller = null;
        }
      };
    }
  });
}

/**
 * One pagination pass: push overflow forward, then pull content back.
 *
 * Forward first because a page can only be "full" once the pages above it are settled;
 * pull-back second because it must not fight the forward pass (it only moves content into
 * space the forward pass has already declared free, so the result cannot overflow again).
 */
export function paginateDocument(context: PassContext, allowPullback: boolean): PaginationDiagnostics {
  let changed = false;
  let moved = 0;
  let oversized = 0;

  let pageCursor = 0;
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps += 1;
    const pages = collectPages(context.view.state.doc);
    const page = pages[pageCursor];
    if (!page) break;

    const measurement = measurePage(page, context);
    if (!measurement) {
      pageCursor += 1;
      continue;
    }

    const plan = planPagination(measurement.blocks, {
      contentHeight: measurement.contentHeight,
      tolerance: context.tolerance
    });
    oversized += plan.oversized.length;

    if (plan.move.length === 0) {
      pageCursor += 1;
      continue;
    }

    if (!applyForwardMoves(context, page, plan.move)) {
      // The ranges could not be turned into a valid edit (a node view that reports a
      // position this document does not have). Skip the page rather than spin on it.
      pageCursor += 1;
      continue;
    }

    changed = true;
    moved += plan.move.length;
    // Stay on this page: it may still overflow after the move.
  }

  if (allowPullback && steps < MAX_STEPS) {
    const pullback = pullContentBack(context, MAX_STEPS - steps);
    changed = changed || pullback.changed;
    moved += pullback.moved;
  }

  return {
    pages: collectPages(context.view.state.doc).length,
    moved,
    oversized,
    changed
  };
}

/** Measure one page body, or `null` when its DOM is not available yet. */
function measurePage(page: PageRef, context: PassContext): PageContentMeasurement | null {
  const content = findPageContent(page);
  if (!content) return null;

  const dom = context.view.nodeDOM(content.pos);
  const element = asElement(dom);
  if (!element) return null;

  return measurePageContent({
    element,
    node: content.node,
    pos: content.pos,
    view: context.view,
    onImagePending: () => context.schedule()
  });
}

/**
 * Move the planned ranges out of `page` and into the following page's body.
 *
 * Ordering matters twice here and both are deliberate:
 *
 * 1. **Slices are read from the original document** before anything is deleted, so a
 *    range's content is taken from the positions the engine reported.
 * 2. **Ranges are deleted last-to-first.** With an existing next page, everything that
 *    shifts is *after* the deletions, so the next body's content start moves left by
 *    exactly the number of deleted positions — which is what `- removed` corrects. With a
 *    new page, the append position is read from `tr.doc` *after* the deletions instead.
 */
function applyForwardMoves(context: PassContext, page: PageRef, moves: MoveRange[]): boolean {
  const state = context.view.state;
  const doc = state.doc;

  const pieces: Array<{ content: PMNode | Fragment; size: number }> = [];
  for (const range of moves) {
    const piece = buildPiece(doc, range);
    if (!piece) return false;
    pieces.push(piece);
  }

  const transaction = state.tr;
  const ordered = [...moves].sort((left, right) => right.from - left.from);
  let removed = 0;
  for (const range of ordered) {
    transaction.delete(range.from, range.to);
    removed += range.to - range.from;
  }

  const pages = collectPages(doc);
  const nextPage = pages[page.ordinal];
  let cursor: number;

  if (nextPage) {
    const nextContent = findPageContent(nextPage);
    if (!nextContent) return false;
    // `contentStart` is `pos + 1`: the only valid insertion point inside the body
    // (defect 6 — `pos - 1` targets the page, `nextPage.pos + 1` targets its header).
    cursor = contentStart(nextContent.pos) - removed;
  } else {
    const built = createPageNode({
      schema: state.schema,
      template: pages[pages.length - 1] ?? page,
      attributes: { auto: true }
    });
    if (!built) return false;
    const appendPosition = transaction.doc.content.size;
    transaction.insert(appendPosition, built.node);
    cursor = appendPosition + built.contentOffset;
  }

  for (const piece of pieces) {
    transaction.replaceWith(cursor, cursor, piece.content);
    cursor += piece.size;
  }

  syncPageNumbers(context.editor, transaction);
  transaction.setMeta("addToHistory", false);
  transaction.setMeta(PAGINATION_META, true);
  context.dispatch(transaction);
  return true;
}

/**
 * Pull whole blocks back from each page onto the page above when there is room.
 *
 * A single bottom-up sweep, one measurement per page pair: after a pull-back, the pair
 * below is still measured against the *current* document, so the sweep cannot act on a
 * stale position. Iterating upwards is also what makes "delete a paragraph on page 1"
 * walk several paragraphs up from page 4 in one pass instead of one paragraph per frame.
 *
 * Deleting from the *following* page first is the mirror image of the forward pass's
 * ordering rule: the current page is entirely before it, so its positions — and the
 * insertion point at the end of its body — stay valid.
 */
function pullContentBack(
  context: PassContext,
  remainingSteps: number
): { changed: boolean; moved: number } {
  let changed = false;
  let moved = 0;
  let steps = 0;
  let index = collectPages(context.view.state.doc).length - 2;

  while (index >= 0 && steps < remainingSteps) {
    steps += 1;

    // Re-collected every iteration: a pull-back can remove an emptied automatic page, which
    // shifts every index above it.
    const pages = collectPages(context.view.state.doc);
    const current = pages[index];
    const next = pages[index + 1];
    index -= 1;
    if (!current || !next) continue;

    const measurement = measurePage(current, context);
    const nextMeasurement = measurePage(next, context);
    if (!measurement || !nextMeasurement) continue;
    if (nextMeasurement.blocks.length === 0) continue;

    const free = measurement.contentHeight - heightOf(measurement.blocks);
    if (free <= 0) continue;

    const ranges = planPullback(nextMeasurement.blocks, {
      contentHeight: free,
      tolerance: context.tolerance
    });
    if (ranges.length === 0) continue;
    if (!applyPullback(context, current, next, ranges)) continue;

    changed = true;
    moved += ranges.length;
  }

  return { changed, moved };
}

/** Move the planned ranges from `next`'s body to the end of `current`'s body. */
function applyPullback(
  context: PassContext,
  current: PageRef,
  next: PageRef,
  ranges: MoveRange[]
): boolean {
  const state = context.view.state;
  const doc = state.doc;

  const currentContent = findPageContent(current);
  const nextContent = findPageContent(next);
  if (!currentContent || !nextContent) return false;

  const pieces: Array<{ content: Fragment; size: number }> = [];
  for (const range of ranges) {
    const fragment = doc.slice(range.from, range.to).content;
    if (fragment.size === 0) return false;
    pieces.push({ content: fragment, size: fragment.size });
  }

  const transaction = state.tr;

  const ordered = [...ranges].sort((left, right) => right.from - left.from);
  for (const range of ordered) transaction.delete(range.from, range.to);

  // A page the engine created exists only to hold overflow: once its body is empty again,
  // it goes away. A page the *user* created (`insertPageBreak`, `addNewPage`) has
  // `auto: false` and is never removed implicitly.
  const emptiedBody = nextContent.node.childCount === ranges.length;
  if (emptiedBody && next.node.attrs.auto === true && collectPages(transaction.doc).length > 1) {
    // `next.node.nodeSize` is the size *before* the deletions above, so the page's live
    // geometry has to be re-read from the transaction's own document. Deleting the stale
    // range would reach past the (now shorter) page into its neighbour.
    const livePage = collectPages(transaction.doc)[next.ordinal - 1];
    if (livePage) transaction.delete(livePage.pos, livePage.pos + livePage.node.nodeSize);
  }

  // End of the current page's body: `pos + nodeSize - 1` is the position just before the
  // pageContent's closing token.
  let insertAt = currentContent.pos + currentContent.node.nodeSize - 1;
  for (const piece of pieces) {
    transaction.replaceWith(insertAt, insertAt, piece.content);
    insertAt += piece.size;
  }

  syncPageNumbers(context.editor, transaction);
  transaction.setMeta("addToHistory", false);
  transaction.setMeta(PAGINATION_META, true);
  context.dispatch(transaction);
  return true;
}

/**
 * Rewrite `index` to `1..n` and refresh `storage.total`, in one pass.
 *
 * Cheap by construction: the attribute is only touched when it disagrees with the page's
 * ordinal, so a renumbering of an already-correct document adds no steps at all (defect 10
 * was the opposite — a write-once counter that only ever grew, and no renumbering at all).
 *
 * Both the renumbering and the total are applied *before* the transaction is dispatched,
 * so a `pageNumber` node view reading `storage.total` during the transaction event already
 * sees the new value.
 */
export function syncPageNumbers(editor: Editor, transaction: Transaction): void {
  const pages = collectPages(transaction.doc);

  const storage = editor.storage.page as PageStorage | undefined;
  if (storage && storage.total !== pages.length) storage.total = pages.length;

  for (const page of pages) {
    if (page.node.attrs.index === page.ordinal) continue;
    transaction.setNodeAttribute(page.pos, "index", page.ordinal);
  }
}

/** A fragment/node to insert, with the number of positions it occupies. */
function buildPiece(doc: PMNode, range: MoveRange): { content: PMNode | Fragment; size: number } | null {
  if (range.to <= range.from) return null;

  if (range.kind === "block") {
    const fragment = doc.slice(range.from, range.to).content;
    if (fragment.size === 0) return null;
    return { content: fragment, size: fragment.size };
  }

  const owner = doc.nodeAt(range.blockPos);
  if (!owner || !owner.isTextblock) return null;

  // The moved tail is re-wrapped in the *same* node type with the same attributes and
  // marks, so a split paragraph keeps its indentation, alignment and inline formatting
  // instead of arriving as plain text (defect 5).
  const tail = doc.slice(range.from, range.to).content;
  if (tail.size === 0) return null;
  const rebuilt = owner.type.create(owner.attrs, tail, owner.marks);
  return { content: rebuilt, size: rebuilt.nodeSize };
}

/** Narrow a `DOMNode` to an element without importing the DOM node-type table. */
function asElement(dom: Node | null): HTMLElement | null {
  if (!dom) return null;
  return dom.nodeType === 1 ? (dom as HTMLElement) : null;
}
