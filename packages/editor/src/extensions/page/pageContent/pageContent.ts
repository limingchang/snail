import { Node, mergeAttributes } from "@tiptap/core";
import { PageContentOptions } from "../typing/pageContent";
import { PageContentView } from "./pageContentView";
import { createAutoPageBreakManager, AutoPageBreakManager } from "../utils/autoPageBreakManager";

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
  addStorage() {
    return {
      autoPageBreakManager: null as AutoPageBreakManager | null,
    };
  },

  onCreate() {
    // 初始化自动换页管理器
    this.storage.autoPageBreakManager = createAutoPageBreakManager(this.editor, {
      enabled: true,
      breakThreshold: 0.95,
      preserveWords: true,
      preserveParagraphs: false,
      debounceDelay: 100,
      maxRetries: 3
    });
  },

  onUpdate({ editor, transaction, appendedTransactions }) {
    // 触发自动换页检查
    if (this.storage.autoPageBreakManager) {
      this.storage.autoPageBreakManager.handleUpdate(transaction);
    }
  },

  onDestroy() {
    // 清理自动换页管理器资源
    if (this.storage.autoPageBreakManager) {
      this.storage.autoPageBreakManager.dispose();
      this.storage.autoPageBreakManager = null;
    }
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
