/**
 * `PageContent` —— 页面正文，也是分页引擎所在之处。
 *
 * 节点本身很简单（`block*`、隔离、无属性）。它有两处关键部分：节点视图
 * （`./pageContentView.ts`）和执行调度轮次的插件（`./paginator.ts`）。
 *
 * ## 为什么没有属性
 *
 * 旧版的 `pageContent` 带一个 `_updateTimestamp`，默认值为 `Date.now()`，唯一作用是强制重新
 * 渲染。它让同一份模板每次加载都序列化出不同的结果（缺陷 43），也是那些基于过期位置的刷新
 * 命令背后的机制（缺陷 11）。正文现在没有任何需要盖时间戳的东西：布局变化由测量驱动，页边距
 * 位于 `page` 节点上。
 *
 * `PageContent` — the page body, and the home of the pagination engine.
 *
 * The node itself is trivial (`block*`, isolating, no attributes). Its two interesting
 * parts are the node view (`./pageContentView.ts`) and the plugin that runs the scheduled
 * pass (`./paginator.ts`).
 *
 * ## Why there are no attributes
 *
 * The legacy `pageContent` carried `_updateTimestamp`, a `Date.now()` default whose only
 * purpose was to force a re-render. It made an identical template serialise differently on
 * every load (defect 43) and it was the mechanism behind the stale-position flush commands
 * (defect 11). The body now has nothing to stamp: layout changes are driven by measurement,
 * and margins live on the `page` node.
 */

import { Node, mergeAttributes } from "@tiptap/core";

import { DATA_TYPE } from "../constant/dom";
import type { PageContentOptions, PageContentStorage } from "../typing/pageContent";
import { DEFAULT_PAGINATION_TOLERANCE } from "../utils/pagination";
import { renderPageContentNodeView } from "./pageContentView";
import { createPaginationPlugin } from "./paginator";

/** `pageContent` 节点扩展。 / The `pageContent` node extension. */
export const PageContent = Node.create<PageContentOptions, PageContentStorage>({
  name: "pageContent",
  group: "page",
  content: "block*",
  // A click inside the body must not extend a selection out into the header or footer.
  isolating: true,

  addOptions() {
    return {
      autoPagination: true,
      tolerance: DEFAULT_PAGINATION_TOLERANCE,
      HTMLAttributes: {}
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${DATA_TYPE.pageContent}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes, {
        "data-type": DATA_TYPE.pageContent
      }),
      0
    ];
  },

  addNodeView() {
    return renderPageContentNodeView();
  },

  addStorage(): PageContentStorage {
    return {
      autoPagination: this.options.autoPagination ?? true,
      tolerance: this.options.tolerance ?? DEFAULT_PAGINATION_TOLERANCE,
      controller: null,
      lastPlan: null
    };
  },

  addProseMirrorPlugins() {
    return [createPaginationPlugin({ editor: this.editor, tolerance: this.storage.tolerance })];
  },

  addCommands() {
    return {
      paginate:
        () =>
        ({ editor }): boolean => {
          const controller = editor.storage.pageContent.controller;
          // No controller yet means the editor has no view (unmounted, or created without
          // an element). The command reports "nothing scheduled" rather than throwing.
          if (!controller) return false;
          controller.request();
          return true;
        },

      setAutoPagination:
        (enabled: boolean) =>
        ({ editor }): boolean => {
          const storage = editor.storage.pageContent;
          if (storage.autoPagination === enabled) return false;
          storage.autoPagination = enabled;
          // Switching it back on should not wait for the next keystroke.
          if (enabled) storage.controller?.request();
          return true;
        }
    };
  }
});
