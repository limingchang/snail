import { Node, mergeAttributes } from "@tiptap/core";
import { PageContentOptions } from "../typing/pageContent";
import { PageContentView } from "./pageContentView";

export const PageContent = Node.create<PageContentOptions>({
  name: "pageContent",
  group: "page",
  content: "block*",
  isolating: true,
  addOptions() {
    return {
      // paperFormat: "A4",
      HTMLAttributes: {},
    };
  },
  addAttributes() {
    return {
      // margins:{
      //   default: defaultMargins,
      // }
      _updateTimestamp: {
        default: Date.now(),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "page-content",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "page-content",
      mergeAttributes(HTMLAttributes, {
        class: "page-content",
      }),
    ];
  },
  onUpdate({ editor, transaction, appendedTransactions }) {
    const state = editor.state;
    console.log("doc->from:",editor.$doc.from,"to:",editor.$doc.to)
    const { selection } = transaction;
    const { from, to } = selection;
    console.log("selection->from:",from,"to:",to)
    const pageContents = editor.$nodes("pageContent");
    if (pageContents == null) return;
    pageContents.forEach((pageContent) => {
      console.log("pageContent->from:", pageContent.from, "to:", pageContent.to);
      if (pageContent.from >= from && pageContent.to <= to) {
        console.log(pageContent);
      }
    });
    // state.doc.descendants((node, pos) => {
    //   if (
    //     node.type.name === "pageContent" &&
    //     pos <= selection.from &&
    //     pos + node.nodeSize > selection.from
    //   ) {
    //     console.log("pageContent:", node);
    //   }
    // });
  },
  addNodeView: PageContentView,

  addCommands() {
    return {
      __flushContentPadding:
        () =>
        ({ editor, tr, dispatch }) => {
          const pageContents = editor.$nodes("pageContent");
          pageContents?.forEach((node) => {
            tr.setNodeAttribute(node.pos - 1, "_updateTimestamp", Date.now());
            if (dispatch) {
              dispatch(tr);
            }
          });
          return true;
        },

      enableAutoPageBreak:
        () =>
        ({ editor }) => {
          const manager = this.storage.autoPageBreakManager;
          if (manager) {
            manager.enable();
            return true;
          }
          return false;
        },

      disableAutoPageBreak:
        () =>
        ({ editor }) => {
          const manager = this.storage.autoPageBreakManager;
          if (manager) {
            manager.disable();
            return true;
          }
          return false;
        },

      triggerAutoPageBreak:
        () =>
        ({ editor }) => {
          const manager = this.storage.autoPageBreakManager;
          if (manager) {
            manager.triggerManualCheck();
            return true;
          }
          return false;
        },

      configureAutoPageBreak:
        (options) =>
        ({ editor }) => {
          const manager = this.storage.autoPageBreakManager;
          if (manager) {
            manager.updateOptions(options);
            return true;
          }
          return false;
        },

      getAutoPageBreakStatus:
        () =>
        ({ editor }) => {
          const manager = this.storage.autoPageBreakManager;
          return manager ? manager.getStatus() : null;
        },
    };
  },
});
