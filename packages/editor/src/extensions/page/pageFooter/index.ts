import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PageFooterOptions } from "../typing";
// import { HeaderFooterStorage, PageStorage } from "../../../typing";
import { findPageNode } from "../utils/findPageNode";
import { getPageMargins } from "../utils/getPageMargins";
import { 
  registerNodeView, 
  unregisterNodeView, 
  type HeaderFooterNodeView 
} from "../utils/nodeViewRegistry";
import {
  calculateFooterStyles,
  applyStylesToElement,
  normalizeHeaderFooterOptions,
  type Margins
} from "../utils/styleCalculator";
import {
  registerEnhancedNodeView,
  unregisterEnhancedNodeView,
  type EnhancedHeaderFooterNodeView
} from "../utils/nodeViewManager";

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
      console.log('render page footer with enhanced features');

      // 创建页脚容器
      const pageFooter = document.createElement("div");
      pageFooter.classList.add("tiptap-page-footer");

      // 获取初始位置，用于注册NodeView实例
      const initialPos = typeof getPos === 'function' ? getPos() : undefined;
      
      // 标准化选项
      const normalizedOptions = normalizeHeaderFooterOptions('footer', this.options);
      
      // 应用样式的函数
      const applyStyles = (margins: Margins) => {
        console.log('applying footer styles with margins:', margins);
        
        // 使用样式计算工具计算样式
        const styles = calculateFooterStyles(margins, normalizedOptions);
        
        // 应用样式到DOM元素
        applyStylesToElement(pageFooter, styles);
      };
      
      // 获取页面边距信息并初始化样式
      const margins = getPageMargins(editor, getPos);
      console.log('render page footer margins', margins);
      applyStyles(margins);

      // 创建增强版NodeView实例对象
      const enhancedNodeViewInstance: EnhancedHeaderFooterNodeView = {
        isDestroyed: false,
        nodeType: 'pageFooter',
        position: initialPos || 0,
        dom: pageFooter,
        updateStyles: (newMargins: Margins) => {
          if (enhancedNodeViewInstance.isDestroyed) return;
          console.log('updating footer styles with new margins:', newMargins);
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
        dom: pageFooter
      };
      
      // 同时注册到两个注册表以保持兼容性
      if (typeof initialPos === 'number') {
        registerNodeView(editor, 'pageFooter', initialPos, nodeViewInstance);
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
        
        // 实现update方法响应属性变化
        update: (updatedNode: ProseMirrorNode) => {
          if (updatedNode.type.name !== node.type.name) {
            return false;
          }
          
          // 检查父页面节点的边距是否发生变化
          const currentMargins = getPageMargins(editor, getPos);
          console.log('Footer NodeView update called with margins:', currentMargins);
          
          // 应用新样式
          enhancedNodeViewInstance.updateStyles(currentMargins);
          
          return true;
        },
        
        destroy: () => {
          // TipTap调用此方法时，手动清理
          enhancedNodeViewInstance.destroy();
          if (typeof initialPos === 'number') {
            unregisterNodeView(editor, 'pageFooter', initialPos);
            unregisterEnhancedNodeView(editor, 'pageFooter', initialPos);
          }
        }
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
