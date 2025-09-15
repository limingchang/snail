import { Node, mergeAttributes } from "@tiptap/core";

import { PageFooterOptions } from "../typing";
// import { HeaderFooterStorage, PageStorage } from "../../../typing";
import { findPageNode } from "../utils/findPageNode";
import { getPageMargins } from "../utils/getPageMargins";

export const PageFooter = Node.create<PageFooterOptions>({
  name: "pageFooter",
  group: "block",
  content: "headerFooterBlock+",
  defining: true,

  addOptions() {
    return {
      text: "",
      position: "center",
      height: 50,
      footerLine: false,
      HTMLAttributes: {},
    };
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      const { view } = editor;

      // 创建页脚容器
      const pageFooter = document.createElement("div");
      pageFooter.classList.add("tiptap-page-footer");

      // 获取页面边距信息
      const margins = getPageMargins(editor, getPos);

      // 应用基础样式
      Object.assign(pageFooter.style, {
        height: `${this.options.height}px`,
        lineHeight: `${this.options.height}px`,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        width: `calc(100% - ${margins.left} - ${margins.right} - 2px)`,
        justifyContent: "center",
        border: "1px solid #fff",
        alignItems: "center",
        position: "absolute",
        bottom: `calc(${margins.bottom} - ${this.options.height}px - 2px)`,
        left: margins.left,
      });

      if (this.options.footerLine) {
        pageFooter.style.borderTop = "1px solid #000";
      }

      // 检查节点是否已有内容，避免重复创建
      if (node.content.size === 0 && typeof getPos === "function") {
        // 延迟执行，确保节点已经插入到DOM中
        setTimeout(() => {
          const currentPos = getPos();
          if (currentPos === null || currentPos === undefined) return;

          const transaction = view.state.tr;
          const pos = currentPos + 1; // 插入位置

          // 获取总页数和当前页
          const total = editor.$nodes("page")?.length || 1;
          const index = findPageNode(view, getPos)?.node.attrs.index || 1;
          // 创建左中右三个区域的内容
          const textValue =
            typeof this.options.text === "function"
              ? this.options.text(index, total)
              : this.options.text;
          const leftContent = this.options.position === "left" ? textValue : "";
          const centerContent =
            this.options.position === "center" ? textValue : "";
          const rightContent =
            this.options.position === "right" ? textValue : "";

          // 插入子节点
          const schema = editor.schema;
          const defaultTextMarks = schema.mark("textStyle", {
            fontSize: "9pt",
            lineHeight: "1",
            fontFamily: "KaiTi, serif",
          });
          const childNodes = [
            {
              attrs: { textAlign: "left" },
              content: leftContent || "",
            },
            {
              content: centerContent || "",
              attrs: { textAlign: "center" },
            },
            {
              content: rightContent || "",
              attrs: { textAlign: "right" },
            },
          ];

          let insertPos = pos;
          childNodes.forEach((childNode) => {
            const nodeType = schema.nodes["headerFooterBlock"];
            if (nodeType) {
              const content = childNode.content
                ? schema.text(childNode.content,[defaultTextMarks])
                : undefined;
              const pmNode = nodeType.create(childNode.attrs, content);
              transaction.insert(insertPos, pmNode);
              insertPos += pmNode.nodeSize;
            }
          });

          if (transaction.docChanged) {
            view.dispatch(transaction);
          }
        }, 0);
      }
      
      return {
        dom: pageFooter,
        contentDOM: pageFooter,
      };
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
    return ["page-footer", mergeAttributes(HTMLAttributes)];
  },
});
