/**
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
