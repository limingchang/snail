import { Node, mergeAttributes } from "@tiptap/core";
import { PageContentOptions } from "../typing/pageContent";
import { PageContentView } from "./pageContentView";

import { getPageContentNodePos } from "../utils/getPageContentNodePos";
import {
  childrenHeightCalculator,
  availableHeightCalculator,
} from "../utils/calculator";

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
    // console.log("doc->from:", editor.$doc.from, "to:", editor.$doc.to);
    const { selection } = transaction;
    // const { from, to } = selection;
    // console.log("selection->from:", from, "to:", to);
    const pageContent = getPageContentNodePos(editor, selection);
    if (pageContent === null) return;
    // console.log("pageContent:", pageContent);

    // console.log(pageContent.element.clientHeight);
    console.log('editor.lastchild:',editor.$doc.lastChild)
    const pageEle = pageContent.element;
    const pageHeight = pageEle.clientHeight;
    const availableHeight = availableHeightCalculator(pageEle);
    // console.log("可用高度：", availableHeight);
    // 计算子元素内容高度
    const contentHeight = childrenHeightCalculator(pageEle);
    if (contentHeight >= availableHeight) {
      console.log("超高了！","可用高度：",availableHeight,"当前高度:",contentHeight);
      console.log(pageContent)
      const lastChild = pageContent.lastChild
      console.log('最后子元素：',lastChild)
      const style = window.getComputedStyle(lastChild!.element)
      // console.log('style:',style)
      console.log("P高度：",lastChild!.element.clientHeight)
      console.log("字体：",style.fontSize)
      console.log("行高：",style.lineHeight)
      if(pageContent == editor.$doc.lastChild){
        console.log('插入页面')
      }
      editor.chain().addNewPage().run()
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
