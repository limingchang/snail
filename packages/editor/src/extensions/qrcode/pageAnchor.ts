/**
 * 二维码的页面锚定：它应当被放在哪一页，以及为此该把节点搬到哪里。
 *
 * ## 为什么「放在第几页」就是「节点住在哪一页」
 *
 * 二维码是绝对定位的元素（见 {@link qrCodeStyle}），它的 `left`/`top` 是相对**最近的已定位
 * 祖先**测量的——而对一个页面里的二维码来说，那个祖先就是它所在的页面本身。因此「这个码在第
 * 3 页上」唯一可行的实现，就是让这个节点*真的*住在第 3 页的 `pageContent` 里：没有别的机制
 * 能把一个元素画到另一个页面的盒子里，而把 DOM 元素搬出 ProseMirror 给它的位置又会破坏节点
 * 视图的所有权。
 *
 * ## 为什么是一次性的移动，而不是一个持续的对齐插件
 *
 * 分页器本身会在页面之间搬动内容。一个「每次事务后都把二维码搬回目标页」的插件会和它互相
 * 拉扯：分页器把它挪走、插件把它挪回来，两个 `appendTransaction` 互相触发，直到分页预算
 * 用完。所以搬动只发生在用户选择页码的那一次事务里（`setQRCodePage`），之后的每一次重排都
 * 由分页器说了算——与用户今天看到的行为一致。
 *
 * ## 纯函数
 *
 * 本模块只读 ProseMirror 文档并回答位置，因此「第 3 页的内容从哪里开始」可以脱离编辑器被
 * 验证。
 *
 * The QR code's page anchoring: which page it should be placed on, and where the node has to
 * move for that to be true.
 *
 * ## Why "which page" *is* "which page the node lives in"
 *
 * A QR code is an absolutely positioned element (see {@link qrCodeStyle}) whose `left`/`top` are
 * measured against the nearest positioned ancestor — and for a code inside a page, that ancestor
 * is the page itself. So the only way to render "this code is on page 3" is to have the node
 * genuinely live inside page 3's `pageContent`: nothing else can paint an element into another
 * page's box, and moving the DOM element out of the position ProseMirror gave it would break the
 * node view's ownership of it.
 *
 * ## Why a one-shot move instead of a continuous aligning plugin
 *
 * The paginator itself moves content between pages. A plugin that put the code back on its target
 * page after every transaction would fight it: the paginator moves the node out, the plugin moves
 * it back, each `appendTransaction` triggering the other until the pagination budget is spent. So
 * the move happens only in the transaction where the user picks a page (`setQRCodePage`), and
 * every reflow after that is the paginator's business — the behaviour users see today.
 *
 * ## Pure
 *
 * This module only reads a ProseMirror document and answers with positions, so "where does page
 * 3's content start" can be verified without an editor.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

import { collectPages, contentStart, findPageContent } from "../page";
import type { PageRef } from "../page";

import { resolvePageIndex } from "./geometry";
import type { QRPageAnchor } from "./typing";

/**
 * 包含 `pos` 的那一页的 1 起序号，文档里没有页面时为 `1`。
 *
 * 单页编辑器（没有 `page` 节点的文档）得到 `1`，这与 {@link resolvePageIndex} 对「只有一页」
 * 的处理一致。
 *
 * The 1-based ordinal of the page containing `pos`, or `1` when the document has no pages.
 *
 * A single-page editor — a document with no `page` nodes at all — answers `1`, which is how
 * {@link resolvePageIndex} treats "there is only one page" as well.
 */
export function pageIndexOf(doc: PMNode, pos: number): number {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  const $pos = doc.resolve(clamped);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "page") return $pos.index(0) + 1;
  }

  return 1;
}

/**
 * 第 `index` 页的 `pageContent` 末尾，即可以插入一个块级节点的位置。
 *
 * 页码会像 {@link resolvePageIndex} 那样被钳进范围：对一份两页的文档问「第 9 页」，意思就是
 * 最后一页。只有文档根本没有页面（单页编辑器）时才返回 `undefined` —— 那时没有可以搬进去的
 * 地方，调用方会退回到「只改属性、不搬动」。
 *
 * 追加到正文末尾而不是插在开头，是因为二维码是绝对定位的：它在流里的位置不影响它画在哪里，
 * 而末尾是唯一一个不会把用户正在读的那段正文劈开的位置。
 *
 * The end of page `index`'s `pageContent` — a position where a block-level node can be inserted.
 *
 * The page number is clamped into range the way {@link resolvePageIndex} clamps an anchor: asking
 * a two-page document for "page 9" means the last page. `undefined` only when the document has no
 * pages at all (a single-page editor) — then there is nowhere to move into, and the caller falls
 * back to "change the attribute, move nothing".
 *
 * Appending to the body rather than prepending is because the code is absolutely positioned: where
 * it sits in the flow does not affect where it is painted, and the end is the one place that never
 * splits the paragraph the user is reading.
 */
export function pageContentEnd(doc: PMNode, index: number): number | undefined {
  const pages: PageRef[] = collectPages(doc);
  if (pages.length === 0) return undefined;

  const page = pages[Math.min(pages.length, Math.max(1, Math.floor(index))) - 1];
  const content = findPageContent(page);
  if (!content) return undefined;

  return contentStart(content.pos) + content.node.content.size;
}

/**
 * 锚定 `anchor` 是否要求把当前位于 `pos` 的二维码搬到别的页上去；要的话给出目标位置。
 *
 * `null` 永远返回 `undefined`：那是「用户没有指定过」，此时二维码就留在原地。
 *
 * Whether `anchor` asks for the code currently at `pos` to move to another page, and if so where.
 *
 * `null` always answers `undefined`: that is "the user never chose", and the code stays where it
 * is.
 */
export function planPageMove(
  doc: PMNode,
  pos: number,
  anchor: QRPageAnchor
): { target: number; insertAt: number } | undefined {
  if (anchor === null) return undefined;

  const pages = collectPages(doc);
  const total = pages.length === 0 ? 1 : pages.length;
  const target = resolvePageIndex(anchor, total);
  if (target === pageIndexOf(doc, pos)) return undefined;

  const insertAt = pageContentEnd(doc, target);
  if (insertAt === undefined) return undefined;

  return { target, insertAt };
}
