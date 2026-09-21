/**
 * `pageContent` 的节点视图。
 *
 * 与本模块其他节点视图一样由两个元素组成：`dom` 是承载内边距的正文盒子，`contentDOM` 是
 * ProseMirror 渲染各块的地方。测量器累加 *contentDOM* 的子元素，从 `dom` 读取可用高度。
 *
 * 这里刻意不保留任何逐节点状态：正文的内边距由 **page** 节点视图发布的 CSS 自定义属性
 * （`--snail-page-margin-*`）驱动，因为 ProseMirror 只在节点视图**自己的**节点变化时才调用
 * 它的 `update`：`setPageMargins` 修改 page 时，`pageContent` 节点对象并未被触碰，所以自己
 * 去读页边距的节点视图会永远停留在旧的内边距上。继承来的自定义属性无需任何 JavaScript 就能
 * 重新给正文排版。
 *
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

/** `pageContent` 节点的节点视图。 / The `pageContent` node's node view. */
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
