import { Node, mergeAttributes } from "@tiptap/core";

import {
  defaultMargins,
  // type PageOptions,
  type PageAttributes,
} from "./typing";
import { calculatePaperSize } from "./utils/paperSizeCalculator";

import { createLocator } from "./utils/createLocator";
import { createFooter, createHeader } from "./utils/createHeaderFooter";

export const SiglePage = Node.create({
  name: "siglePage",
  group: "block",
  // content: "(pageHeader | block | pageFooter)+",
  content: "block+",
  addOptions() {
    return {
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
        default: "A4",
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
        default: { text: "", height: 50, align: "right", line: false },
      },
      footer: {
        default: {
          text: (index: number, total: number) =>
            `第 ${index} 页 , 共 ${total} 页`,
          height: 50,
          align: "center",
          line: false,
        },
      },
    };
  },
  addNodeView() {
    return ({ node, view, editor }) => {
      // 创建每一页的容器
      const page = document.createElement("section");
      page.classList.add("s-editor-page");
      const total = editor.$nodes("siglePage")?.length || 0;
      // const index = total + 1;
      page.setAttribute("data-index", node.attrs.index);
      // 设置页面样式
      const { paperFormat, orientation, margins } =
        node.attrs as PageAttributes;
      // 获取页面格式和方向
      const { width, height } = calculatePaperSize(paperFormat, orientation);
      // 设置页面容器样式
      // page.style.flex = "1";
      page.style.flexGrow = "1";
      page.style.flexShrink = "0";
      page.style.position = "relative";
      page.style.width = `${width}mm`;
      page.style.height = `${height}mm`;
      page.style.backgroundColor = "#fff";
      page.style.borderRadius = "5px";
      // 创建定位器
      if (editor.isEditable) {
        // 设计模式下添加定位器
        page.appendChild(createLocator("top-left", margins));
        page.appendChild(createLocator("top-right", margins));
        page.appendChild(createLocator("bottom-left", margins));
        page.appendChild(createLocator("bottom-right", margins));
      }

      // 创建页面内容
      const content = document.createElement("div");
      content.classList.add("s-editor-page-content");
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
      page.appendChild(header);
      page.appendChild(content);
      page.appendChild(footer);

      // 设置分页元素
      const breakPageDiv = document.createElement("div");
      breakPageDiv.style.breakAfter = "page";
      page.appendChild(breakPageDiv);
      return {
        dom: page,
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
