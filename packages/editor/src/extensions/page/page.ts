import { Node, mergeAttributes } from "@tiptap/core";

import {
  defaultMargins,
  type PageOptions,
  type PageAttributes,
} from "./typing";

import { defaultHeaderAttributes } from "./typing/header";

import { PageHeader } from "./pageHeader";
import { HeaderFooterBlock, PageContent } from "./content";

import { calculatePaperSize } from "./utils/paperSizeCalculator";

import {
  calculateHeaderStyles,
  calculateFooterStyles,
  normalizeHeaderFooterOptions,
} from "./utils/styleCalculator";

export const Page = Node.create<PageOptions>({
  name: "page",
  group: "block",
  // content: "(pageHeader | block | pageFooter)+",
  content: "(pageHeader | block )+",
  topNode: false,
  addOptions() {
    return {
      paperFormat: "A4",
      header: undefined,
      footer: undefined,
      pageGap: 8,
      HTMLAttributes: {},
    };
  },
  addExtensions() {
    return [
      PageHeader,
      HeaderFooterBlock,
      // PageFooter,
    ];
  },
  addAttributes() {
    return {
      index: {
        default: 1,
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
        parseHTML(element) {
          return {
            margins: {
              top: element.style.marginTop,
              right: element.style.marginRight,
              bottom: element.style.marginBottom,
              left: element.style.marginLeft,
            },
          };
        },
        renderHTML(attributes) {
          return {
            style: `
            padding-top: ${attributes.margins.top};
            padding-right: ${attributes.margins.right};
            padding-bottom: ${attributes.margins.bottom};
            padding-left: ${attributes.margins.left};
          `,
          };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, view, getPos, editor }) => {
      const schema = editor.schema;
      // console.log("page getPos", getPos());
      // 创建页面容器
      const pageContiner = document.createElement("div");
      pageContiner.classList.add("s-editor-page-wrapper");
      const { paperFormat, orientation, margins } =
        node.attrs as PageAttributes;
      // 获取页面格式和方向
      const { width, height } = calculatePaperSize(paperFormat, orientation);
      // 设置页面容器样式
      pageContiner.style.position = "relative";
      pageContiner.style.width = `${width}mm`;
      pageContiner.style.height = `${height}mm`;
      pageContiner.style.backgroundColor = "#fff";
      pageContiner.style.borderRadius = "15px";

      // 创建内容容器
      const contentArea = document.createElement("div");
      contentArea.classList.add("s-editor-page");
      contentArea.style.padding = `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
      contentArea.style.height = `calc(${height}mm - ${margins.top} - ${margins.bottom})`;
      contentArea.style.position = "relative";
      // 插入页头页脚

      const { header, footer } = this.options;
      // 检查节点是否已有内容，避免重复创建

      const contentSize = node.content.size;
      console.log(node.content);
      node.content.forEach((child) => {
        console.log(child.type.name);
      });
      
      if (node.content.size === 0 && typeof getPos === "function") {
        const currentPos = getPos();
        let insertPos = 0;
        if (currentPos !== null || currentPos !== undefined) {
          const transaction = view.state.tr;
          const pos = currentPos! + 1; // 插入位置
          // 创建页头页脚容器
          const headerAttrs = Object.assign(defaultHeaderAttributes, header);
          console.log("headerAttrs", headerAttrs);
          const headerNode = schema.node("pageHeader", headerAttrs);
          transaction.insert(pos, headerNode);
          insertPos += headerNode.nodeSize;
          // 刷新插入点
          if (transaction.docChanged) {
            view.dispatch(transaction);
          }
        }
      }
      

      // if (header) {
      //   // 创建页头容器
      //   console.log('rendering page header');
      //   const headerContainer = document.createElement("div");
      //   headerContainer.classList.add("s-editor-page-header");
      //   // 标准化选项
      //   const normalizedOptions = normalizeHeaderFooterOptions(
      //     "header",
      //     header
      //   );
      //   // 使用样式计算工具计算样式
      //   const styles = calculateHeaderStyles(margins, normalizedOptions);
      //   Object.assign(headerContainer.style, styles);
      //   headerContainer.innerText = header.text || '';
      //   headerContainer.setAttribute('contenteditable','true')
      //   // contentArea.appendChild(headerContainer);
      //   pageContiner.appendChild(headerContainer);
      // }
      if (footer) {
        // 创建页脚容器
        const footerContainer = document.createElement("div");
        footerContainer.classList.add("s-editor-page-footer");
        // 标准化选项
        const normalizedOptions = normalizeHeaderFooterOptions(
          "footer",
          footer
        );
        const styles = calculateFooterStyles(margins, normalizedOptions);
        Object.assign(footerContainer.style, styles);
        contentArea.appendChild(footerContainer);
      }

      pageContiner.appendChild(contentArea);
      // 设置分页元素
      const breakPageDiv = document.createElement("div");
      breakPageDiv.style.breakAfter = "page";
      pageContiner.appendChild(breakPageDiv);

      return {
        dom: pageContiner,
        contentDOM: contentArea,
      };
    };
  },
  // 解析HTML
  parseHTML() {
    return [
      {
        tag: "page",
      },
    ];
  },
  // 渲染HTML
  renderHTML({ HTMLAttributes }) {
    return [
      "page",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page",
      }),
    ];
  },
});
