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
      // 检查是否有下一页,获取下一个页面的PageNodePos
      const nextPageNodePos = checkNextPage(editor, selection);
      if (lastChild.textContent.length === 0) {
        console.log("空行溢出处理！");
        // 删除空段落，插入新页面或跳转下一页在开头插入空行
        // transaction.delete(lastChild.pos, lastChild.pos + lastChild.size);
        // console.log("nextPageNodeAndPos:", nextPageNodePos);
        if (nextPageNodePos === null) {
          selection.replaceWith(transaction, lastChild.node);
          editor.chain().deleteCurrentNode().run();
          editor.chain().addNewPage().run();
          const newPage = editor.$doc.lastChild;
          console.log("newPage:", newPage);
          if (newPage && newPage.node.type.name === "page") {
            const newPageContent = newPage.children[1];
            editor
              .chain()
              .setTextSelection(newPageContent.pos + 1)
              .setParagraphStyle({ textIndent: "2em" })
              .run();
          }
        } else {
          // 跳转下一页在开头插入空行
          selection.replaceWith(transaction, lastChild.node);
          editor.chain().deleteCurrentNode().run();
          // 跳转下一页,插入新段落
          editor
            .chain()
            .insertContentAt(nextPageNodePos.children[1].pos - 1, {
              type: "paragraph",
              text: "",
              attrs: {
                textIndent: "2em",
              },
            })
            .setTextSelection(nextPageNodePos.children[1].pos - 1)
            .run();
        }
        // console.log("doc:", editor.getJSON());
        return;
      }
      // 处理溢出内容
      const lastChildElement =
        lastChild.element.querySelector("span") || lastChild.element;
      console.log("lastChild:", lastChild);
      console.log("lastChildElement:", lastChildElement);
      const style = window.getComputedStyle(lastChildElement);
      const fontSize = parseFloat(style.fontSize);
      const lineHeight =
        style.lineHeight === "normal"
          ? fontSize * 1.2
          : parseFloat(style.lineHeight);
      console.log("字体大小fontSize:", fontSize);
      console.log("行高lineHeight:", lineHeight);
      console.log("字符间距：", style.wordSpacing);
      // 计算溢出的高度
      const overflowHeight = contentHeight - availableHeight;
      console.log("溢出高度overflowHeight:", overflowHeight);
      // 计算行数
      const lines = Math.floor(lastChild.element.clientHeight / lineHeight);
      console.log(
        "lastChildElement clientHeight:",
        lastChild.element.clientHeight,
        "行数lines:",
        lines
      );
      // 计算溢出的行数（向上取整）
      const overflowLines = Math.ceil(overflowHeight / lineHeight);
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
        const avgCharsPerLine =
          Math.ceil(lastChild.element.clientWidth / fontSize) - 1;
        console.log("平均字符数avgCharsPerLine:", avgCharsPerLine);
        // 统计有多少个英文字符
        const englishChars = lastChildContent.match(/[a-zA-Z]/g)?.length || 0;
        console.log("英文字符数englishChars:", englishChars);
        // 估算需要移动的字符数
        const charsToMove = lastChildContent.length - (lines - overflowLines) * avgCharsPerLine;

        console.log("需要移动的字符数charsToMove:", charsToMove);

        console.log("英文字符数englishChars:", englishChars);
        // 分割文本
        const keepText = lastChildContent.slice(
          0,
          lastChildContent.length - charsToMove
        );
        const moveText = lastChildContent.slice(
          lastChildContent.length - charsToMove
        );
        console.log("keepText:", keepText, "len:", keepText.length);
        console.log("moveText:", moveText, "len:", moveText.length);
        if (moveText) {
          // 更新当前段落
          const schema = editor.schema;
          const tr = editor.state.tr;
          // console.log("text-marks:", lastChild.node.lastChild?.marks);
          const textMarks = lastChild.node.lastChild?.marks || [];
          const slice = lastChild.node.slice(0, keepText.length, true);
          // const slice = pageContent.node.slice()
          console.log("slice:", slice);
          tr.replace(
            lastChild.pos,
            lastChild.pos + lastChildContent.length,
            slice
          );
          editor.view.dispatch(tr);
          // 如果有下一页，将溢出内容移到下一页
          if (nextPageNodePos) {
            const insertPos = nextPageNodePos.children[1].pos - 1;
            editor
              .chain()
              .insertContentAt(insertPos, schema.text(moveText, textMarks))
              .run();
          } else {
            // 没有下一页，创建新页面
            editor.chain().addNewPage().run();
            const newPage = editor.$doc.lastChild;
            console.log("newPage:", newPage);
            if (newPage && newPage.node.type.name === "page") {
              const newPageContent = newPage.children[1];
              const insertPos = newPageContent.pos + 1;
              editor
                .chain()
                .setTextSelection(newPageContent.pos + 1)
                .run();
              editor
                .chain()
                .insertContentAt(insertPos, schema.text(moveText, textMarks))
                .run();
            }
          }
         
        }
      } else {
        // 对于非段落元素，直接移动整个节点
        if (nextPageNodePos) {
          // 有下一页，移动到下一页
          const insertPos = nextPageNodePos.pos + 1;
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
