import { Node, mergeAttributes } from "@tiptap/core";
import { PageFooterOptions, PageFooterAttributes } from "../typing/pageFooter";

import { defaultMargins } from "../constant/defaultMargins";
import { headerFooterTextCalculator } from "../utils/calculator";
import { createTextMark } from "../utils/createTextMark";
import { createParagraph } from "../utils/createParagraph";
import { createPageFooter } from "../utils/createPageFooter";

export const PageFooter = Node.create<PageFooterOptions>({
  name: "pageFooter",
  group: "page",
  content: "block*",
  isolating: true,

  addOptions() {
    return {
      textFormat: "",
      align: "center",
      height: 50,
      footerLine: false,
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
      align: {
        default: this.options.align,
      },
      footerLing: {
        default: this.options.footerLine,
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
      // 创建页脚容器
      const pageFooter = document.createElement("div");
      pageFooter.classList.add("page-footer");
      pageFooter.style.position = "absolute";
      pageFooter.style.height = `${this.options.height}px`;
      pageFooter.style.lineHeight = `${this.options.height}px`;
      const pageNodePos = editor.$pos(getPos() || 1);
      const margins = pageNodePos.attributes.margins || defaultMargins;

      pageFooter.style.width = `calc(100% - ${
        typeof margins.left === "number" ? `${margins.left}px` : margins.left
      } - ${
        typeof margins.right === "number" ? `${margins.right}px` : margins.right
      } - 2px)`;
      pageFooter.style.bottom = `calc(${
        typeof margins.bottom === "number"
          ? `${margins.bottom}px`
          : margins.bottom
      } - ${this.options.height}px - 10px)`;
      pageFooter.style.left = `calc(${
        typeof margins.left === "number" ? `${margins.left}px` : margins.left
      } + 1px)`;

      setTimeout(() => {
        const currentPos = getPos();
        if (currentPos === undefined) return;
        if (node.content.size !== 0) return;
        const transaction = view.state.tr;
        const insertPos = currentPos + 1; // 插入位置
        // const pages = editor.$nodes("page");
        const index = pageNodePos.attributes.index || 1;
        const total = editor.storage.page.total;
        console.log("footer->index", index, "total", total);
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
            textAlign: node.attrs.align || "center",
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
      if (this.options.footerLine) {
        pageFooter.style.borderBottom = "1px solid #000";
      }
      pageFooter.contentEditable = "false";
      return {
        dom: pageFooter,
        contentDOM: pageFooter,
      };
    };
  },
  addCommands() {
    return {
      __flushFooter() {
        return ({ editor, tr, state, dispatch, commands }) => {
          const pageFooters = editor.$nodes("pageFooter");
          // console.log("pageFooters:", pageFooters);
          // const pages = editor.$nodes("page");
          pageFooters?.forEach((node) => {
            const index = node.attributes.index || 1;
            const total = editor.storage.page.total;
            // console.log("footer->attributes", node.attributes);
            const footer = createPageFooter(
              editor.schema,
              node.attributes as PageFooterAttributes,
              index,
              total
            );
            tr.delete(node.pos - 1, node.pos + node.size - 1);
            tr.insert(node.pos - 1, footer);
            console.log("flush footer:", `${index}-${total}`);
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
