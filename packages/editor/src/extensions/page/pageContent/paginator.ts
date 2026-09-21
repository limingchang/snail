/**
 * 分页编排器。
 *
 * 它是唯一把该功能的三部分连接起来的代码：测量（`utils/measure.ts`）、纯引擎
 * （`utils/pagination.ts`）与 ProseMirror。
 *
 * ## 它如何驱动引擎
 *
 * 文档变化后只调度一轮（一次 rAF，合并多次请求）；首次测量会等待真实字体就绪（缺陷 15）。
 * 之后自上而下逐页进行：测量该页的 pageContent 得到 `MeasuredBlock[]`（绝对 PM 位置），
 * 交给 `planPagination(blocks, {contentHeight, tolerance})`；
 * `move === []` 时前进到下一页，否则派发**一次**事务（`addToHistory: false`）：切片从原始
 * 文档读取，区间按从后往前删除，片段插入到**下一个**正文的内容起点
 * （`contentStart(nextContent.pos)`，即 `pos + 1`——绝不是 `pos - 1`，也不是
 * `nextPage.pos + 1`，缺陷 6），并在同一轮里重编号、更新 `storage.total`；然后重新测量同一
 * 页（它可能仍然溢出）。最后自下而上：把整块内容拉回到还有空间的页面上（缺陷 16）。
 *
 * ## 各项防护，以及它们为什么存在
 *
 * - **只调度一轮。** 用 `requestAnimationFrame` 合并：一串连续按键只产生一次测量，而不是每个
 *   字符一次（缺陷 14 的代价、缺陷 2 里被反过来的输入法闸门）。
 * - **`running` / `storage.page.paginating`。** 分页从文档自身的更新周期内部派发事务，所以
 *   没有重入保护时，它产生的那次更新会带着过期位置重新进入这一轮（缺陷 7）。
 * - **每个事务都带 `addToHistory: false`。** 布局永远不该可撤销：否则一次 Ctrl+Z 撤销的会是
 *   分页，而不是用户的输入。
 * - **`MAX_STEPS`。** 一个硬性上限。引擎本身已经拒绝移动放不下的块（所以不会来回震荡），
 *   每个被接受的移动也都会真正把内容移出该页，但节点视图测量里的一个 bug 不该把编辑器挂住
 *   ——这种做法已知的失败模式是排版永远无法稳定（`TIPTAP_RESEARCH.md` §2.1）。
 * - **每轮的时间预算（`DEFAULT_PASS_BUDGET_MS`）。** 一轮 pass 每移动一次就派发一个事务，
 *   而每个事务都会重新渲染页面，所以在一次粘贴长合同这类需要几百次移动的文档上，单独一轮
 *   过去会占住主线程数**秒**——与卡死无法区分。现在一轮只跑几毫秒就停下并报告
 *   `interrupted`，插件在下一帧调度下一轮，于是浏览器有机会在中间绘制，工作也会在几帧内
 *   自然完成。
 * - **输入法合成期间的闸门。** 用户正在合成时不能从外部改动 ProseMirror 文档：这样做会重启
 *   合成，其变更事件又会调度新的一轮，从而再次打断合成。用输入法连续输入几个汉字正好会踩进
 *   这个循环。现在只要 `compositionstart` 之后还没有 `compositionend`（或 `view.composing`
 *   为真），这一轮就跳过；被推迟的那一轮会在合成结束的那一刻运行。
 * - **`MAX_CONSECUTIVE_PASSES`。** 预算自己造出的循环的安全阀：报告 `interrupted` 的一轮会
 *   再要一轮，所以真正无法稳定的排版会一直要下去。**用户**的事务会重置计数，因此正常的排版
 *   工作永远不会被砍断——只有自我喂养的循环会被砍断。
 *
 * ## 它刻意不做的事
 *
 * 它从不触碰 `pageHeader`、`pageFooter` 或 `pageLogo`。分页是**正文**的属性，而版面配件由
 * `createPageNode` 重复生成——这就是页码是一个在渲染时计算标签的节点，而不是把文字盖进
 * 每一页的原因（缺陷 1）。
 *
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
 * - **A time budget per pass (`DEFAULT_PASS_BUDGET_MS`).** A pass dispatches one transaction
 *   per move and each transaction re-renders the page, so a single pass over a document that
 *   needs hundreds of moves (a paste of a long contract) used to occupy the main thread for
 *   *seconds* — indistinguishable from a hang. The pass now stops after a few milliseconds,
 *   reports `interrupted`, and the plugin schedules the next one on the following frame, so
 *   the browser paints in between and the work simply finishes over a few frames.
 * - **A gate on IME composition.** ProseMirror's document must not be changed from outside
 *   while the user is mid-composition: doing so restarts the composition, whose mutation
 *   events schedule another pass, which interrupts the composition again. Typing several
 *   Chinese characters with an IME hit exactly that loop. A pass is now skipped while
 *   `compositionstart` has not been followed by `compositionend` (or while
 *   `view.composing`), and the deferred pass runs as soon as composition ends.
 * - **`MAX_CONSECUTIVE_PASSES`.** The safety valve for the loop the budget creates: a pass
 *   that reports `interrupted` asks for another one, so a layout that genuinely cannot
 *   stabilise would ask forever. A *user* transaction resets the counter, so honest work is
 *   never cut short — only a self-feeding loop is.
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

/**
 * 标识分页插件（可用于 `editor.unregisterPlugin`）。
 *
 * Identifies the pagination plugin (useful for `editor.unregisterPlugin`).
 */
export const paginationPluginKey = new PluginKey("snailPagePagination");

/**
 * 本模块派发的每个事务都会设置的 meta 键。
 *
 * 插件自己的 `update` 钩子会检查它，这样一轮 pass 不会永远给自己续期；它也让使用方能够
 * 识别（并忽略）纯布局事务。
 *
 * Meta key set on every transaction this module dispatches.
 *
 * The plugin's own `update` hook checks it so a pass does not re-schedule itself forever;
 * it also lets a consumer detect (and ignore) a layout-only transaction.
 */
export const PAGINATION_META = "snailPagination";

/**
 * 单轮 pass 工作量的上限，使错误的测量无法卡死编辑器。
 *
 * Upper bound on the work one pass may do, so a bad measurement cannot hang the editor.
 */
const MAX_STEPS = 200;

/**
 * 一轮 pass 在让出主线程之前最多可以运行多久，单位为毫秒。
 *
 * 取值小于 60 Hz 的一帧（约 16.7 ms），并给浏览器在同一帧里的其他工作留出余量。
 * `Infinity`（或非有限、负的取值）会关闭让出，确定性测试用的就是这种设置。
 *
 * How long one pass may run before it yields, in milliseconds.
 *
 * Chosen to be under a 60 Hz frame (~16.7 ms) with room for the browser's own work in the
 * same frame. `Infinity` (or a non-finite/negative value) disables the yield, which is what
 * the deterministic tests use.
 */
export const DEFAULT_PASS_BUDGET_MS = 12;

/**
 * 因预算被打断的 pass 最多可以连续串多少轮，之后循环就放弃。
 *
 * 只有真正的死循环才能达到这个数：普通的排版一两轮就会结束，而且任何用户编辑都会重置
 * 计数。
 *
 * How many budget-interrupted passes may chain before the loop gives up.
 *
 * Only a genuine loop can reach this: every ordinary layout finishes in one or two passes, and
 * any user edit resets the count.
 */
export const MAX_CONSECUTIVE_PASSES = 12;

/**
 * 一次 pass 的时间预算；传入非有限值或负数表示不设预算（`Infinity`），也就是一次跑完。
 *
 * The budget a pass may run for, with "no budget" resolved to `Infinity`.
 *
 * Resolves the budget a pass may run for. A non-finite or negative value means "no budget"
 * (`Infinity`), which is the deterministic behaviour `flush()` and the tests rely on.
 */
export function resolvePassBudget(budgetMs: number | undefined): number {
  const value = budgetMs ?? DEFAULT_PASS_BUDGET_MS;
  return Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

/**
 * 一次被预算打断的 pass 是否可以再要一帧。
 *
 * 中文：这是防死循环的阀门 —— pass 自己排下一次 pass 的能力必须有上限，否则一个永远稳定不下来
 * 的排版会让编辑器一直空转；用户的任何一次编辑都会把计数清零，所以正常的排版工作不会被砍断。
 *
 * Whether a pass that reported `interrupted` may ask for another frame. This is the valve that
 * stops the budget's own loop: a layout that never stabilises must not spin forever. Any user
 * transaction resets the counter, so honest layout work is never cut short.
 */
export function mayScheduleAnotherPass(interrupted: boolean, consecutive: number): boolean {
  return interrupted && consecutive < MAX_CONSECUTIVE_PASSES;
}

/**
 * 缺少 `requestAnimationFrame` 时，兜底调度器等待的时长（毫秒）。
 *
 * How many frames the fallback scheduler waits when `requestAnimationFrame` is absent.
 */
const FALLBACK_FRAME_MS = 16;

/**
 * 一轮 pass 所需的全部内容；通过参数传递而不是放在模块状态里，所以多轮 pass 不会互相串扰。
 *
 * Everything a pass needs; threaded through instead of module state, so passes cannot mix.
 */
interface PassContext {
  view: EditorView;
  editor: Editor;
  tolerance: number;
  /**
   * 派发本模块自己的一个事务（会置上插件检查的「轮到我们」标志）。
   *
   * Dispatch one of our own transactions (marks the "our turn" flag the plugin checks).
   */
  dispatch: (transaction: Transaction) => void;
  /**
   * 再要一轮 pass（图片加载完成时使用）。
   *
   * Ask for another pass (used when an image finishes loading).
   */
  schedule: () => void;
}

/**
 * {@link paginateDocument} 在 pass 上下文之上额外接受的选项。
 *
 * What {@link paginateDocument} accepts on top of the pass context.
 */
export interface PaginateDocumentOptions {
  /**
   * 这一轮 pass 可以运行的毫秒数。默认 {@link DEFAULT_PASS_BUDGET_MS}。
   *
   * Milliseconds this pass may run for. Default {@link DEFAULT_PASS_BUDGET_MS}.
   */
  budgetMs?: number;
  /**
   * 时钟，可注入，使测试能够强制预算到期。默认为单调时钟。
   *
   * Clock, injectable so a test can force the budget to expire. Defaults to a monotonic clock.
   */
  now?: () => number;
}

/**
 * 有单调时钟时就用它，这样墙上时钟的跳变不会让一轮 pass 提前结束。
 *
 * A monotonic clock where one exists, so a wall-clock jump cannot end a pass early.
 */
function monotonicNow(): number {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
}

/** 为 `editor` 创建分页插件。 / Create the pagination plugin for `editor`. */
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
      let composing = false;
      let consecutivePasses = 0;

      const storage = (): PageContentStorage => editor.storage.pageContent;
      const pageStorage = (): PageStorage | undefined => editor.storage.page as PageStorage | undefined;

      const setPaginating = (value: boolean): void => {
        const page = pageStorage();
        if (page) page.paginating = value;
      };

      /**
       * 是否有输入法合成正在进行。
       *
       * 这里同时参考两个来源，因为它们回答的问题略有不同：`compositionstart` /
       * `compositionend` 是浏览器自己的事件（也正是这个标志让一个*已结束*的合成能够调度被推迟
       * 的那一轮），而 `view.composing` 是 ProseMirror 对同一状态的看法——即使合成在本插件的
       * 视图出现之前就已经开始，它也会被设置。
       *
       * Whether an IME composition is in flight.
       *
       * Both sources are consulted because they answer slightly different questions:
       * `compositionstart`/`compositionend` are the browser's own events (and the flag is what
       * lets a *finished* composition schedule the deferred pass), while `view.composing` is
       * ProseMirror's view of the same state — set even when the composition started before this
       * plugin's view existed.
       */
      const isComposing = (): boolean => composing || view.composing === true;

      const onCompositionStart = (): void => {
        composing = true;
      };

      const onCompositionEnd = (): void => {
        composing = false;
        // The pass that was deferred while the user was composing, now that the document may be
        // changed again.
        schedule();
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
       * 首次测量之前先等文档的字体。
       *
       * Web 字体在首次绘制之后才换上，所以用兜底字体测量出的文档会重新排版，每个分页点都会
       * 移动。`document.fonts.ready` 是有文档记载的闸门（缺陷 15）。迟到的 `loadingdone` 会
       * 重新调度，因此在第一轮之后才到达的字体仍然会被重新测量。
       *
       * Wait for the document's fonts before the first measurement.
       *
       * Web fonts swap in after first paint, so a document measured with the fallback font
       * reflows and every break shifts. `document.fonts.ready` is the documented gate
       * (defect 15). A late `loadingdone` re-schedules, so a font that arrives after the
       * first pass still gets its re-measure.
       *
       * @returns 现在可以进行测量时返回 `true` / `true` when measurement may proceed now.
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

      /**
       * 立刻跑一轮 pass。`force` 为真时，即使自动分页已关闭也会运行。
       *
       * Run a pass now. `force` runs it even when automatic pagination is switched off.
       */
      const runNow = (force: boolean): boolean => {
        if (destroyed || running) return false;
        if (!force && !storage().autoPagination) return false;
        // Never change the document while the user is composing: see the module comment. The
        // composition's own `compositionend` schedules the pass that was skipped here.
        if (isComposing()) return false;
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

        // A pass that stopped on its budget asks for the next frame — up to a point. The
        // counter is reset by any user transaction, so this only ever cuts off a self-feeding
        // loop, never honest layout work.
        if (mayScheduleAnotherPass(diagnostics.interrupted, consecutivePasses)) {
          consecutivePasses += 1;
          schedule();
        } else {
          consecutivePasses = 0;
        }

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
      view.dom.addEventListener("compositionstart", onCompositionStart);
      view.dom.addEventListener("compositionend", onCompositionEnd);

      // The first pass runs once the view exists and the fonts have settled. An editor
      // mounted later than its document simply gets its first pass on the first edit.
      schedule();

      return {
        update: (_view, previousState) => {
          if (ourTurn) return;
          // A selection-only transaction cannot change layout: comparing document identity
          // is O(1) and skips the measurement entirely.
          if (view.state.doc === previousState.doc) return;
          // A real edit is new work, so the budget for chained passes starts over.
          consecutivePasses = 0;
          schedule();
        },
        destroy: () => {
          destroyed = true;
          cancel();
          if (fonts && typeof fonts.removeEventListener === "function") {
            fonts.removeEventListener("loadingdone", onLoadingDone);
          }
          view.dom.removeEventListener("compositionstart", onCompositionStart);
          view.dom.removeEventListener("compositionend", onCompositionEnd);
          storage().controller = null;
        }
      };
    }
  });
}

/**
 * 一次分页 pass：先把溢出的内容往后推，再把内容拉回来。
 *
 * 先往后推，因为只有上方的页面都稳定之后，某一页才可能算「满」；后拉回，因为它不能与前推
 * 相冲突（它只把内容移进前推已经宣告空闲的空间，所以结果不会再溢出）。
 *
 * 这一轮在 {@link PaginateDocumentOptions.budgetMs} 之后停下并报告 `interrupted: true`，
 * 剩下的由调用方调度。它在检查预算之前总会先完成至少一次移动，所以零毫秒的预算也能取得
 * 进展，不会什么都不做地空转。
 *
 * One pagination pass: push overflow forward, then pull content back.
 *
 * Forward first because a page can only be "full" once the pages above it are settled;
 * pull-back second because it must not fight the forward pass (it only moves content into
 * space the forward pass has already declared free, so the result cannot overflow again).
 *
 * The pass stops after {@link PaginateDocumentOptions.budgetMs} and reports
 * `interrupted: true`; the caller schedules the rest. It always completes at least one move
 * before checking the budget, so a zero-millisecond budget still makes progress and cannot
 * spin without doing anything.
 */
export function paginateDocument(
  context: PassContext,
  allowPullback: boolean,
  options: PaginateDocumentOptions = {}
): PaginationDiagnostics {
  let changed = false;
  let moved = 0;
  let oversized = 0;
  let interrupted = false;

  const now = options.now ?? monotonicNow;
  const budget = resolvePassBudget(options.budgetMs);
  const deadline = budget === Number.POSITIVE_INFINITY ? budget : now() + budget;

  let pageCursor = 0;
  let steps = 0;

  while (steps < MAX_STEPS) {
    // Checked before the work of a step, never between a plan and its dispatch: yielding
    // mid-move would leave the caller's position arithmetic half-applied.
    if (steps > 0 && now() > deadline) {
      interrupted = true;
      break;
    }

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

  // `steps` reached the cap rather than the end of the document: there is still work left.
  if (steps >= MAX_STEPS) interrupted = true;

  if (allowPullback && steps < MAX_STEPS && !interrupted) {
    const pullback = pullContentBack(context, MAX_STEPS - steps, { now, deadline });
    changed = changed || pullback.changed;
    moved += pullback.moved;
    if (pullback.interrupted) interrupted = true;
  }

  return {
    pages: collectPages(context.view.state.doc).length,
    moved,
    oversized,
    changed,
    interrupted
  };
}

/**
 * 测量一个页面正文；它的 DOM 还不可用时返回 `null`。
 *
 * Measure one page body, or `null` when its DOM is not available yet.
 */
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
 * 把计划好的区间移出 `page`，移进下一页的正文。
 *
 * 这里有两处顺序很重要，且都是刻意的：
 *
 * 1. **切片从原始文档读取**，在删除任何内容之前，所以区间的内容取自引擎报告的那些位置。
 * 2. **区间按从后往前删除。** 存在下一页时，所有会偏移的内容都在删除点*之后*，因此下一个
 *    正文的内容起点恰好左移被删除的位置数——这正是 `- removed` 修正的量。需要新建页面时，
 *    插入位置则改为在删除之后从 `tr.doc` 读取。
 *
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
 * 上方页面还有空间时，把整块内容从下面各页拉回来。
 *
 * 单次自下而上的扫描，每对页面测量一次：拉回之后，下面那一对仍然是针对*当前*文档测量的，
 * 所以扫描不会基于过期位置操作。向上遍历也是「删掉第 1 页的一段」能在同一轮里把第 4 页的
 * 好几段都往上挪、而不是每帧只挪一段的原因。
 *
 * 先删*后面*那一页，与前推顺序规则互为镜像：当前页完全在它之前，所以它的位置——以及它正文
 * 末尾的插入点——保持有效。
 *
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
  remainingSteps: number,
  clock: { now: () => number; deadline: number }
): { changed: boolean; moved: number; interrupted: boolean } {
  let changed = false;
  let moved = 0;
  let interrupted = false;
  let steps = 0;
  let index = collectPages(context.view.state.doc).length - 2;

  while (index >= 0 && steps < remainingSteps) {
    // The same yield as the forward pass: a pull-back dispatches one transaction per range.
    if (steps > 0 && clock.now() > clock.deadline) {
      interrupted = true;
      break;
    }

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

  if (steps >= remainingSteps) interrupted = true;

  return { changed, moved, interrupted };
}

/**
 * 把计划好的区间从 `next` 的正文移到 `current` 正文的末尾。
 *
 * Move the planned ranges from `next`'s body to the end of `current`'s body.
 */
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
 * 在同一轮里把 `index` 重写为 `1..n`，并刷新 `storage.total`。
 *
 * 由构造方式决定它很轻：只有当属性与页面的序号不一致时才去写它，所以对一份本来正确的文档
 * 重编号不会增加任何步骤（缺陷 10 恰恰相反——一个只增不减的一次性计数器，而且根本没有
 * 重编号）。
 *
 * 重编号和总数都在事务派发*之前*应用，因此在事务事件中读取 `storage.total` 的 `pageNumber`
 * 节点视图已经能看到新值。
 *
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

/**
 * 要插入的片段或节点，以及它占据的位置数。
 *
 * A fragment/node to insert, with the number of positions it occupies.
 */
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

/**
 * 把 `DOMNode` 收窄为元素，同时不导入 DOM 的节点类型表。
 *
 * Narrow a `DOMNode` to an element without importing the DOM node-type table.
 */
function asElement(dom: Node | null): HTMLElement | null {
  if (!dom) return null;
  return dom.nodeType === 1 ? (dom as HTMLElement) : null;
}
