/**
 * Building a `page` node that the schema actually accepts.
 *
 * The legacy `createPage` gathered a header and a footer from the *first* page it could
 * find (`editor.$nodes("pageHeader")[0].attributes`) and always built both, so a document
 * without a header threw before it could create a page at all (defect 9), and a document
 * where only some pages have furniture was unrepresentable.
 *
 * This factory is existence-tolerant in both directions:
 *
 * - it **copies the template page's furniture**, so `addNewPage` on a document with a
 *   footer produces a page with the same footer — including a `pageNumber` node, which
 *   then renders its own new number with no text rewriting at all; and
 * - it adds **no furniture of its own** when there is no template, so a page created in a
 *   bare document is just a body. `addHeader`/`addFooter`/`addLogo` add chrome when the
 *   user asks for it, and `removeHeader` can take it away again.
 */

import type { Fragment, Node as PMNode, Schema } from "@tiptap/pm/model";

import {
  DEFAULT_ORIENTATION,
  DEFAULT_PAGE_AUTO,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAPER_FORMAT
} from "../constant/defaults";
import type { Margins, Orientation, PaperFormat } from "../../../typings/paper";
import type { PageAttributes } from "../typing/page";
import { PAGE_CONTENT_NODE, PAGE_NODE } from "./nodes";
import type { PageRef } from "./nodes";

/** What {@link createPageNode} needs to know. */
export interface CreatePageInput {
  /** The editor's schema. */
  schema: Schema;

  /**
   * The page to mirror: its paper setup, and its furniture nodes (copied include their
   * content, so a footer's page number repeats on the new page).
   */
  template?: PageRef | null;

  /** Content for the new page's body. Omitted or empty for a blank page. */
  content?: Fragment;

  /**
   * Attribute overrides. `index` is **not** copied from the template — the renumbering
   * pass owns it — and `auto` defaults to `false` so a page the user created is never
   * removed implicitly.
   */
  attributes?: Partial<PageAttributes>;
}

/** A built page node plus the position of its body, relative to the page's own position. */
export interface BuiltPage {
  node: PMNode;

  /**
   * `pagePos + contentOffset` is the first valid position **inside** the page's body.
   *
   * Returned as an offset rather than an absolute position because the caller decides
   * where the page lands; this is the same `pos + 1` rule of defect 6, computed once.
   */
  contentOffset: number;
}

/**
 * Build a page node.
 *
 * @returns `null` when the schema has no `page`/`pageContent` node type — callers return
 *   `false` rather than throwing (defect 8: `$nodes()` returns `[]`, never `null`, so the
 *   legacy `=== null` guards never fired and `[0].attributes` threw instead).
 */
export function createPageNode(input: CreatePageInput): BuiltPage | null {
  const pageType = input.schema.nodes[PAGE_NODE];
  const contentNodeType = input.schema.nodes[PAGE_CONTENT_NODE];
  if (!pageType || !contentNodeType) return null;

  const templateAttributes: Record<string, unknown> = input.template ? input.template.node.attrs : {};
  const overrides = input.attributes ?? {};

  const attributes: PageAttributes = {
    index: overrides.index ?? DEFAULT_PAGE_INDEX,
    paperFormat: (overrides.paperFormat ??
      templateAttributes.paperFormat ??
      DEFAULT_PAPER_FORMAT) as PaperFormat,
    orientation: (overrides.orientation ??
      templateAttributes.orientation ??
      DEFAULT_ORIENTATION) as Orientation,
    margins: (overrides.margins ?? templateAttributes.margins ?? DEFAULT_PAGE_MARGINS) as Margins,
    auto: overrides.auto ?? DEFAULT_PAGE_AUTO
  };

  const children: PMNode[] = [];
  /** Node size accumulated before the next child, relative to the page's content start. */
  let cursor = 0;
  let contentOffset = -1;

  const append = (node: PMNode): void => {
    if (node.type.name === PAGE_CONTENT_NODE && contentOffset < 0) {
      // Absolute body position = pagePos + 1 (page content) + cursor (earlier children)
      // + 1 (pageContent's own opening token).
      contentOffset = cursor + 2;
    }
    children.push(node);
    cursor += node.nodeSize;
  };

  for (const child of input.template?.children ?? []) {
    if (child.node.type.name === PAGE_CONTENT_NODE) {
      append(contentNodeType.create(null, input.content ?? undefined));
      continue;
    }
    // Header, footer and logo are repeated verbatim, content included. `copy` keeps the
    // node's type, attributes and marks, so a styled footer stays styled.
    append(child.node.copy(child.node.content));
  }

  if (contentOffset < 0) {
    append(contentNodeType.create(null, input.content ?? undefined));
  }

  return { node: pageType.create(attributes, children), contentOffset };
}
