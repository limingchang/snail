/**
 * 页面模型之上的纯辅助函数。
 *
 * 这里的一切都接收 ProseMirror 节点并返回位置——不涉及 DOM，也不涉及编辑器——因此
 * page/header/footer/logo/page-number 各组命令共享同一份「这一页在哪」的定义，而缺陷 6
 * （`pos - 1`、`nextPage.pos + 1`）只需写一次、写对一次。
 *
 * ## 唯一的一条规则
 *
 * `$nodes(name).pos` 是节点**之前**的位置，`pos + 1` 是它的内容起点。下面每个辅助函数
 * 都一致地返回「节点之前的位置」，而 {@link contentStart} 是唯一写出这个 `+ 1` 的地方。
 *
 * Pure helpers over the page model.
 *
 * Everything here takes ProseMirror nodes and returns positions — no DOM, no editor —
 * so the page/header/footer/logo/page-number commands all share one definition of
 * "where is this page", and defect 6 (`pos - 1`, `nextPage.pos + 1`) can only be written
 * once, correctly.
 *
 * ## The one rule
 *
 * `$nodes(name).pos` is the position **before** a node and `pos + 1` is its content
 * start. Every helper below returns "position before the node" for consistency, and
 * {@link contentStart} is the only place the `+ 1` is spelled out.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * 本模块知道的节点类型名。用常量保存，这样拼错就是编译错误。
 *
 * Node type names this module knows. Kept as constants so a typo is a compile error.
 */
export const PAGE_NODE = "page";
/** `pageContent` 的节点类型名。 / The `pageContent` node type name. */
export const PAGE_CONTENT_NODE = "pageContent";
/** `pageHeader` 的节点类型名。 / The `pageHeader` node type name. */
export const PAGE_HEADER_NODE = "pageHeader";
/** `pageFooter` 的节点类型名。 / The `pageFooter` node type name. */
export const PAGE_FOOTER_NODE = "pageFooter";
/** `pageLogo` 的节点类型名。 / The `pageLogo` node type name. */
export const PAGE_LOGO_NODE = "pageLogo";
/** `pageNumber` 的节点类型名。 / The `pageNumber` node type name. */
export const PAGE_NUMBER_NODE = "pageNumber";
/** `pageRegion` 的节点类型名。 / The `pageRegion` node type name. */
export const PAGE_REGION_NODE = "pageRegion";

/**
 * `page` 节点的子节点：它的节点与它之前的绝对位置。
 *
 * A child of a `page` node: its node and the absolute position before it.
 */
export interface PageChildRef {
  /** 子节点**之前**的绝对位置。 / Absolute position **before** the child. */
  pos: number;
  /** 子节点。 / The child node. */
  node: PMNode;
}

/**
 * 一个 `page` 节点、它的位置、它的编号与它的子节点。
 *
 * A `page` node, its position, its number and its children.
 */
export interface PageRef {
  /** 页面节点**之前**的绝对位置。 / Absolute position **before** the page node. */
  pos: number;
  /** 页面节点。 / The page node. */
  node: PMNode;
  /**
   * 页面绘制时使用的 1 起编号：`index` 属性为正整数时用它，否则用 {@link ordinal}，
   * 这样即使第一次重编号流程还没跑，页面也能正确编号。
   *
   * The 1-based number the page is drawn with: the `index` attribute when it is a
   * positive integer, otherwise {@link ordinal}, so a page numbers itself correctly even
   * before the first renumbering pass has run.
   */
  index: number;
  /**
   * 页面在文档中的 1 起序号，无论 `index` 说什么。
   *
   * The page's 1-based ordinal position in the document, whatever `index` says.
   */
  ordinal: number;
  /** 子节点，带绝对位置。 / The children, with absolute positions. */
  children: PageChildRef[];
}

/**
 * 页面 schema 中实际包含哪些版面配件节点类型。
 *
 * `logo` **不**在这里：Logo 不再是页面的子节点。它位于页眉或页脚的一个区域内部，
 * 因此 schema 有没有 `pageLogo` 节点与页面自身的内容表达式无关。
 *
 * Which furniture node types the page schema actually contains.
 *
 * `logo` is **not** here: the logo is no longer a child of a page. It lives inside a region of
 * the header or footer, so whether the schema has a `pageLogo` node has no bearing on the page's
 * own content expression.
 */
export interface PageFurnitureFlags {
  /** schema 是否包含 `pageHeader`。 / Whether the schema has `pageHeader`. */
  header: boolean;
  /** schema 是否包含 `pageContent`。 / Whether the schema has `pageContent`. */
  content: boolean;
  /** schema 是否包含 `pageFooter`。 / Whether the schema has `pageFooter`. */
  footer: boolean;
}

/**
 * 节点内容起点的绝对位置。缺陷 6 的那个 `+ 1`，只此一处。
 *
 * The absolute position of a node's content start. The `+ 1` of defect 6, in one place.
 */
export function contentStart(pos: number): number {
  return pos + 1;
}

/**
 * 用实际存在的版面配件拼出页面的内容表达式。
 *
 * 这是「Unknown node type in content expression」的修复：调用方去掉了 `PageHeader` 的页面
 * 得到的是 `pageContent pageFooter?`，而不是硬编码的 `pageHeader? pageContent pageFooter?`
 * 去点名一个 schema 里并不存在的节点。
 *
 * ## 为什么是序列而不是并集（缺陷 43）
 *
 * 本重建的第一版用的是 `(pageHeader | pageContent | pageFooter | pageLogo)*`，即
 * 「这些中的任意个，任意顺序，任意次数」。并集无法表达*顺序*，于是 `addHeader` 和
 * `addFooter`——两者都插在 `page.pos + 1`——谁先跑就得到谁的顺序。在一个全新的页面上
 * 先启用页眉再启用页脚，会把页脚放到页眉**之前**，那不是文档；页眉自己的文字最后也被
 * 渲染到了正文下方。
 *
 * 序列在 schema 层面修掉了它：`pageHeader? pageContent pageFooter?` 恰好就是「一个页眉、
 * 然后正文、然后一个页脚」，因此页面永远不可能被存成错误的顺序——插错位置会被
 * ProseMirror 拒绝，而不是被悄悄接受。
 *
 * Logo 刻意**不再**是页面的子节点：它位于页眉或页脚的一个区域内部（见 `utils/regions.ts`），
 * 因为「Logo 占据页脚的左边三分之一」说的是它在版面配件中的位置，而不是页面自己的
 * 子节点。
 *
 * Build the page's content expression out of the furniture that exists.
 *
 * This is the fix for "Unknown node type in content expression": a page whose consumer dropped
 * `PageHeader` gets `pageContent pageFooter?`, not a hard-coded
 * `pageHeader? pageContent pageFooter?` that names a node the schema does not have.
 *
 * ## Why it is a sequence and not a union (defect 43)
 *
 * The rebuild's first version used `(pageHeader | pageContent | pageFooter | pageLogo)*`, i.e.
 * "any of these, in any order, any number of times". A union cannot express *order*, so
 * `addHeader` and `addFooter` — both of which inserted at `page.pos + 1` — produced whatever
 * order they happened to run in. Enabling a header and then a footer on a fresh page put the
 * footer **before** the header, which is not a document, and the header's own text ended up
 * rendered below the body.
 *
 * A sequence fixes it in the schema: `pageHeader? pageContent pageFooter?` is exactly
 * "a header, then the body, then a footer", so a page can never be stored in the wrong order —
 * an insert in the wrong place is rejected by ProseMirror instead of quietly accepted.
 *
 * The logo is deliberately **not** a page child any more: it lives inside a region of the header
 * or footer (see `utils/regions.ts`), because "the logo occupies the left third of the footer"
 * is a statement about where it sits in the furniture, not about the page's own children.
 */
export function resolvePageContentExpression(flags: PageFurnitureFlags): string {
  const parts: string[] = [];
  if (flags.header) parts.push(`${PAGE_HEADER_NODE}?`);
  // The body is the one part a page cannot do without, so it is never optional here. The
  // `content` flag stays on the interface for a consumer that inspects the flags, but the
  // expression always names `pageContent`: a page without a body is not a page.
  parts.push(PAGE_CONTENT_NODE);
  if (flags.footer) parts.push(`${PAGE_FOOTER_NODE}?`);

  return parts.join(" ");
}

/** 每个顶层 `page` 节点，按文档顺序。 / Every top-level `page` node, in document order. */
export function collectPages(doc: PMNode): PageRef[] {
  const pages: PageRef[] = [];

  doc.forEach((node, offset) => {
    if (node.type.name !== PAGE_NODE) return;
    pages.push(buildPageRef(node, offset, pages.length + 1));
  });

  return pages;
}

/** 包装一个页面节点，而不遍历整个文档。 / Wrap one page node without walking the document. */
export function buildPageRef(node: PMNode, pos: number, ordinal: number): PageRef {
  const children: PageChildRef[] = [];

  // `node.forEach` reports offsets relative to the *content* start, so the absolute
  // position of a child is `pagePos + 1 + offset` — the page's own tokens are one
  // position wide.
  node.forEach((child, offset) => {
    children.push({ node: child, pos: contentStart(pos) + offset });
  });

  return { pos, node, ordinal, index: readPageIndex(node, ordinal), children };
}

/**
 * 页面的 `index` 属性为正整数时返回它，否则返回 `fallback`。
 *
 * The page's `index` attribute when it is a positive integer, otherwise `fallback`.
 */
export function readPageIndex(node: PMNode, fallback: number): number {
  const value: unknown = node.attrs.index;
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) return Math.floor(value);
  // A string attribute can arrive from parsed HTML (`data-index="3"`).
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return fallback;
}

/**
 * 包含某个绝对位置的页面；文档还没有页面时返回 `null`。
 *
 * The page containing an absolute position, or `null` when the document has none yet.
 */
export function pageAt(doc: PMNode, pos: number): PageRef | null {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  const $pos = doc.resolve(clamped);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === PAGE_NODE) {
      return buildPageRef(node, $pos.before(depth), $pos.index(0) + 1);
    }
  }

  return null;
}

/**
 * 页面中该类型的子节点；该页面没有时返回 `null`。
 *
 * The page's child of the given type, or `null` when that page does not have one.
 */
export function findChild(page: PageRef, typeName: string): PageChildRef | null {
  for (const child of page.children) {
    if (child.node.type.name === typeName) return child;
  }
  return null;
}

/**
 * 节点的第一个该类型的子节点，没有则为 `null`。
 *
 * 用带索引的循环而不是 `node.forEach`，因为 TypeScript 会把回调里收窄的 `null` 一直
 * 保留到外层作用域结束，从而让后面的 null 检查变成死代码。
 *
 * A node's first child of the given type, or `null`.
 *
 * An indexed loop rather than `node.forEach` because TypeScript keeps a narrowed `null`
 * inside a callback for the rest of the enclosing scope, which turns the subsequent
 * null check into dead code.
 */
export function findChildNode(node: PMNode, typeName: string): PMNode | null {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === typeName) return child;
  }
  return null;
}

/** 每个拥有该类型子节点的页面。 / Every page that has a child of the given type. */
export function findChildrenOfType(pages: PageRef[], typeName: string): PageChildRef[] {
  const found: PageChildRef[] = [];
  for (const page of pages) {
    const child = findChild(page, typeName);
    if (child) found.push(child);
  }
  return found;
}

/**
 * 某个页面的 pageContent。本扩展构建的每个页面都恰好有一个。
 *
 * The pageContent of a page. Every page the extension builds has exactly one.
 */
export function findPageContent(page: PageRef): PageChildRef | null {
  return findChild(page, PAGE_CONTENT_NODE);
}

/** 文档有多少个页面。 / How many pages the document has. */
export function countPages(doc: PMNode): number {
  let total = 0;
  doc.forEach((node) => {
    if (node.type.name === PAGE_NODE) total += 1;
  });
  return total;
}

/** 一个 `pageNumber` 节点显示什么值。 / Which value a `pageNumber` node shows. */
export interface PageNumberResolution {
  /** 1 起页码。 / 1-based page number. */
  page: number;
  /** 文档有多少个页面。 / How many pages the document has. */
  total: number;
}

/**
 * 为位于 `pos` 的 `pageNumber` 节点解析出 `{ page, total }`。
 *
 * 页码是*派生*出来的：取页面的 `index` 属性，该属性缺失或过期时取它的序号位置。
 * 从来不会往文档里写任何东西，因此增删页面都不会让「第 X 页」变错（缺陷 1 与 10）。
 *
 * Resolve `{ page, total }` for a `pageNumber` node sitting at `pos`.
 *
 * The number is *derived*: the page's `index` attribute, or its ordinal position when
 * that attribute is missing or stale. Nothing is ever written into the document, which
 * is why adding or removing a page cannot leave "第 X 页" wrong (defects 1 and 10).
 */
export function resolvePageNumber(doc: PMNode, pos: number, total: number): PageNumberResolution {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  const $pos = doc.resolve(clamped);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === PAGE_NODE) {
      return { page: readPageIndex(node, $pos.index(0) + 1), total };
    }
  }

  // The node is not inside a page (a bare document, or a node being dragged). The
  // top-level child index is still the best available answer.
  return { page: $pos.index(0) + 1, total };
}
