import { Node, mergeAttributes } from "@tiptap/core";

import { PageHeaderOptions, PageHeaderAttributes } from "../typing/pageHeader";
// import { PageHeaderView } from "./pageHeaderView";
import { defaultMargins } from "../constant/defaultMargins";
import { headerFooterTextCalculator } from "../utils/calculator";
import { createTextMark } from "../utils/createTextMark";
import { createParagraph } from "../utils/createParagraph";
import { createPageHeader } from "../utils/createPageHeader";

export const PageHeader = Node.create<PageHeaderOptions>({
  name: "pageHeader",
  group: "page",
  content: "block*",
  isolating: true,

  addOptions() {
    return {
      textFormat: "",
      align: "right",
      height: 50,
      headerLine: false,
      HTMLAttributes: {
        class: "page-header",
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
      align: {
        default: this.options.align,
      },
      headerLing: {
        default: this.options.headerLine,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "page-header",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "page-header",
      mergeAttributes(this.options.HTMLAttributes!, HTMLAttributes),
      0,
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor, view }) => {
      // 创建页眉容器
      const pageHeader = document.createElement("div");
      pageHeader.classList.add("page-header");
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
      pageHeader.style.top = `calc(${
        typeof margins.top === "number" ? `${margins.top}px` : margins.top
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
        const pages = editor.$nodes("page");
        const index = pageNodePos.attributes.index || 1;
        const total = editor.storage.page.total;
        const text = headerFooterTextCalculator(
          index,
          total,
          node.attrs.textFormat || ""
        );
        const marks = createTextMark(editor.schema);
        const textNode = editor.schema.text(text, [marks]);
        const paragraphNode = createParagraph(
          editor.schema,
          {
            textIndent: "0",
            paragraphStart: "0",
            paragraphEnd: "0",
            textAlign: node.attrs.align || "right",
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
      pageHeader.contentEditable = "false";
      return {
        dom: pageHeader,
        contentDOM: pageHeader,
      };
    };
  },
  addCommands() {
    return {
      __flushHeader() {
        return ({ editor, tr, dispatch }) => {
          const pageHeaders = editor.$nodes("pageHeader");
          pageHeaders?.forEach((node) => {
            const index = node.attributes.index || 1;
            const total = editor.storage.page.total;
            // console.log("Header->attributes", node.attributes);
            const footer = createPageHeader(
              editor.schema,
              node.attributes as PageHeaderAttributes,
              index,
              total
            );
            tr.delete(node.pos - 1, node.pos + node.size - 1);
            tr.insert(node.pos - 1, footer);
            console.log("flush header:", `${index}-${total}`);
            if (dispatch) {
              dispatch(tr);
            }
          });
          return true;
        };
      },
    };
  },
});
