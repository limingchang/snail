import { Node, mergeAttributes } from "@tiptap/core";
import { defaultMargins } from "./typing/index";
import { findPageNode } from "./utils/findPageNode";
import {
  calculateHeaderStyles,
  calculateFooterStyles,
  normalizeHeaderFooterOptions,
} from "./utils/styleCalculator";

export const PageFooter = Node.create({
  name: "pageFooter",
  group: "block",
  content: "block*",
  defining: true,
  parseHTML() {
    return [
      {
        tag: "page-footer",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["page-footer", mergeAttributes(HTMLAttributes), 0];
  },

  addAttributes() {
    return {
      height: {
        default: 50,
        parseHTML: (element) => (element as any).innerHeight,
        renderHTML: (attributes) => ({
          style: `height: ${attributes.height}px`,
        }),
      },
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-foot-text"),
      },
      textPosition: {
        default: "right",
      },
      pageMargins: {
        default: defaultMargins,
      },
      headerLine: {
        default: false,
      },
    };
  },

  addNodeView() {
    return ({ editor, node, getPos, view }) => {
      // 创建页眉容器
      const pageHeader = document.createElement("div");
      pageHeader.classList.add("s-editor-page-footer");
      // 设置容器样式
      // 标准化选项
      // const normalizedOptions = normalizeHeaderFooterOptions("header", header);
      // 使用样式计算工具计算样式
      const styles = calculateHeaderStyles(node.attrs);

      Object.assign({}, pageHeader.style, styles);
      const transaction = view.state.tr;
      if (typeof getPos === "function" && getPos() !== undefined) {
        const currentPos = getPos() as number;

        const pos = currentPos + 1; // 插入位置
        // 获取总页数和当前页
        const total = editor.$nodes("page")?.length || 1;
        const index = findPageNode(view, getPos)?.node.attrs.index || 1;
        // 创建左中右三个区域的内容
        const textValue =
          typeof this.options.text === "function"
            ? node.attrs.text(index, total)
            : node.attrs.text;
        const leftContent = node.attrs.textPosition === "left" ? textValue : "";
        const centerContent =
          node.attrs.textPosition === "center" ? textValue : "";
        const rightContent =
          node.attrs.textPosition === "right" ? textValue : "";

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
          const nodeType = schema.nodes["paragraph"];
          if (nodeType) {
            const textNode = childNode.content
              ? schema.text(childNode.content, [defaultTextMarks])
              : undefined;
            const pmNode = nodeType.create(childNode.attrs, textNode);
            transaction.insert(insertPos, pmNode);
            insertPos += pmNode.nodeSize;
          }
        });
      }
      view.dispatch(transaction);
      return {
        dom: pageHeader,
        contentDOM: pageHeader,
      };
    };
  },
});
