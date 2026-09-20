/**
 * The `pageContent` node view.
 *
 * Two elements, like every other node view in this module: `dom` is the body box that
 * carries the padding, `contentDOM` is where ProseMirror renders the blocks. The measurer
 * sums the *contentDOM's* children and reads the available height off `dom`.
 *
 * There is deliberately no per-node state here. The body's padding is driven by the CSS
 * custom properties the **page** node view publishes (`--snail-page-margin-*`), because
 * ProseMirror only calls a node view's `update` when *its own* node changes: when
 * `setPageMargins` edits the page, the `pageContent` node object is untouched, so a node
 * view that read the margins itself would keep stale padding forever. Inherited custom
 * properties restyle the body with no JavaScript at all.
 */

import type { NodeViewRenderer } from "@tiptap/core";

import { DATA_TYPE, PAGE_CONTENT_CLASS, PAGE_CONTENT_INNER_CLASS } from "../constant/dom";

/** The `pageContent` node's node view. */
export function renderPageContentNodeView(): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement("div");
    dom.className = PAGE_CONTENT_CLASS;
    dom.setAttribute("data-type", DATA_TYPE.pageContent);

    const content = document.createElement("div");
    content.className = PAGE_CONTENT_INNER_CLASS;
    dom.appendChild(content);

    return {
      dom,
      contentDOM: content,
      update: (updated) => updated.type === node.type,
      destroy: () => {
        // Nothing scheduled, nothing subscribed to.
      },
      ignoreMutation: (mutation) => !content.contains(mutation.target)
    };
  };
}
