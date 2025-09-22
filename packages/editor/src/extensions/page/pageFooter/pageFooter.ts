import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PageHeaderOptions } from "../typing/pageHeader";
// import { PageHeaderView } from "./pageHeaderView";
import { defaultMargins } from "../constant/defaultMargins";
import { headerFooterTextCalculator } from "../utils/calculator";
import { createTextMark } from "../utils/createTextMark";
import { createParagraph } from "../utils/createParagraph";

export const PageFooter = Node.create<PageHeaderOptions>({
  name: "pageFooter",
  group: "page",
  content: "block*",
  isolating: true,

  addOptions() {
    return {
      textFormat: "",
      align: "center",
      height: 50,
      headerLine: false,
      HTMLAttributes: {
        class: "page-footer",
      },
    };
  },
  addAttributes() {
    return {
      textFormat: {
        default: this.options.textFormat,
      },
      height: {
        default: this.options.height,
      },
      footerLing: {
        default: this.options.headerLine,
      },
      _updateTimestamp: {
        default: Date.now(),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "page-footer",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "page-footer",
      mergeAttributes(this.options.HTMLAttributes!, HTMLAttributes),
      0,
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor, view }) => {
      // 创建页眉容器
      const pageHeader = document.createElement("div");
      pageHeader.classList.add("page-footer");
      pageHeader.style.position = "absolute";
      pageHeader.style.height = `${this.options.height}px`;
      pageHeader.style.lineHeight = `${this.options.height}px`;
      const pageNodePos = editor.$pos(getPos() || 1);
      const margins = pageNodePos.attributes.margins || defaultMargins;

      pageHeader.style.width = `calc(100% - ${
        typeof margins.left === "number" ? `${margins.left}px` : margins.left
      } - ${
        typeof margins.right === "number" ? `${margins.right}px` : margins.right
      } - 2px)`;
      pageHeader.style.bottom = `calc(${
        typeof margins.bottom === "number"
          ? `${margins.bottom}px`
          : margins.bottom
      } - ${this.options.height}px - 10px)`;
      pageHeader.style.left = `calc(${
        typeof margins.left === "number" ? `${margins.left}px` : margins.left
      } + 1px)`;
      // pageHeader.style.textAlign = this.options.align || "right";
      // pageHeader.style.fontFamily = "KaiTi, serif";
      // pageHeader.style.fontSize = "9pt";
      // pageHeader.style.border = "1px solid #fff";
      setTimeout(() => {
        const currentPos = getPos();
        if (currentPos === undefined) return;
        if (node.content.size !== 0) return;
        const transaction = view.state.tr;
        const insertPos = currentPos + 1; // 插入位置
        // const pages = editor.$nodes("page");
        const index = pageNodePos.attributes.index || 1;
        const total = editor.storage.page.total;
        console.log("index", index, "total", total);
        const text = headerFooterTextCalculator(
          index,
          total,
          this.options.textFormat || ""
        );
        const marks = createTextMark(editor.schema);
        const textNode = editor.schema.text(text, [marks]);
        const paragraphNode = createParagraph(
          editor.schema,
          {
            textIndent: "0",
            paragraphStart: "0",
            paragraphEnd: "0",
            textAlign: this.options.align || "center",
          },
          textNode
        );
        transaction.insert(insertPos, paragraphNode);
        if (transaction.docChanged) {
          view.dispatch(transaction);
        }
      }, 0);

      // console.log("page-header-text:", text);
      // const insertPos = (getPos() || 1) + 1;

      // pageHeader.innerText = text;
      if (this.options.headerLine) {
        pageHeader.style.borderBottom = "1px solid #000";
      }
      return {
        dom: pageHeader,
        contentDOM: pageHeader,
      };
    };
  },
  addCommands() {
    return {
      __flushFooter() {
        return ({ editor, tr, state, dispatch }) => {
          const pageFooters = editor.$nodes("pageFooter")
          console.log('pageFooters:',pageFooters)
          const pages = editor.$nodes("page");
          pages?.forEach((pageNode) => { 
            console.log('pageNode:',pageNode)
          });
          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (node.type.name === "pageFooter") {
              tr.setNodeAttribute(pos, "_updateTimestamp", Date.now());
              console.log("flush footer",node);
              if (dispatch) {
                dispatch(tr);
              }
            }
          });
          // const pageHeaders = editor.$nodes("pageFooter");
          // console.log("page-footer-flush", pageHeaders);
          // pageHeaders?.forEach((node) => {
          //   tr.setNodeAttribute(node.pos - 1, "_updateTimestamp", Date.now());
          //   if (dispatch) {
          //     dispatch(tr);
          //   }
          // });
          return true;
        };
      },
    };
  },
});
