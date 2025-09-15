import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PageHeaderOptions } from "../typing";
import { findPageNode } from "../utils/findPageNode";
import { getPageMargins } from "../utils/getPageMargins";

export const PageHeader = Node.create<PageHeaderOptions>({
  name: "pageHeader",
  group: "block",
  content: "headerFooterBlock+",
  defining: true,

  addOptions() {
    return {
      text: "",
      position: "left",
      height: 50,
      headerLine: false,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      height: {
        default: this.options.height,
        parseHTML: (element) => element.getAttribute("height"),
        renderHTML: (attributes) => ({
          style: `height: ${attributes.height}px`,
        }),
      },
      _updateTimestamp: {
        default: Date.now(),
      },
    };
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      const { view } = editor;
      console.log('render page header')
      // 创建页眉容器
      const pageHeader = document.createElement("div");
      pageHeader.classList.add("tiptap-page-header");

      // 获取页面边距信息
      const margins = getPageMargins(editor, getPos);
      console.log('render page header margins', margins)
      // 应用基础样式
      Object.assign(pageHeader.style, {
        height: `${this.options.height}px`,
        lineHeight: `${this.options.height}px`,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: `${this.options.height}px`,
        width: `calc(100% - ${margins.left} - ${margins.right})`,
        justifyContent: "center",
        border: "1px solid #fff",
        alignItems: "center",
        // fontSize: "9pt",
        position: "absolute",
        top: `calc(${margins.top} - ${this.options.height}px - 2px)`,
        left: margins.left,
      });
      console.log('render page header top', pageHeader.style.top)

      if (this.options.headerLine) {
        pageHeader.style.borderBottom = "1px solid #000";
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
              const textNode = childNode.content
                ? schema.text(childNode.content, [defaultTextMarks])
                : undefined;
              const pmNode = nodeType.create(childNode.attrs, textNode);
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
        dom: pageHeader,
        contentDOM: pageHeader,
      };
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
    return ["page-header", mergeAttributes(HTMLAttributes)];
  },
  addCommands() {
    return {
      _flushHeader:
        (pageNode, pagePos) =>
        ({ editor, tr, state, commands, dispatch }) => {
          // 查找并更新当前页面的页头页脚节点，触发重新渲染
          let headerNode: any = null;
          let headerPos = -1;

          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            // 在当前页面范围内查找页头节点
            if (
              node.type.name === "pageHeader" &&
              pos > pagePos &&
              pos < pagePos + pageNode.nodeSize
            ) {
              headerNode = node;
              headerPos = pos;
              console.log("head:", headerNode);
            }
            // 继续遍历直到找到所有需要的节点
            return true;
          });
          // 更新页头节点，添加时间戳属性以触发重新渲染
          if (headerNode && headerPos >= 0) {
            tr.setNodeMarkup(headerPos, null, {
              ...headerNode.attrs,
              height: 30,
              // 添加时间戳属性强制重新渲染，这样页头会重新计算位置
              _updateTimestamp: Date.now(),
            });
          }
          if (dispatch) {
            dispatch(tr);
            return true;
          }
          return false;
        },
    };
  },
});
