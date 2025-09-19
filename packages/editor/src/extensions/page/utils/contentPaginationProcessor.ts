import type { Editor } from "@tiptap/core";
import type { Node, Schema } from "prosemirror-model";

/**
 * 内容分割分析结果
 */
export interface ContentSplit {
  keepContent: Node[];
  moveContent: Node[];
  splitPoint: number;
}

/**
 * 分割点分析结果
 */
export interface SplitAnalysis {
  canSplit: boolean;
  splitIndex: number;
  splitElement?: HTMLElement;
  accumulatedHeight: number;
  remainingHeight: number;
}

/**
 * 内容包装器接口
 */
export interface ContentWrapper {
  // 将溢出内容包装为段落
  wrapInParagraph(schema: Schema, content: string): Node;
  
  // 将节点内容包装为文本节点
  wrapInTextNode(schema: Schema, text: string): Node;
  
  // 创建完整的段落结构
  createParagraphStructure(schema: Schema, content: Node[]): Node;
  
  // 包装空段落
  createEmptyParagraph(schema: Schema): Node;
}

/**
 * 内容分页处理器
 * 负责智能分析内容分页点，按段落分割内容，并创建新页面
 */
export class ContentPaginationProcessor implements ContentWrapper {
  
  /**
   * 分析内容分页点
   */
  analyzeContentSplitPoint(
    contentElement: HTMLElement,
    maxHeight: number
  ): SplitAnalysis {
    const children = Array.from(contentElement.children);
    let accumulatedHeight = 0;
    let splitIndex = -1;

    // 找到最佳分页位置
    for (let i = 0; i < children.length; i++) {
      const childElement = children[i] as HTMLElement;
      const childHeight = childElement.offsetHeight;
      
      // 检查添加这个元素后是否会超出容器
      if (accumulatedHeight + childHeight > maxHeight) {
        // 如果是第一个元素就超出，强制分页
        splitIndex = Math.max(0, i - 1);
        break;
      }
      
      accumulatedHeight += childHeight;
    }

    return {
      canSplit: splitIndex >= 0,
      splitIndex: Math.max(0, splitIndex),
      splitElement: splitIndex >= 0 ? children[splitIndex] as HTMLElement : undefined,
      accumulatedHeight,
      remainingHeight: maxHeight - accumulatedHeight
    };
  }

  /**
   * 按段落分割内容
   */
  splitContentByParagraph(
    editor: Editor,
    paperPos: number,
    splitIndex: number
  ): ContentSplit {
    const keepContent: Node[] = [];
    const moveContent: Node[] = [];
    
    const paper = editor.state.doc.nodeAt(paperPos);
    
    if (!paper) {
      return { keepContent, moveContent, splitPoint: 0 };
    }

    // 按照 splitIndex 分割内容
    paper.content.forEach((child, index) => {
      if (index < splitIndex) {
        keepContent.push(child);
      } else {
        moveContent.push(child);
      }
    });

    // 如果移动的内容为空，创建一个空段落
    if (moveContent.length === 0) {
      const emptyParagraph = this.createEmptyParagraph(editor.schema);
      moveContent.push(emptyParagraph);
    }

    return {
      keepContent,
      moveContent,
      splitPoint: splitIndex
    };
  }

  /**
   * 创建新页面并迁移内容
   */
  createPageWithMigratedContent(
    editor: Editor,
    content: Node[],
    insertPos: number
  ): boolean {
    try {
      const schema = editor.schema;
      const pageExtension = editor.extensionManager.extensions.find(ext => ext.name === 'page');
      
      // 获取现有页面数量以确定新页面索引
      const paperNodes = editor.$nodes("paper");
      const newPageIndex = (paperNodes?.length || 0) + 1;
      
      // 创建新页面属性
      const paperAttrs = {
        index: newPageIndex,
        paperFormat: "A4",
        orientation: "portrait",
        margins: {
          top: "20mm",
          right: "20mm", 
          bottom: "20mm",
          left: "20mm"
        },
        header: pageExtension?.options.header,
        footer: pageExtension?.options.footer
      };

      // 确保内容非空
      const finalContent = content.length > 0 ? content : [this.createEmptyParagraph(schema)];
      
      // 创建 paper 节点
      const paperType = schema.nodes.paper;
      if (!paperType) {
        console.error("Paper 节点类型不存在");
        return false;
      }

      const newPaper = paperType.create(paperAttrs, finalContent);
      
      // 使用事务插入新页面
      const tr = editor.state.tr;
      tr.insert(insertPos, newPaper);
      editor.view.dispatch(tr);
      
      return true;
    } catch (error) {
      console.error("创建页面时出错:", error);
      return false;
    }
  }

  /**
   * 将溢出内容包装为段落
   */
  wrapInParagraph(schema: Schema, content: string): Node {
    const paragraphType = schema.nodes.paragraph;
    const textType = schema.nodes.text;
    
    if (!paragraphType || !textType) {
      throw new Error("段落或文本节点类型不存在");
    }

    const textNode = textType.create(undefined, undefined, [schema.text(content)]);
    return paragraphType.create(undefined, [textNode]);
  }

  /**
   * 将节点内容包装为文本节点
   */
  wrapInTextNode(schema: Schema, text: string): Node {
    const textType = schema.nodes.text;
    
    if (!textType) {
      throw new Error("文本节点类型不存在");
    }

    return textType.create(undefined, undefined, [schema.text(text)]);
  }

  /**
   * 创建完整的段落结构
   */
  createParagraphStructure(schema: Schema, content: Node[]): Node {
    const paragraphType = schema.nodes.paragraph;
    
    if (!paragraphType) {
      throw new Error("段落节点类型不存在");
    }

    return paragraphType.create(undefined, content);
  }

  /**
   * 创建空段落
   */
  createEmptyParagraph(schema: Schema): Node {
    const paragraphType = schema.nodes.paragraph;
    
    if (!paragraphType) {
      throw new Error("段落节点类型不存在");
    }

    return paragraphType.create();
  }

  /**
   * 智能包装溢出内容
   * 根据内容类型选择合适的包装方式
   */
  wrapOverflowContent(schema: Schema, content: Node[]): Node[] {
    const wrappedContent: Node[] = [];

    content.forEach(node => {
      // 如果已经是段落或标题，直接添加
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        wrappedContent.push(node);
      } 
      // 如果是文本节点，包装为段落
      else if (node.type.name === 'text') {
        const paragraph = this.createParagraphStructure(schema, [node]);
        wrappedContent.push(paragraph);
      }
      // 其他类型的节点，尝试包装为段落
      else {
        try {
          const paragraph = this.createParagraphStructure(schema, [node]);
          wrappedContent.push(paragraph);
        } catch (error) {
          console.warn("无法包装节点:", node.type.name, error);
          // 如果包装失败，创建空段落
          wrappedContent.push(this.createEmptyParagraph(schema));
        }
      }
    });

    // 如果没有任何内容，至少返回一个空段落
    if (wrappedContent.length === 0) {
      wrappedContent.push(this.createEmptyParagraph(schema));
    }

    return wrappedContent;
  }

  /**
   * 验证内容完整性
   */
  validateContentIntegrity(originalContent: Node[], splitContent: ContentSplit): boolean {
    const totalOriginal = originalContent.length;
    const totalSplit = splitContent.keepContent.length + splitContent.moveContent.length;
    
    return totalOriginal === totalSplit;
  }

  /**
   * 计算内容高度
   */
  calculateContentHeight(elements: HTMLElement[]): number {
    return elements.reduce((total, element) => total + element.offsetHeight, 0);
  }

  /**
   * 查找最佳分页位置
   * 优先在段落边界分页，避免分割段落内容
   */
  findOptimalSplitPoint(
    contentElement: HTMLElement,
    maxHeight: number
  ): { index: number; isParagraphBoundary: boolean } {
    const children = Array.from(contentElement.children);
    let accumulatedHeight = 0;
    let bestSplitIndex = 0;
    let isParagraphBoundary = true;

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const childHeight = child.offsetHeight;
      
      // 检查这个元素是否是段落
      const isParagraph = child.tagName.toLowerCase() === 'p' || 
                         child.classList.contains('paragraph') ||
                         child.getAttribute('data-type') === 'paragraph';
      
      if (accumulatedHeight + childHeight > maxHeight) {
        // 如果当前位置超出高度限制
        if (i > 0 && isParagraph) {
          // 如果前一个元素是段落边界，在这里分割
          bestSplitIndex = i;
          isParagraphBoundary = true;
        } else {
          // 否则在前一个位置分割
          bestSplitIndex = Math.max(0, i - 1);
          isParagraphBoundary = false;
        }
        break;
      }
      
      accumulatedHeight += childHeight;
    }

    return { index: bestSplitIndex, isParagraphBoundary };
  }
}