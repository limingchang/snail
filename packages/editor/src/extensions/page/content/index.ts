import { Node, mergeAttributes } from "@tiptap/core";

export const HeaderFooterBlock = Node.create({
  name: "headerFooterBlock",
  group: "block",
  content: "inline*",
  defining: true,

  addNodeView() {
    return ({ editor, node, getPos }) => {
      // 创建右侧页眉
      const dom = document.createElement("div");
      // dom.classList.add("block");
      dom.style.textAlign = node.attrs.textAlign
      // dom.style.flex = "1";
      // dom.style.textAlign = "right";
      return {
        dom,
        contentDOM: dom,
        // 添加选择处理
        selectNode: () => {
          dom.classList.add('ProseMirror-selectednode');
        },
        
        deselectNode: () => {
          dom.classList.remove('ProseMirror-selectednode');
        },
      };
    };
  },

  parseHTML() {
    return [
      {
        tag: "header-footer-block",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["header-footer-block", mergeAttributes(HTMLAttributes)];
  },
});


/**
 * 验证内容位置，确保所有内容都在正确的容器内
 */
function validateContentPosition(container: HTMLElement, contentArea: HTMLElement): void {
  // 检查内容是否正确位于contentArea内
  const allContent = container.querySelectorAll('*');
  allContent.forEach(element => {
    if (!contentArea.contains(element) && element !== contentArea) {
      // 重新定位溢出内容
      console.warn('发现内容溢出，正在重新定位到正确位置');
      contentArea.appendChild(element);
    }
  });
}

export const PageContent = Node.create({
  name: "pageContent",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true, // 添加isolating属性，防止内容逃逸

  addNodeView() {
    return ({ editor, node, getPos }) => {
      // 创建外层容器
      const container = document.createElement("div");
      container.classList.add("tiptap-page-content-wrapper");
      
      // 创建内容容器
      const contentArea = document.createElement("div");
      contentArea.classList.add("tiptap-page-content");
      
      // 设置容器约束样式
      container.style.position = "relative";
      container.style.width = "100%";
      // container.style.margin = "20mm";
      container.style.overflow = "hidden";
      
      contentArea.style.position = "relative";
      contentArea.style.overflow = "hidden";
      contentArea.style.width = "100%";
      contentArea.style.boxSizing = "border-box";
      contentArea.style.overflowWrap = "break-word";
      contentArea.style.wordWrap = "break-word";
      
      // 在设计模式下添加边框提示
      // if (editor.isEditable) {
      //   container.style.border = "1px dashed #d9d9d9";
      //   container.style.borderRadius = "4px";
      // }
      
      container.appendChild(contentArea);
      
      // 添加内容变化监听
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            // 检查是否有内容溢出到容器外
            validateContentPosition(container, contentArea);
          }
        });
      });
      
      observer.observe(container, {
        childList: true,
        subtree: true
      });
      
      return {
        dom: container,           // 外层容器
        contentDOM: contentArea,  // 内容渲染区域
        
        // 添加更新钩子
        update: (node) => {
          // 每次节点更新时验证内容位置
          validateContentPosition(container, contentArea);
          return true;
        },
        
        // 添加选择处理
        selectNode: () => {
          container.classList.add('ProseMirror-selectednode');
        },
        
        deselectNode: () => {
          container.classList.remove('ProseMirror-selectednode');
        },
        
        // 清理资源
        destroy: () => {
          observer.disconnect();
        }
      };
    };
  },
  
  // 添加键盘事件处理
  addKeyboardShortcuts() {
    return {
      'Enter': ({ editor }) => {
        // 确保回车创建的新段落在PageContent内
        const { state } = editor;
        const { from } = state.selection;
        const node = state.doc.nodeAt(from);
        
        if (node && node.type.name === 'pageContent') {
          return false; // 使用默认行为，但确保在正确位置
        }
        return false;
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "page-content",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["page-content", mergeAttributes(HTMLAttributes)];
  },
});
