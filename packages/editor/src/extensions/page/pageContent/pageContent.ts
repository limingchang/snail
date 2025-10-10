import { Node, mergeAttributes } from "@tiptap/core";
import { PageContentOptions } from "../typing/pageContent";
import { PageContentView } from "./pageContentView";

import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { getPageContentNodePos } from "../utils/getPageContentNodePos";
import {
  childrenHeightCalculator,
  availableHeightCalculator,
} from "../utils/calculator";

// import {getPageContentNodePos} from "../utils/getPageContentNodePos"
import { checkNextPage } from "../utils/checkNextPage";

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
    // console.log("editor.lastchild:", editor.$doc.lastChild);
    const pageEle = pageContent.element;
    const pageHeight = pageEle.clientHeight;
    const availableHeight = availableHeightCalculator(pageEle);
    // console.log("可用高度：", availableHeight);
    // 计算子元素内容高度
    const contentHeight = childrenHeightCalculator(pageEle);
    if (contentHeight >= availableHeight) {
      // 获取最后一个子元素
      const lastChild = pageContent.lastChild;
      if (!lastChild) return;
      // 检查是否有下一页,获取下一个页面的pageContent
      const nextPageContent = checkNextPage(pageContent, editor);
      // 获取下一个页面的pageContent
      // let nextPageContent: { node: ProseMirrorNode; pos: number } | null = null;
      // const currentPageNode =
      //   pageContent.node.type.name === "pageContent"
      //     ? editor.state.doc.nodeAt(pageContent.pos - 1)
      //     : null;

      // if (currentPageNode) {
      //   const currentPagePos = pageContent.pos - 1;
      //   const nextPagePos = currentPagePos + currentPageNode.nodeSize;

      // if (nextPagePos < editor.state.doc.content.size) {
      //   const nextPageNode = editor.state.doc.nodeAt(nextPagePos);
      //   if (nextPageNode && nextPageNode.type.name === "page") {
      //     // 找到下一页的pageContent
      //     editor.state.doc.nodesBetween(
      //       nextPagePos,
      //       nextPagePos + nextPageNode.nodeSize,
      //       (node, pos) => {
      //         if (node.type.name === "pageContent") {
      //           nextPageContent = { node, pos };
      //           return false;
      //         }
      //         return true;
      //       }
      //     );
      //   }
      // }
      // }
      if (lastChild.textContent.length === 0) {
        console.log("空行溢出处理！");
        // 删除空段落，插入新页面或跳转下一页在开头插入空行
        // transaction.delete(lastChild.pos, lastChild.pos + lastChild.size);
        if (nextPageContent === null) {
          editor.chain().addNewPage().run();
          selection.replaceWith(transaction, lastChild.node);
          editor.chain().deleteCurrentNode().run();
          const newPage = editor.$doc.lastChild;
          console.log("newPage:", newPage);
          if (newPage && newPage.node.type.name === "page") {
            const newPageContent = newPage.children[1]
            editor.chain().setTextSelection(newPageContent.pos+1).run();
          }
        }

        // 刷新当前页面
        console.log("doc:", editor.getJSON());
        return;
      }
      // 处理溢出内容
      const lastChildElement = lastChild.element;
      const style = window.getComputedStyle(lastChildElement);
      const fontSize = parseFloat(style.fontSize);
      const lineHeight =
        style.lineHeight === "normal"
          ? fontSize * 1.2
          : parseFloat(style.lineHeight);
      console.log("字体大小fontSize:", fontSize);
      console.log("行高lineHeight:", lineHeight);
      // 计算溢出的高度
      const overflowHeight = contentHeight - availableHeight;
      console.log("溢出高度overflowHeight:", overflowHeight);
      // 计算溢出的行数（向上取整）
      const overflowLines = Math.floor(overflowHeight / lineHeight);
      console.log("溢出行数overflowLines:", overflowLines);

      // 获取最后一个元素的文本内容
      const lastChildContent = lastChild.node.textContent;
      console.log(
        "最后一个元素的文本内容lastChildContentLength:",
        lastChildContent.length
      );

      // 如果是段落元素，需要处理文本分割
      if (lastChild.node.type.name === "paragraph") {
        // 估算每行的平均字符数
        const avgCharsPerLine = Math.ceil(
          lastChildElement.clientWidth / fontSize
        );
        console.log("平均字符数avgCharsPerLine:", avgCharsPerLine);
        // 估算需要移动的字符数
        const charsToMove = Math.min(
          overflowLines * avgCharsPerLine,
          lastChildContent.length
        );
        console.log("需要移动的字符数charsToMove:", charsToMove);

        // 分割文本
        const keepText = lastChildContent.slice(
          0,
          lastChildContent.length - charsToMove
        );
        const moveText = lastChildContent.slice(
          lastChildContent.length - charsToMove
        );

        if (moveText) {
          // 更新当前段落
          // const tr = editor.state.tr;
          // const schema = editor.schema;
          // tr.setNodeMarkup(
          //   lastChild.pos - 1,
          //   null,
          //   lastChild.node.attrs
          // );
          // tr.insertText(
          //   keepText,
          //   lastChild.pos - 1,
          //   lastChild.pos - 1 + lastChildContent.length
          // );
          // console.log("keepText:", keepText, "len:", keepText.length);
          // console.log("moveText:", moveText, "len:", moveText.length);
          // const slice = lastChild.node.slice(1, keepText.length);
          // console.log("slice:", slice);
          // tr.replace(
          //   lastChild.pos - 1,
          //   lastChild.pos - 1 + lastChildContent.length,
          //   slice
          // );
          // editor.view.dispatch(tr);
          // 如果有下一页，将溢出内容移到下一页
          // if (nextPageContent) {
          //   const insertPos =
          //     (nextPageContent as { node: ProseMirrorNode; pos: number }).pos +
          //     1; // +1 是为了进入pageContent的内容
          //   editor
          //     .chain()
          //     .setParagraph()
          //     .setTextSelection(insertPos)
          //     .insertContent(moveText)
          //     .run();
          // } else {
          //   // 没有下一页，创建新页面
          //   editor.chain().addNewPage().run();
          //   // 获取新创建的页面的pageContent
          //   const newPageContent = editor.$doc.lastChild;
          //   console.log("newPageContent:", newPageContent);
          //   if (newPageContent && newPageContent.node.type.name === "page") {
          //     editor.state.doc.nodesBetween(
          //       newPageContent.pos,
          //       newPageContent.pos + newPageContent.size,
          //       (node, pos) => {
          //         if (node.type.name === "pageContent") {
          //           // 在新页面的pageContent中插入溢出内容
          //           editor
          //             .chain()
          //             .insertContentAt(
          //               pos + 1,
          //               editor.schema.nodes.paragraph.create(null,editor.schema.text(moveText))
          //             )
          //             // .setParagraph()
          //             // .setTextSelection(pos + 1)
          //             // .insertContent(moveText)
          //             .run();
          //           return false;
          //         }
          //         return true;
          //       }
          //     );
          //   }
          // }
        }
      } else {
        // 对于非段落元素，直接移动整个节点
        if (nextPageContent) {
          // 有下一页，移动到下一页
          const insertPos = nextPageContent.pos + 1;
          editor
            .chain()
            .setTextSelection(insertPos)
            .insertContent(lastChild.node.toJSON())
            .run();
          // 删除当前页面的最后一个元素
          editor
            .chain()
            .setTextSelection(lastChild.pos)
            .deleteRange({
              from: lastChild.pos,
              to: lastChild.pos + lastChild.node.nodeSize,
            })
            .run();
        } else {
          // 没有下一页，创建新页面并移动内容
          editor.chain().addNewPage().run();

          // 获取新创建的页面的pageContent
          const newPageContent = editor.$doc.lastChild;
          if (newPageContent && newPageContent.node.type.name === "page") {
            editor.state.doc.nodesBetween(
              newPageContent.pos,
              newPageContent.pos + newPageContent.node.nodeSize,
              (node, pos) => {
                if (node.type.name === "pageContent") {
                  // 在新页面的pageContent中插入溢出内容
                  editor
                    .chain()
                    .setTextSelection(pos + 1)
                    .insertContent(lastChild.node.toJSON())
                    .run();
                  // 删除当前页面的最后一个元素
                  editor
                    .chain()
                    .setTextSelection(lastChild.pos)
                    .deleteRange({
                      from: lastChild.pos,
                      to: lastChild.pos + lastChild.node.nodeSize,
                    })
                    .run();
                  return false;
                }
                return true;
              }
            );
          }
        }
      }
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

      // enableAutoPageBreak:
      //   () =>
      //   ({ editor }) => {
      //     const manager = this.storage.autoPageBreakManager;
      //     if (manager) {
      //       manager.enable();
      //       return true;
      //     }
      //     return false;
      //   },

      // disableAutoPageBreak:
      //   () =>
      //   ({ editor }) => {
      //     const manager = this.storage.autoPageBreakManager;
      //     if (manager) {
      //       manager.disable();
      //       return true;
      //     }
      //     return false;
      //   },

      // triggerAutoPageBreak:
      //   () =>
      //   ({ editor }) => {
      //     const manager = this.storage.autoPageBreakManager;
      //     if (manager) {
      //       manager.triggerManualCheck();
      //       return true;
      //     }
      //     return false;
      //   },

      // configureAutoPageBreak:
      //   (options) =>
      //   ({ editor }) => {
      //     const manager = this.storage.autoPageBreakManager;
      //     if (manager) {
      //       manager.updateOptions(options);
      //       return true;
      //     }
      //     return false;
      //   },

      // getAutoPageBreakStatus:
      //   () =>
      //   ({ editor }) => {
      //     const manager = this.storage.autoPageBreakManager;
      //     return manager ? manager.getStatus() : null;
      //   },
    };
  },
});
