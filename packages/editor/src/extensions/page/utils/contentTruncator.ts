import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode, Fragment, Slice } from "@tiptap/pm/model";
import { Transaction } from "@tiptap/pm/state";

/**
 * 内容截断结果接口
 */
export interface ContentTruncationResult {
  remainingContent: Fragment;     // 保留在当前页的内容
  overflowContent: Fragment;      // 需要移到下一页的内容
  truncationPos: number;          // 截断位置
  success: boolean;               // 截断是否成功
}

/**
 * 截断选项接口
 */
export interface TruncationOptions {
  preserveWords: boolean;         // 是否保护单词完整性
  preserveParagraphs: boolean;    // 是否保护段落完整性
  maxHeight: number;              // 最大允许高度(px)
  breakThreshold: number;         // 触发截断的阈值(0-1)
}

/**
 * 虚拟测量结果接口
 */
export interface VirtualMeasurement {
  height: number;                 // 元素高度
  position: number;               // 在文档中的位置
  canBreak: boolean;              // 是否可以在此处截断
}

/**
 * 内容截断器类
 * 负责精确截断内容并保持格式完整性
 */
export class ContentTruncator {
  private editor: Editor;
  private measurementCache: Map<string, VirtualMeasurement>;
  private virtualContainer: HTMLElement | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.measurementCache = new Map();
    this.createVirtualContainer();
  }

  /**
   * 截断页面内容
   * @param pageContentNode PageContent节点
   * @param pageContentPos PageContent节点位置
   * @param options 截断选项
   * @returns 截断结果
   */
  truncateContent(
    pageContentNode: ProseMirrorNode,
    pageContentPos: number,
    options: TruncationOptions
  ): ContentTruncationResult | null {
    try {
      // 测量当前内容高度
      const currentHeight = this.measureNodeHeight(pageContentNode);
      
      if (currentHeight <= options.maxHeight) {
        // 内容未溢出，无需截断
        return null;
      }

      // 查找最佳截断位置
      const truncationPoint = this.findOptimalTruncationPoint(
        pageContentNode,
        options
      );

      if (!truncationPoint) {
        return {
          remainingContent: pageContentNode.content,
          overflowContent: Fragment.empty,
          truncationPos: 0,
          success: false
        };
      }

      // 执行截断
      const { remaining, overflow } = this.executeContentSplit(
        pageContentNode,
        truncationPoint.position
      );

      return {
        remainingContent: remaining,
        overflowContent: overflow,
        truncationPos: truncationPoint.position,
        success: true
      };

    } catch (error) {
      console.error("Content truncation failed:", error);
      return {
        remainingContent: pageContentNode.content,
        overflowContent: Fragment.empty,
        truncationPos: 0,
        success: false
      };
    }
  }

  /**
   * 查找最佳截断点
   * @param pageContentNode PageContent节点
   * @param options 截断选项
   * @returns 截断点信息
   */
  private findOptimalTruncationPoint(
    pageContentNode: ProseMirrorNode,
    options: TruncationOptions
  ): { position: number; height: number } | null {
    const targetHeight = options.maxHeight * options.breakThreshold;
    let bestPosition = 0;
    let bestHeight = 0;
    let currentHeight = 0;

    // 遍历子节点查找合适的截断位置
    for (let i = 0; i < pageContentNode.content.childCount; i++) {
      const child = pageContentNode.content.child(i);
      const childHeight = this.measureNodeHeight(child);

      // 检查是否超过目标高度
      if (currentHeight + childHeight > targetHeight) {
        // 尝试在节点内部查找更精确的截断位置
        const internalBreak = this.findInternalBreakPoint(
          child,
          targetHeight - currentHeight,
          options
        );

        if (internalBreak) {
          return {
            position: bestPosition + internalBreak.position,
            height: currentHeight + internalBreak.height
          };
        }

        // 如果不能在内部截断，检查是否可以在节点边界截断
        if (this.canBreakAtNodeBoundary(child, options)) {
          return {
            position: bestPosition,
            height: currentHeight
          };
        }
      }

      currentHeight += childHeight;
      bestPosition += child.nodeSize;
      bestHeight = currentHeight;
    }

    return null;
  }

  /**
   * 在节点内部查找截断点
   * @param node 要检查的节点
   * @param remainingHeight 剩余可用高度
   * @param options 截断选项
   * @returns 内部截断点或null
   */
  private findInternalBreakPoint(
    node: ProseMirrorNode,
    remainingHeight: number,
    options: TruncationOptions
  ): { position: number; height: number } | null {
    // 只对包含子节点的节点进行内部截断
    if (node.content.childCount === 0) {
      return null;
    }

    // 对于段落节点，尝试字符级截断
    if (node.type.name === "paragraph" && !options.preserveParagraphs) {
      return this.findTextBreakPoint(node, remainingHeight, options);
    }

    // 对于容器节点，递归查找
    let currentHeight = 0;
    let position = 1; // 跳过开始标记

    for (let i = 0; i < node.content.childCount; i++) {
      const child = node.content.child(i);
      const childHeight = this.measureNodeHeight(child);

      if (currentHeight + childHeight > remainingHeight) {
        // 尝试在子节点内部截断
        const childBreak = this.findInternalBreakPoint(
          child,
          remainingHeight - currentHeight,
          options
        );

        if (childBreak) {
          return {
            position: position + childBreak.position,
            height: currentHeight + childBreak.height
          };
        }

        // 在此子节点前截断
        return {
          position: position - 1,
          height: currentHeight
        };
      }

      currentHeight += childHeight;
      position += child.nodeSize;
    }

    return null;
  }

  /**
   * 查找文本截断点
   * @param textNode 文本节点
   * @param remainingHeight 剩余高度
   * @param options 截断选项
   * @returns 文本截断点或null
   */
  private findTextBreakPoint(
    textNode: ProseMirrorNode,
    remainingHeight: number,
    options: TruncationOptions
  ): { position: number; height: number } | null {
    const text = textNode.textContent;
    if (!text) return null;

    // 使用二分查找优化截断位置查找
    let left = 0;
    let right = text.length;
    let bestPosition = 0;
    let bestHeight = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const partialText = text.substring(0, mid);
      const height = this.measureTextHeight(partialText, textNode);

      if (height <= remainingHeight) {
        bestPosition = mid;
        bestHeight = height;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // 如果需要保护单词完整性，调整截断位置
    if (options.preserveWords && bestPosition > 0) {
      bestPosition = this.adjustForWordBoundary(text, bestPosition);
    }

    return bestPosition > 0 ? {
      position: bestPosition + 1, // +1 跳过开始标记
      height: bestHeight
    } : null;
  }

  /**
   * 调整截断位置以保护单词完整性
   * @param text 文本内容
   * @param position 原始截断位置
   * @returns 调整后的位置
   */
  private adjustForWordBoundary(text: string, position: number): number {
    // 如果正好在单词边界，直接返回
    if (position === 0 || position >= text.length || 
        /\s/.test(text[position]) || /\s/.test(text[position - 1])) {
      return position;
    }

    // 向前查找单词边界
    let adjustedPos = position;
    while (adjustedPos > 0 && !/\s/.test(text[adjustedPos - 1])) {
      adjustedPos--;
    }

    // 如果退回太多，使用原位置
    if (position - adjustedPos > 10) {
      return position;
    }

    return adjustedPos;
  }

  /**
   * 检查是否可以在节点边界截断
   * @param node 要检查的节点
   * @param options 截断选项
   * @returns 是否可以截断
   */
  private canBreakAtNodeBoundary(node: ProseMirrorNode, options: TruncationOptions): boolean {
    // 不可分割的节点类型
    const unbreakableTypes = ['table', 'codeBlock', 'image'];
    
    if (unbreakableTypes.includes(node.type.name)) {
      return false;
    }

    // 如果需要保护段落完整性
    if (options.preserveParagraphs && node.type.name === 'paragraph') {
      return false;
    }

    return true;
  }

  /**
   * 执行内容分割
   * @param pageContentNode PageContent节点
   * @param splitPosition 分割位置
   * @returns 分割结果
   */
  private executeContentSplit(
    pageContentNode: ProseMirrorNode,
    splitPosition: number
  ): { remaining: Fragment; overflow: Fragment } {
    const content = pageContentNode.content;
    
    // 在指定位置分割内容
    const slice = content.cut(splitPosition);
    const remaining = content.cut(0, splitPosition);
    
    return {
      remaining,
      overflow: slice
    };
  }

  /**
   * 测量节点高度
   * @param node 要测量的节点
   * @returns 节点高度(px)
   */
  private measureNodeHeight(node: ProseMirrorNode): number {
    const cacheKey = this.getNodeCacheKey(node);
    const cached = this.measurementCache.get(cacheKey);
    
    if (cached) {
      return cached.height;
    }

    const height = this.performVirtualMeasurement(node);
    
    this.measurementCache.set(cacheKey, {
      height,
      position: 0,
      canBreak: true
    });

    return height;
  }

  /**
   * 测量文本高度
   * @param text 文本内容
   * @param contextNode 上下文节点（用于获取样式）
   * @returns 文本高度(px)
   */
  private measureTextHeight(text: string, contextNode: ProseMirrorNode): number {
    if (!this.virtualContainer) {
      return text.length * 1.2; // 简单估算
    }

    // 创建临时文本元素
    const tempElement = document.createElement('span');
    tempElement.textContent = text;
    
    // 复制样式
    this.copyNodeStyles(tempElement, contextNode);
    
    this.virtualContainer.appendChild(tempElement);
    const height = tempElement.offsetHeight;
    this.virtualContainer.removeChild(tempElement);

    return height;
  }

  /**
   * 执行虚拟测量
   * @param node 要测量的节点
   * @returns 节点高度
   */
  private performVirtualMeasurement(node: ProseMirrorNode): number {
    if (!this.virtualContainer) {
      return this.estimateNodeHeight(node);
    }

    try {
      // 创建虚拟DOM节点
      const virtualNode = this.createVirtualNode(node);
      this.virtualContainer.appendChild(virtualNode);
      
      const height = virtualNode.offsetHeight;
      
      this.virtualContainer.removeChild(virtualNode);
      return height;
    } catch (error) {
      console.warn("Virtual measurement failed:", error);
      return this.estimateNodeHeight(node);
    }
  }

  /**
   * 创建虚拟容器用于测量
   */
  private createVirtualContainer(): void {
    this.virtualContainer = document.createElement('div');
    this.virtualContainer.style.position = 'absolute';
    this.virtualContainer.style.top = '-9999px';
    this.virtualContainer.style.left = '-9999px';
    this.virtualContainer.style.width = '210mm'; // A4宽度
    this.virtualContainer.style.visibility = 'hidden';
    this.virtualContainer.style.pointerEvents = 'none';
    
    document.body.appendChild(this.virtualContainer);
  }

  /**
   * 创建虚拟DOM节点
   * @param node ProseMirror节点
   * @returns 虚拟DOM元素
   */
  private createVirtualNode(node: ProseMirrorNode): HTMLElement {
    // 简化的虚拟节点创建
    const element = document.createElement(this.getHTMLTagForNodeType(node.type.name));
    
    if (node.textContent) {
      element.textContent = node.textContent;
    }

    // 递归处理子节点
    node.content.forEach(child => {
      const childElement = this.createVirtualNode(child);
      element.appendChild(childElement);
    });

    return element;
  }

  /**
   * 获取节点类型对应的HTML标签
   * @param nodeType 节点类型名
   * @returns HTML标签名
   */
  private getHTMLTagForNodeType(nodeType: string): string {
    const typeMap: Record<string, string> = {
      paragraph: 'p',
      heading: 'h1',
      blockquote: 'blockquote',
      codeBlock: 'pre',
      table: 'table',
      tableRow: 'tr',
      tableCell: 'td',
      listItem: 'li',
      orderedList: 'ol',
      bulletList: 'ul'
    };

    return typeMap[nodeType] || 'div';
  }

  /**
   * 复制节点样式到DOM元素
   * @param element DOM元素
   * @param node ProseMirror节点
   */
  private copyNodeStyles(element: HTMLElement, node: ProseMirrorNode): void {
    // 这里可以根据节点类型和属性设置相应的CSS样式
    // 简化实现，实际项目中应该更详细
    element.style.fontFamily = 'inherit';
    element.style.fontSize = 'inherit';
    element.style.lineHeight = 'inherit';
  }

  /**
   * 估算节点高度（备用方法）
   * @param node 节点
   * @returns 估算高度
   */
  private estimateNodeHeight(node: ProseMirrorNode): number {
    const typeHeights: Record<string, number> = {
      paragraph: 20,
      heading: 30,
      blockquote: 25,
      codeBlock: 100,
      table: 150,
      listItem: 20
    };

    return typeHeights[node.type.name] || 20;
  }

  /**
   * 获取节点缓存键
   * @param node 节点
   * @returns 缓存键
   */
  private getNodeCacheKey(node: ProseMirrorNode): string {
    return `${node.type.name}_${node.nodeSize}_${node.textContent?.length || 0}`;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.virtualContainer && this.virtualContainer.parentNode) {
      this.virtualContainer.parentNode.removeChild(this.virtualContainer);
    }
    this.measurementCache.clear();
  }
}

/**
 * 创建内容截断器实例
 * @param editor TipTap编辑器实例
 * @returns 内容截断器
 */
export function createContentTruncator(editor: Editor): ContentTruncator {
  return new ContentTruncator(editor);
}