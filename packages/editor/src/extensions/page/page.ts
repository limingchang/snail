/**
 * `Page`——一张纸。
 *
 * NodeSpec 的 `content` 可以是函数，Tiptap 会用扩展自己的上下文（含 `options` 和 `editor`）通过
 * `callOrReturn` 调用它，所以页面的内容表达式由实际存在的页眉 / 页脚节点类型拼出来：
 * `Page.configure({ header: false })` 得到 `(pageContent | pageFooter | pageLogo)*`，而只有正文的
 * 文档得到 `pageContent*`。另一种做法——写死 `(pageHeader | pageContent | pageFooter)*`——会抛出
 * `RangeError: Unknown node type in content expression`，或者更糟：构建出一个页面永远无法接受使用方
 * 内容的 schema。
 *
 * `setPageMargins`、`setPageFormat` 和 `setPageOrientation` 默认作用于**每一页**；旧版只改包含选区
 * 的页面并无条件返回 `true`（缺陷 17），于是设置面板看起来生效了却只改了一张纸。现在它们在没有实际
 * 变化时都返回 `false`，可选的 `pageIndex` 参数才是把改动收窄到单页的手段。
 *
 * `Page` — one sheet of paper.
 *
 * ## The content expression is a function of what is registered
 *
 * A NodeSpec's `content` may be a function, and Tiptap calls it (through `callOrReturn`)
 * with the extension's own context — including `options` and `editor`. So the page's
 * content expression is built from the furniture node types that actually exist:
 * `Page.configure({ header: false })` yields `(pageContent | pageFooter | pageLogo)*`, and
 * a document where only the body exists yields `pageContent*`. The alternative — a
 * hard-coded `(pageHeader | pageContent | pageFooter)*` — throws
 * `RangeError: Unknown node type in content expression` (or, worse, builds a schema whose
 * page can never accept the consumer's content).
 *
 * ## Commands are document-wide unless told otherwise
 *
 * `setPageMargins`, `setPageFormat` and `setPageOrientation` apply to **every** page. The
 * legacy versions only touched the page containing the selection and returned `true`
 * unconditionally (defect 17), so the settings panel looked like it worked and changed one
 * sheet. Every one of them now returns `false` when nothing actually changed, and the
 * optional `pageIndex` argument is what narrows a change to a single page.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps, Editor, Extensions } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";

import { resolveMargins } from "../../typings/paper";
import type { Margins, Orientation, PaperFormat, ResolvedMargins } from "../../typings/paper";
import {
  DATA_TYPE,
  DEFAULT_ORIENTATION,
  DEFAULT_PAGE_AUTO,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAPER_FORMAT,
  PAGE_CLASS
} from "./constant";
import { PageContent } from "./pageContent/pageContent";
import { PageFooter } from "./pageFooter/pageFooter";
import { PageHeader } from "./pageHeader/pageHeader";
import { PageLogo } from "./pageLogo/pageLogo";
import { PageNumber } from "./pageNumber/pageNumber";
import { PageRegion } from "./pageRegion/pageRegion";
import { renderPageNodeView } from "./pageView";
import type { PageAttributes, PageContentOptions, PageOptions, PageStorage } from "./typing";
import { createPageNode } from "./utils/createPage";
import { createFurnitureRegionsPlugin, createFurnitureSyncPlugin } from "./utils/furniture";
import { createFurnitureEditingPlugin } from "./utils/furnitureEditing";
import {
  collectPages,
  contentStart,
  findPageContent,
  PAGE_FOOTER_NODE,
  PAGE_HEADER_NODE,
  PAGE_NODE,
  resolvePageContentExpression
} from "./utils/nodes";
import type { PageFurnitureFlags, PageRef } from "./utils/nodes";

/**
 * `page` 扩展：纸张节点，承载正文与页眉 / 页脚，并注册它们需要的插件。
 *
 * The `page` extension: the sheet node that hosts the body, the header/footer and the
 * plugins they need.
 */
export const Page = Node.create<PageOptions, PageStorage>({
  name: PAGE_NODE,
  // `priority` keeps the page above the generic block extensions when Tiptap sorts
  // extensions (the legacy used 1001 for the same reason).
  priority: 1001,

  /**
   * 一个函数，由 Tiptap 针对实际注册的扩展解析。见模块注释。
   *
   * A function, resolved by Tiptap against the extensions that were actually registered.
   * See the module comment.
   */
  content() {
    return resolvePageContentExpression(readFurnitureFlags(this.options, this.editor));
  },

  addOptions() {
    return {
      paperFormat: DEFAULT_PAPER_FORMAT,
      orientation: DEFAULT_ORIENTATION,
      margins: DEFAULT_PAGE_MARGINS,
      header: {},
      footer: {},
      logo: {},
      pageNumber: {},
      region: {},
      pagination: {},
      HTMLAttributes: {}
    };
  },

  /**
   * 页眉 / 页脚扩展，默认包含，也可以逐个移除。
   *
   * `PageHeader` / `PageFooter` / `PageRegion` / `PageLogo` / `PageNumber` 由页面*拥有*（重建笔记的
   * 决策 1）：配置页面才决定它们之中哪些存在，因而也决定上面的内容表达式能包含什么。`PageContent`
   * 始终存在——它是页面的正文，不是页眉 / 页脚。
   *
   * The furniture extensions, included by default and removable one by one.
   *
   * `PageHeader`/`PageFooter`/`PageRegion`/`PageLogo`/`PageNumber` are *owned* by the page
   * (decision 1 of the rebuild notes): configuring the page is what decides which of them exist,
   * and therefore what the content expression above can contain. `PageContent` is always
   * present — it is the page's body, not furniture.
   */
  addExtensions() {
    const extensions: Extensions = [PageContent.configure(readPaginationOptions(this.options))];

    if (this.options.header !== false) extensions.unshift(PageHeader.configure(this.options.header));
    if (this.options.footer !== false) extensions.push(PageFooter.configure(this.options.footer));
    // The thirds of a band. Registered even when a band is not configured, because a consumer may
    // register `PageHeader` itself, and the regions it needs must exist for its content to be
    // valid.
    extensions.push(PageRegion.configure(this.options.region ?? {}));
    if (this.options.logo !== false) extensions.push(PageLogo.configure(this.options.logo));
    if (this.options.pageNumber !== false) {
      extensions.push(PageNumber.configure(this.options.pageNumber));
    }

    return extensions;
  },

  /**
   * 页眉 / 页脚需要的两个插件，只注册**一次**——放在这里而不是栏上，因为一个文档有两条栏，每条栏
   * 一个插件会把同一个文档归一化两遍。
   *
   * 区域归一化器把每条栏保持在恰好三个可用区域（见 `utils/regions.ts`），这同样也是修复在区域出现
   * 之前写下的模板的手段；编辑插件负责「哪三分之一正在被编辑」，以及在没有栏打开时拒绝页眉 / 页脚
   * 内部文档改动的事务过滤器（见 `utils/furnitureEditing.ts`）。
   *
   * The two plugins the furniture needs, registered **once** — here rather than on a band, because
   * a document has two bands and a plugin per band would normalise the same document twice.
   *
   * - the region normaliser keeps every band at exactly three usable regions (see
   *   `utils/regions.ts`), which is also what repairs a template written before regions existed;
   * - the editing plugin owns "which third is being edited" and the transaction filter that
   *   refuses a document change inside furniture while no band is open
   *   (see `utils/furnitureEditing.ts`).
   */
  addProseMirrorPlugins() {
    return [
      createFurnitureRegionsPlugin(),
      // After the normaliser: the structure has to be right before it is copied around.
      createFurnitureSyncPlugin(),
      createFurnitureEditingPlugin({
        onLockedRegion: (region) => this.options.onLockedFurniture?.(region)
      })
    ];
  },

  addStorage(): PageStorage {
    return {
      // Recomputed by every structural change, never incremented (defect 10).
      total: 0,
      // Re-entrancy guard for the pagination pass (defect 7).
      paginating: false
    };
  },

  addAttributes() {
    return {
      index: {
        default: DEFAULT_PAGE_INDEX,
        parseHTML: (element) => readIndexAttribute(element.getAttribute("data-index")),
        renderHTML: (attributes) => ({ "data-index": String(attributes.index) })
      },
      paperFormat: { default: this.options.paperFormat },
      orientation: { default: this.options.orientation },
      margins: { default: this.options.margins },
      auto: {
        default: DEFAULT_PAGE_AUTO,
        parseHTML: (element) => element.getAttribute("data-auto") === "true",
        renderHTML: (attributes) => (attributes.auto === true ? { "data-auto": "true" } : {})
      }
    };
  },

  /**
   * 只有我们自己的标记才会生成页面。
   *
   * 旧版 `parseHTML` 是 `[{ tag: "section" }]`，于是粘贴任何 HTML `section`——Word 或网页剪贴板里
   * 到处都是——都会悄悄创建一个页面（缺陷 17）。
   *
   * Only our own markup mints a page.
   *
   * The legacy `parseHTML` was `[{ tag: "section" }]`, so pasting any HTML section — which
   * a Word or web page clipboard is full of — silently created a page (defect 17).
   */
  parseHTML() {
    return [{ tag: `section[data-type="${DATA_TYPE.page}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: PAGE_CLASS,
        "data-type": DATA_TYPE.page
      }),
      0
    ];
  },

  addNodeView() {
    return renderPageNodeView();
  },

  addCommands() {
    return {
      setPageMargins:
        (margins: Margins | Partial<ResolvedMargins>, pageIndex?: number) =>
        ({ state, tr, dispatch }): boolean => {
          let changed = false;
          for (const page of selectPages(state.doc, pageIndex)) {
            const next = mergeMargins(page.node.attrs.margins, margins);
            if (marginsEqual(page.node.attrs.margins, next)) continue;
            // Attribute steps do not shift positions, so one ascending pass is safe.
            tr.setNodeAttribute(page.pos, "margins", next);
            changed = true;
          }
          if (changed && dispatch) dispatch(tr);
          return changed;
        },

      setPageFormat:
        (paperFormat: PaperFormat, pageIndex?: number) =>
        ({ state, tr, dispatch }): boolean => {
          let changed = false;
          for (const page of selectPages(state.doc, pageIndex)) {
            if (paperFormatsEqual(page.node.attrs.paperFormat, paperFormat)) continue;
            tr.setNodeAttribute(page.pos, "paperFormat", paperFormat);
            changed = true;
          }
          if (changed && dispatch) dispatch(tr);
          return changed;
        },

      setPageOrientation:
        (orientation: Orientation, pageIndex?: number) =>
        ({ state, tr, dispatch }): boolean => {
          let changed = false;
          for (const page of selectPages(state.doc, pageIndex)) {
            if (page.node.attrs.orientation === orientation) continue;
            tr.setNodeAttribute(page.pos, "orientation", orientation);
            changed = true;
          }
          if (changed && dispatch) dispatch(tr);
          return changed;
        },

      addPage:
        (attributes?: Partial<PageAttributes>) =>
        ({ state, tr, dispatch }): boolean => {
          const pages = collectPages(state.doc);
          const current = pageAtSelection(state.doc, state.selection.from);
          const template = current ?? pages[pages.length - 1] ?? null;
          const built = createPageNode({ schema: state.schema, template, attributes });
          if (!built) return false;

          const insertPos = current ? current.pos + current.node.nodeSize : state.doc.content.size;
          tr.insert(insertPos, built.node);
          // Put the caret in the new page, so the next keystroke lands where the user
          // expects (the legacy re-selected with `setTextSelection`, sometimes at a
          // position inside the *next* page's header — defect 6).
          select(tr, insertPos + built.contentOffset);
          if (dispatch) dispatch(tr);
          return true;
        },

      addNewPage:
        () =>
        ({ state, tr, dispatch }): boolean => {
          const pages = collectPages(state.doc);
          const built = createPageNode({
            schema: state.schema,
            template: pages[pages.length - 1] ?? null,
            attributes: { auto: false }
          });
          if (!built) return false;

          const insertPos = state.doc.content.size;
          tr.insert(insertPos, built.node);
          select(tr, insertPos + built.contentOffset);
          if (dispatch) dispatch(tr);
          return true;
        },

      insertPageBreak:
        () =>
        ({ state, tr, dispatch }): boolean => {
          const page = pageAtSelection(state.doc, state.selection.from);
          if (!page) return false;

          const content = findPageContent(page);
          if (!content) return false;

          const bodyFrom = contentStart(content.pos);
          const bodyTo = content.pos + content.node.nodeSize - 1;
          const caret = Math.min(Math.max(state.selection.from, bodyFrom), bodyTo);

          // Split the block the caret is in, so a page break in the middle of a paragraph
          // moves the paragraph's tail (with its attributes and marks) rather than the
          // whole block.
          const split = splitAtCaret(state.doc, caret, bodyTo);
          const built = createPageNode({
            schema: state.schema,
            template: page,
            content: split.moved,
            attributes: { auto: false }
          });
          if (!built) return false;

          tr.delete(split.from, bodyTo);

          // The current page is now shorter, so its end has moved left by exactly the
          // number of deleted positions; re-read it from the transaction's own document
          // instead of doing that arithmetic by hand.
          const current = collectPages(tr.doc)[page.ordinal - 1];
          if (!current) return false;
          const insertPos = current.pos + current.node.nodeSize;
          tr.insert(insertPos, built.node);
          select(tr, insertPos + built.contentOffset);
          if (dispatch) dispatch(tr);
          return true;
        },

      removePage:
        (pageIndex?: number) =>
        ({ state, tr, dispatch }): boolean => {
          const pages = collectPages(state.doc);
          if (pages.length <= 1) return false; // `doc` requires `page+`.

          const target =
            pageIndex === undefined
              ? pageAtSelection(state.doc, state.selection.from)
              : pages[pageIndex - 1] ?? null;
          if (!target) return false;

          tr.delete(target.pos, target.pos + target.node.nodeSize);
          if (dispatch) dispatch(tr);
          return true;
        },

      movePage:
        (from: number, to: number) =>
        ({ state, tr, dispatch }): boolean => {
          const pages = collectPages(state.doc);
          if (from < 1 || from > pages.length) return false;
          if (to < 1 || to > pages.length) return false;
          if (from === to) return false;

          const order: PMNode[] = pages.map((page) => page.node);
          const moved = order.splice(from - 1, 1);
          order.splice(Math.min(Math.max(to - 1, 0), order.length), 0, ...moved);

          // One atomic replacement of the whole top-level content: deleting the pages
          // first and re-inserting them would pass through an empty document, which
          // `page+` forbids and ProseMirror rejects step by step.
          tr.replaceWith(0, state.doc.content.size, order);
          if (dispatch) dispatch(tr);
          return true;
        },

      /**
       * 刷新页数，并通过 `storage.page.total` 报告它。
       *
       * Tiptap 的命令契约是 `(props) => boolean`：`RawCommands` / `SingleCommands` 由它派生，而
       * `CommandManager` 会调用返回的函数，所以命令无法*返回*一个数字。因此页数发布在
       * `editor.storage.page.total` 上（每次结构变化都会保持它最新），命令则报告这个数字是否变化；
       * `countPages(editor.state.doc)` 导出给想要完全不经命令取值的调用方。
       *
       * Refresh the page count and report it through `storage.page.total`.
       *
       * Tiptap's command contract is `(props) => boolean`: `RawCommands`/`SingleCommands`
       * are derived from it, and `CommandManager` calls the returned function, so a
       * command cannot *return* a number. The count is therefore published on
       * `editor.storage.page.total` (which every structural change already keeps current)
       * and the command reports whether that number changed. `countPages(editor.state.doc)`
       * is exported for a caller that wants the value without a command at all.
       */
      getPageCount:
        () =>
        ({ state, dispatch, tr, editor }: CommandProps): boolean => {
          const total = collectPages(state.doc).length;
          const storage = editor.storage.page as PageStorage | undefined;
          if (storage) {
            const changed = storage.total !== total;
            storage.total = total;
            // No steps to dispatch: a metadata-only transaction wakes the `pageNumber`
            // node views so "共 Y 页" refreshes even when nothing else changed.
            if (changed && dispatch) {
              tr.setMeta("addToHistory", false);
              dispatch(tr);
            }
            return changed;
          }
          return total > 0;
        },

      renumberPages:
        () =>
        ({ state, tr, dispatch }): boolean => {
          let changed = false;
          for (const page of collectPages(state.doc)) {
            if (page.node.attrs.index === page.ordinal) continue;
            tr.setNodeAttribute(page.pos, "index", page.ordinal);
            changed = true;
          }
          if (changed) {
            tr.setMeta("addToHistory", false);
            if (dispatch) dispatch(tr);
          }
          return changed;
        },

      recomputeTotal:
        () =>
        ({ state, tr, dispatch, editor }): boolean => {
          const total = collectPages(state.doc).length;
          const storage = editor.storage.page;
          const storageChanged = Boolean(storage) && storage.total !== total;
          if (storage) storage.total = total;

          let renumbered = false;
          for (const page of collectPages(state.doc)) {
            if (page.node.attrs.index === page.ordinal) continue;
            tr.setNodeAttribute(page.pos, "index", page.ordinal);
            renumbered = true;
          }

          if (renumbered) {
            // Derived data: never part of the undo stack.
            tr.setMeta("addToHistory", false);
            if (dispatch) dispatch(tr);
          } else if (storageChanged && dispatch) {
            // No steps, but the total changed — dispatch a metadata-only transaction so a
            // `pageNumber` node view recomputes its label ("共 Y 页").
            tr.setMeta("addToHistory", false);
            dispatch(tr);
          }

          return storageChanged || renumbered;
        }
    };
  }
});

/**
 * 页面的内容表达式可以写上的页眉 / 页脚节点类型。
 *
 * 两个来源，因为两者都能独立让一个节点类型存在：页面自己的选项（常规路径——
 * `Page.configure({ header: false })`）和使用方的扩展数组（有使用方把 `PageHeader` 从页面里拿掉
 * 又自己注册）。两个都检查，才能在构建 schema 时让表达式不可能出错。
 *
 * Which furniture node types the page's content expression may name.
 *
 * Two sources, because both can independently make a node type exist: the page's own
 * options (the normal path — `Page.configure({ header: false })`) and the consumer's
 * extension array (a consumer that dropped `PageHeader` from the page and registered it
 * itself). Checking both is what makes the expression impossible to get wrong at schema
 * build time.
 */
function readFurnitureFlags(options: PageOptions, editor: Editor | undefined): PageFurnitureFlags {
  const registered = registeredNodeNames(editor);
  return {
    header: options.header !== false || registered.has(PAGE_HEADER_NODE),
    content: true,
    footer: options.footer !== false || registered.has(PAGE_FOOTER_NODE)
  };
}

/**
 * 使用方扩展数组里出现的节点类型名。
 *
 * The node type names present in the consumer's extension array.
 */
function registeredNodeNames(editor: Editor | undefined): Set<string> {
  const names = new Set<string>();
  const extensions = editor?.options.extensions;
  if (!Array.isArray(extensions)) return names;
  for (const extension of extensions) {
    if (extension && typeof extension.name === "string") names.add(extension.name);
  }
  return names;
}

/**
 * `pagination: false` 保留正文但停掉自动分页过程。
 *
 * `pagination: false` keeps the body but stops the automatic pass.
 */
function readPaginationOptions(options: PageOptions): PageContentOptions {
  const pagination = options.pagination;
  if (pagination === false) return { autoPagination: false };
  if (!pagination) return {}; // Extension defaults (on, 1px) apply.
  return {
    autoPagination: pagination.autoPagination ?? true,
    tolerance: pagination.tolerance
  };
}

/**
 * 命令作用的页面：全部，或给定的那一个 1 起页码。
 *
 * The pages a command targets: all of them, or the one with the given 1-based number.
 */
function selectPages(doc: PMNode, pageIndex: number | undefined): PageRef[] {
  const pages = collectPages(doc);
  if (pageIndex === undefined) return pages;
  return pages.filter((page) => page.ordinal === pageIndex);
}

/**
 * 包含某个位置的页面；文档根本没有页面时没有。
 *
 * The page containing a position, if the document has pages at all.
 */
function pageAtSelection(doc: PMNode, pos: number): PageRef | null {
  for (const page of collectPages(doc)) {
    if (pos >= page.pos && pos <= page.pos + page.node.nodeSize) return page;
  }
  return null;
}

/**
 * 把页边距补丁合并进页面当前的页边距。
 *
 * 字符串或完整对象是替换；部分对象只更新它点名的边，所以设置面板可以只设「上：10mm」而不必把另外
 * 三边再发一遍。
 *
 * Merge a margin patch into a page's current margins.
 *
 * A string or a full object replaces; a partial object updates only the sides it names,
 * so the settings panel can set "top: 10mm" without re-sending the other three.
 */
function mergeMargins(current: unknown, patch: Margins | Partial<ResolvedMargins>): ResolvedMargins {
  if (typeof patch === "string") return resolveMargins(patch);
  const base = resolveMargins(isMarginsObject(current) ? current : undefined);
  return {
    top: patch.top ?? base.top,
    right: patch.right ?? base.right,
    bottom: patch.bottom ?? base.bottom,
    left: patch.left ?? base.left
  };
}

function isMarginsObject(value: unknown): value is ResolvedMargins {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.top === "string" &&
    typeof candidate.right === "string" &&
    typeof candidate.bottom === "string" &&
    typeof candidate.left === "string"
  );
}

function marginsEqual(left: unknown, right: ResolvedMargins): boolean {
  if (!isMarginsObject(left)) return false;
  return (
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  );
}

/**
 * 命名格式按名字比较；自定义格式按它的毫米尺寸比较。
 *
 * Named formats compare by name; a custom format compares by its millimetre size.
 */
function paperFormatsEqual(left: unknown, right: PaperFormat): boolean {
  if (typeof left === "string") return left === right;
  // `right` is now the object member of the union: a string on either side means the two
  // can only be equal when both are that same string.
  if (typeof right === "string") return false;
  if (!left || typeof left !== "object") return false;

  const candidate = left as { name?: unknown; width?: unknown; height?: unknown };
  return (
    candidate.name === right.name &&
    candidate.width === right.width &&
    candidate.height === right.height
  );
}

function readIndexAttribute(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * 当 `pos` 是文本位置时把光标放上去，否则不抛错。
 *
 * Put the caret at `pos` when that is a text position, without throwing otherwise.
 */
function select(tr: { doc: PMNode; setSelection: (selection: Selection) => void }, pos: number): void {
  const clamped = Math.min(Math.max(pos, 0), tr.doc.content.size);
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(clamped)));
  } catch {
    // A position with no text node nearby (an empty page, a page whose body holds only an
    // atom) simply does not get a caret. Selection is a convenience, not the operation.
  }
}

/**
 * 拆分光标所在的块，这样分页符移动的是尾部而不是整个块。
 *
 * Split the block under the caret so a page break moves the tail rather than the block.
 *
 * @returns 要放到新页顶部的片段，以及删除开始的位置；片段为空或不存在表示「新页从空开始」（光标
 *   已经在页尾）。 /
 *   The fragment to place at the top of the new page, and the position the deletion
 *   starts at. An empty/absent fragment means "the new page starts empty" (the caret was
 *   already at the end of the page).
 */
function splitAtCaret(
  doc: PMNode,
  caret: number,
  bodyEnd: number
): { from: number; moved: Fragment | undefined } {
  const $caret = doc.resolve(caret);

  for (let depth = $caret.depth; depth > 0; depth -= 1) {
    const block = $caret.node(depth);
    if (!block.isTextblock) continue;

    const blockEnd = $caret.after(depth);
    const blockContentEnd = blockEnd - 1;
    // The caret is at the very end of the block: it belongs with the *next* page, so the
    // block is only moved if something follows it.
    if (caret >= blockContentEnd) break;

    const tail = doc.slice(caret, blockContentEnd).content;
    const rebuilt = block.type.create(block.attrs, tail, block.marks);
    const rest = doc.slice(blockEnd, bodyEnd).content;
    return { from: caret, moved: Fragment.from(rebuilt).append(rest) };
  }

  const rest = doc.slice(caret, bodyEnd).content;
  return { from: caret, moved: rest.size > 0 ? rest : undefined };
}
