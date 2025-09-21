import { Node, mergeAttributes } from "@tiptap/core";

import {
  defaultMargins,
  // type PageOptions,
  // type PageAttributes,
} from "./typing";
import { PaperAttributes, PaperOptions } from "./typing/paper";
import { calculatePaperSize } from "./utils/paperSizeCalculator";

import { createLocator } from "./utils/createLocator";
import { createFooter, createHeader } from "./utils/createHeaderFooter";

export const Paper = Node.create<PaperOptions>({
  name: "paper",
  group: "block",
  content: "block*",
  addOptions() {
    return {
      header: { text: "", height: 50, align: "right", headerLine: false },
      footer: {
        text: (index: number, total: number) =>
          `第 ${index} 页 , 共 ${total} 页`,
        height: 50,
        align: "center",
        footerLine: false,
      },
      HTMLAttributes: {},
    };
  },
  addAttributes() {
    return {
      index: {
        default: 1,
        parseHTML(element) {
          return element.getAttribute("data-index") || 1;
        },
        renderHTML: (attributes) => ({
          "data-index": attributes.index,
        }),
      },
      paperFormat: {
        default: this.options.paperFormat,
      },
      orientation: {
        default: "portrait", // 默认纵向
        parseHTML(element) {
          if (element.style.width > element.style.height) {
            return "landscape";
          }
          return "portrait";
        },
      },
      margins: {
        default: defaultMargins,
      },
      header: {
        default: this.options.header,
      },
      footer: {
        default: this.options.footer,
      },
    };
  },
  addNodeView() {
    return ({ node, view, editor }) => {
      // 创建每一页的容器
      const paper = document.createElement("section");
      paper.classList.add("s-editor-paper");
      const total = editor.$nodes("paper")?.length || 0;
      // const index = total + 1;
      paper.setAttribute("data-index", node.attrs.index);
      // 设置页面样式
      const { paperFormat, orientation, margins } =
        node.attrs as PaperAttributes;
      // 获取页面格式和方向
      const { width, height } = calculatePaperSize(paperFormat, orientation);
      // 设置页面容器样式
      // page.style.flex = "1";
      paper.style.flexGrow = "1";
      paper.style.flexShrink = "0";
      paper.style.position = "relative";
      paper.style.width = `${width}mm`;
      paper.style.height = `${height}mm`;
      paper.style.backgroundColor = "#fff";
      paper.style.borderRadius = "5px";
      // 创建定位器
      if (editor.isEditable) {
        // 设计模式下添加定位器
        paper.appendChild(createLocator("top-left", margins));
        paper.appendChild(createLocator("top-right", margins));
        paper.appendChild(createLocator("bottom-left", margins));
        paper.appendChild(createLocator("bottom-right", margins));
      }

      // 创建页面内容
      const content = document.createElement("div");
      content.classList.add("s-editor-paper-content");
      content.style.position = "relative";
      content.style.padding = `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
      content.style.height = `calc(${height}mm - ${margins.top} - ${margins.bottom})`;

      // 创建页头页脚
      const header = createHeader(
        node.attrs.header,
        margins,
        node.attrs.index,
        total
      );
      const footer = createFooter(
        node.attrs.footer,
        margins,
        node.attrs.index,
        total
      );
      paper.appendChild(header);
      paper.appendChild(content);
      paper.appendChild(footer);

      // 设置分页元素
      const breakPageDiv = document.createElement("div");
      breakPageDiv.style.breakAfter = "page";
      paper.appendChild(breakPageDiv);
      return {
        dom: paper,
        contentDOM: content,
      };
    };
  },

  // 解析HTML
  parseHTML() {
    return [
      {
        tag: "signPage",
      },
    ];
  },
  // 渲染HTML
  renderHTML({ HTMLAttributes }) {
    return [
      "signPage",
      mergeAttributes(HTMLAttributes, {
        "data-type": "signPage",
      }),
    ];
  },
});
