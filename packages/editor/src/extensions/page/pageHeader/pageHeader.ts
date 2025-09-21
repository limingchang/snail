import { Node, mergeAttributes } from "@tiptap/core";

import { PageHeaderOptions } from "../typing/pageHeader";
// import { PageHeaderView } from "./pageHeaderView";
import { defaultMargins } from "../constant/defaultMargins";

export const PageHeader = Node.create<PageHeaderOptions>({
  name: "pageHeader",
  group: "page",
  content: "block*",
  isolating: true,

  addOptions() {
    return {
      text: "",
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
      _updateTimestamp: {
        default: Date.now(),
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
      } - ${this.options.height}px - 2px)`;
      pageHeader.style.left = `calc(${
        typeof margins.left === "number" ? `${margins.left}px` : margins.left
      } + 1px)`;
      pageHeader.style.textAlign = this.options.align || "right";
      pageHeader.style.fontFamily = "KaiTi, serif";
      pageHeader.style.fontSize = "9pt";
      pageHeader.style.border = "1px solid #fff";
      const pages = editor.$nodes("page");
      const total = pages === null ? 1 : pages.length;
      const text =
        typeof this.options.text === "undefined"
          ? ""
          : typeof this.options.text === "function"
          ? this.options.text(pageNodePos.attributes.index || 1, total)
          : this.options.text;
      console.log("page-header-text:", text);
      pageHeader.innerText = text;
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
      __flushHeader() {
        return ({ editor, tr, dispatch }) => {
          const pageHeaders = editor.$nodes("pageHeader");
          pageHeaders?.forEach((node) => {
            tr.setNodeAttribute(node.pos - 1, "_updateTimestamp", Date.now());
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
