import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PageHeaderOptions } from "../typing";
import { findPageNode } from "../utils/findPageNode";
import { getPageMargins } from "../utils/getPageMargins";
import { 
  registerNodeView, 
  unregisterNodeView, 
  type HeaderFooterNodeView 
} from "../utils/nodeViewRegistry";
import {
  calculateHeaderStyles,
  applyStylesToElement,
  normalizeHeaderFooterOptions,
  type Margins
} from "../utils/styleCalculator";
import {
  registerEnhancedNodeView,
  unregisterEnhancedNodeView,
  type EnhancedHeaderFooterNodeView
} from "../utils/nodeViewManager";

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
      console.log('render page header with enhanced features');
      
      // 创建页眉容器
      const pageHeader = document.createElement("div");
      pageHeader.classList.add("tiptap-page-header");

      // 获取初始位置，用于注册NodeView实例
      const initialPos = typeof getPos === 'function' ? getPos() : undefined;
      
      // 标准化选项
      const normalizedOptions = normalizeHeaderFooterOptions('header', this.options);
      
      // 应用样式的函数
      const applyStyles = (margins: Margins) => {
        console.log('applying header styles with margins:', margins);
        
        // 使用样式计算工具计算样式
        const styles = calculateHeaderStyles(margins, normalizedOptions);
        
        // 应用样式到DOM元素
        applyStylesToElement(pageHeader, styles);
      };
      
      // 获取页面边距信息并初始化样式
      const margins = getPageMargins(editor, getPos);
      console.log('render page header margins', margins);
      applyStyles(margins);
      console.log('render page header top', pageHeader.style.top);

      // 创建增强版NodeView实例对象
      const enhancedNodeViewInstance: EnhancedHeaderFooterNodeView = {
        isDestroyed: false,
        nodeType: 'pageHeader',
        position: initialPos || 0,
        dom: pageHeader,
        updateStyles: (newMargins: Margins) => {
          if (enhancedNodeViewInstance.isDestroyed) return;
          console.log('updating header styles with new margins:', newMargins);
          applyStyles(newMargins);
        },
        destroy: () => {
          if (enhancedNodeViewInstance.isDestroyed) return;
          enhancedNodeViewInstance.isDestroyed = true;
          
          // 执行DOM清理等必要操作
          // 不调用 unregisterEnhancedNodeView 避免循环引用
        }
      };
      
      // 创建兼容的旧版NodeView实例对象
      const nodeViewInstance: HeaderFooterNodeView = {
        isDestroyed: false,
        updateStyles: enhancedNodeViewInstance.updateStyles,
        destroy: enhancedNodeViewInstance.destroy,
        dom: pageHeader
      };
      
      // 同时注册到两个注册表以保持兼容性
      if (typeof initialPos === 'number') {
        registerNodeView(editor, 'pageHeader', initialPos, nodeViewInstance);
        registerEnhancedNodeView(editor, enhancedNodeViewInstance);
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
        
        // 实现update方法响应属性变化
        update: (updatedNode: ProseMirrorNode) => {
          if (updatedNode.type.name !== node.type.name) {
            return false;
          }
          
          // 检查父页面节点的边距是否发生变化
          const currentMargins = getPageMargins(editor, getPos);
          console.log('NodeView update called with margins:', currentMargins);
          
          // 应用新样式
          enhancedNodeViewInstance.updateStyles(currentMargins);
          
          return true;
        },
        
        destroy: () => {
          // TipTap调用此方法时，手动清理
          enhancedNodeViewInstance.destroy();
          if (typeof initialPos === 'number') {
            unregisterNodeView(editor, 'pageHeader', initialPos);
            unregisterEnhancedNodeView(editor, 'pageHeader', initialPos);
          }
        }
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
});
