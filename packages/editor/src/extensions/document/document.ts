/**
 * The document (top) node.
 *
 * A `page`-based document is a **choice**, not a fact about the schema: the same editor is
 * used in single-page mode, where the top node is an ordinary `block+` document. The
 * legacy assembly returned *no* document extension at all in that mode — it only
 * `unshift`ed the multi-page one when `mutilPage` was true — so `multiPage: false`
 * produced a schema with no top node and ProseMirror threw
 * "Schema is missing its top node type (`doc`)" (defect 37).
 *
 * {@link createDocument} therefore always returns a valid top node, and says which one it
 * chose in its type.
 */

import { Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Document as StandardDocument } from "@tiptap/extension-document";

/** How the editor is assembled. */
export interface DocumentOptions {
  /**
   * `true` (default) makes the top node hold `page+`, i.e. a Word-like paginated document.
   * `false` uses Tiptap's standard `block+` document for a single, unpaginated page.
   */
  multiPage?: boolean;
}

/**
 * The paginated top node.
 *
 * `page+` requires at least one page, so a caller that creates an empty editor must seed
 * it with {@link createInitialPageContent} (or its own page JSON) — omitting the document
 * node entirely, as the legacy did, is never an option.
 */
export const PageDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "page+"
});

/**
 * Pick a top node.
 *
 * Both branches are named `doc`, so exactly one of them may be registered — which is why
 * this is a factory rather than two extensions the caller might combine by accident.
 */
export function createDocument(options: DocumentOptions = {}): Node {
  const multiPage = options.multiPage ?? true;
  return multiPage ? PageDocument : (StandardDocument as Node);
}

/**
 * A minimal valid body for {@link PageDocument}.
 *
 * `content: "page+"` rejects an empty document, and building the first page by hand is
 * easy to get wrong (the legacy `createPage` needed a header to exist before it could
 * build anything, defect 9). This returns the JSON a consumer can pass straight to the
 * editor's `content` option. Furniture is intentionally absent: headers and footers are
 * added through `addHeader`/`addFooter`/`addLogo`, and `Page.configure({ header: false })`
 * must not have to be reconciled with seeded markup.
 */
export function createInitialPageContent(pageCount = 1): JSONContent {
  const count = Number.isFinite(pageCount) && pageCount >= 1 ? Math.floor(pageCount) : 1;

  return {
    type: "doc",
    content: Array.from({ length: count }, () => ({
      type: "page",
      content: [
        {
          type: "pageContent",
          content: [{ type: "paragraph" }]
        }
      ]
    }))
  };
}
