/**
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

/** Node type names this module knows. Kept as constants so a typo is a compile error. */
export const PAGE_NODE = "page";
export const PAGE_CONTENT_NODE = "pageContent";
export const PAGE_HEADER_NODE = "pageHeader";
export const PAGE_FOOTER_NODE = "pageFooter";
export const PAGE_LOGO_NODE = "pageLogo";
export const PAGE_NUMBER_NODE = "pageNumber";

/** A child of a `page` node: its node and the absolute position before it. */
export interface PageChildRef {
  pos: number;
  node: PMNode;
}

/** A `page` node, its position, its number and its children. */
export interface PageRef {
  /** Absolute position **before** the page node. */
  pos: number;
  node: PMNode;
  /**
   * The 1-based number the page is drawn with: the `index` attribute when it is a
   * positive integer, otherwise {@link ordinal}, so a page numbers itself correctly even
   * before the first renumbering pass has run.
   */
  index: number;
  /** The page's 1-based ordinal position in the document, whatever `index` says. */
  ordinal: number;
  children: PageChildRef[];
}

/** Which furniture node types the page schema actually contains. */
export interface PageFurnitureFlags {
  header: boolean;
  content: boolean;
  footer: boolean;
  logo: boolean;
}

/** The absolute position of a node's content start. The `+ 1` of defect 6, in one place. */
export function contentStart(pos: number): number {
  return pos + 1;
}

/**
 * Build a content expression out of the furniture that exists.
 *
 * This is the fix for "Unknown node type in content expression": a page whose consumer
 * dropped `PageHeader` gets `(pageContent | pageFooter)*`, not a hard-coded
 * `(pageHeader | pageContent | pageFooter)*`.
 */
export function resolvePageContentExpression(flags: PageFurnitureFlags): string {
  const parts: string[] = [];
  if (flags.header) parts.push(PAGE_HEADER_NODE);
  if (flags.content) parts.push(PAGE_CONTENT_NODE);
  if (flags.footer) parts.push(PAGE_FOOTER_NODE);
  if (flags.logo) parts.push(PAGE_LOGO_NODE);

  if (parts.length === 0) return "";
  if (parts.length === 1) return `${parts[0]}*`;
  return `(${parts.join(" | ")})*`;
}

/** Every top-level `page` node, in document order. */
export function collectPages(doc: PMNode): PageRef[] {
  const pages: PageRef[] = [];

  doc.forEach((node, offset) => {
    if (node.type.name !== PAGE_NODE) return;
    pages.push(buildPageRef(node, offset, pages.length + 1));
  });

  return pages;
}

/** Wrap one page node without walking the document. */
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

/** The page's `index` attribute when it is a positive integer, otherwise `fallback`. */
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

/** The page containing an absolute position, or `null` when the document has none yet. */
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

/** The page's child of the given type, or `null` when that page does not have one. */
export function findChild(page: PageRef, typeName: string): PageChildRef | null {
  for (const child of page.children) {
    if (child.node.type.name === typeName) return child;
  }
  return null;
}

/**
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

/** Every page that has a child of the given type. */
export function findChildrenOfType(pages: PageRef[], typeName: string): PageChildRef[] {
  const found: PageChildRef[] = [];
  for (const page of pages) {
    const child = findChild(page, typeName);
    if (child) found.push(child);
  }
  return found;
}

/** The pageContent of a page. Every page the extension builds has exactly one. */
export function findPageContent(page: PageRef): PageChildRef | null {
  return findChild(page, PAGE_CONTENT_NODE);
}

/** How many pages the document has. */
export function countPages(doc: PMNode): number {
  let total = 0;
  doc.forEach((node) => {
    if (node.type.name === PAGE_NODE) total += 1;
  });
  return total;
}

/** Which value a `pageNumber` node shows. */
export interface PageNumberResolution {
  /** 1-based page number. */
  page: number;
  /** How many pages the document has. */
  total: number;
}

/**
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
