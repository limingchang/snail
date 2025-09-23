import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { paperSizeCalculator } from "./calculator";
import { defaultMargins } from "../constant/defaultMargins";
import type { PaperFormat, PaperOrientation, Margins } from "../typing/public";

/**
 * 页面高度计算结果接口
 */
export interface PageHeightCalculation {
  totalHeight: number;        // 总页面高度(mm)
  headerHeight: number;       // 页眉高度(mm)
  footerHeight: number;       // 页脚高度(mm)
  contentHeight: number;      // 可用内容高度(mm)
  marginTop: number;          // 上边距(mm)
  marginBottom: number;       // 下边距(mm)
  marginLeft: number;         // 左边距(mm)
  marginRight: number;        // 右边距(mm)
}

/**
 * 页面高度计算器类
 * 负责计算页面各部分的高度约束
 */
export class PageHeightCalculator {
  private editor: Editor;
  private pixelToMmRatio: number;

  constructor(editor: Editor) {
    this.editor = editor;
    // 标准DPI下，1mm ≈ 3.78 pixels (96DPI)
    this.pixelToMmRatio = 96 / 25.4;
  }

  /**
   * 计算指定页面节点的高度信息
   * @param pageNode 页面节点
   * @param pagePos 页面节点位置
   * @returns 页面高度计算结果
   */
  calculatePageHeight(pageNode: ProseMirrorNode, pagePos: number): PageHeightCalculation {
    // 获取页面属性
    const paperFormat = pageNode.attrs.paperFormat || "A4";
    const orientation = pageNode.attrs.orientation || "portrait";
    const margins = pageNode.attrs.margins || defaultMargins;

    // 计算纸张尺寸
    const { width, height } = paperSizeCalculator(paperFormat, orientation);

    // 转换边距为数值(mm)
    const marginTop = this.parseMarginValue(margins.top);
    const marginBottom = this.parseMarginValue(margins.bottom);
    const marginLeft = this.parseMarginValue(margins.left);
    const marginRight = this.parseMarginValue(margins.right);

    // 获取页眉页脚高度
    const headerHeight = this.getHeaderHeight(pageNode);
    const footerHeight = this.getFooterHeight(pageNode);

    // 计算可用内容高度
    const contentHeight = height - marginTop - marginBottom - headerHeight - footerHeight;

    return {
      totalHeight: height,
      headerHeight,
      footerHeight,
      contentHeight,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight
    };
  }

  /**
   * 获取当前页面内容的实际高度
   * @param pageContentNode PageContent节点
   * @param pageContentPos PageContent节点位置
   * @returns 内容实际高度(px)
   */
  getContentActualHeight(pageContentNode: ProseMirrorNode, pageContentPos: number): number {
    // 尝试获取DOM元素
    const domNode = this.findDOMNodeByPos(pageContentPos);
    if (domNode && domNode instanceof HTMLElement) {
      return domNode.scrollHeight;
    }

    // 如果无法获取DOM，使用估算方法
    return this.estimateContentHeight(pageContentNode);
  }

  /**
   * 检查内容是否溢出页面限制
   * @param pageNode 页面节点
   * @param pagePos 页面节点位置
   * @param pageContentNode PageContent节点
   * @param pageContentPos PageContent节点位置
   * @returns 溢出信息 { isOverflowing: boolean, overflowHeight: number }
   */
  checkContentOverflow(
    pageNode: ProseMirrorNode, 
    pagePos: number,
    pageContentNode: ProseMirrorNode, 
    pageContentPos: number
  ): { isOverflowing: boolean; overflowHeight: number } {
    const heightCalc = this.calculatePageHeight(pageNode, pagePos);
    const actualHeight = this.getContentActualHeight(pageContentNode, pageContentPos);
    
    // 转换内容高度限制为像素
    const maxHeightPx = heightCalc.contentHeight * this.pixelToMmRatio;
    
    const isOverflowing = actualHeight > maxHeightPx;
    const overflowHeight = isOverflowing ? actualHeight - maxHeightPx : 0;

    return { isOverflowing, overflowHeight };
  }

  /**
   * 计算内容应该截断的位置
   * @param pageContentNode PageContent节点
   * @param pageContentPos PageContent节点位置
   * @param maxHeight 最大允许高度(px)
   * @returns 截断位置信息
   */
  calculateTruncationPosition(
    pageContentNode: ProseMirrorNode, 
    pageContentPos: number, 
    maxHeight: number
  ): { pos: number; height: number } | null {
    const domNode = this.findDOMNodeByPos(pageContentPos);
    if (!domNode || !(domNode instanceof HTMLElement)) {
      return null;
    }

    return this.findTruncationPositionInDOM(domNode, maxHeight);
  }

  /**
   * 解析边距值为数值(mm)
   * @param marginValue 边距值（可能是字符串或数字）
   * @returns 边距数值(mm)
   */
  private parseMarginValue(marginValue: string | number): number {
    if (typeof marginValue === "number") {
      return marginValue;
    }

    if (typeof marginValue === "string") {
      // 移除单位并转换为数字
      const numericValue = parseFloat(marginValue.replace(/[^\d.]/g, ""));
      
      if (marginValue.includes("mm")) {
        return numericValue;
      } else if (marginValue.includes("px")) {
        return numericValue / this.pixelToMmRatio;
      } else if (marginValue.includes("pt")) {
        return numericValue * 0.352778; // 1pt = 0.352778mm
      } else if (marginValue.includes("in")) {
        return numericValue * 25.4; // 1in = 25.4mm
      }
      
      // 默认为mm
      return numericValue;
    }

    return 20; // 默认20mm
  }

  /**
   * 获取页眉高度
   * @param pageNode 页面节点
   * @returns 页眉高度(mm)
   */
  private getHeaderHeight(pageNode: ProseMirrorNode): number {
    // 查找页眉子节点
    let headerHeight = 0;
    pageNode.content.forEach(child => {
      if (child.type.name === "pageHeader") {
        // 从配置或属性中获取高度，默认15mm
        headerHeight = child.attrs.height || 15;
      }
    });
    return headerHeight;
  }

  /**
   * 获取页脚高度
   * @param pageNode 页面节点
   * @returns 页脚高度(mm)
   */
  private getFooterHeight(pageNode: ProseMirrorNode): number {
    // 查找页脚子节点
    let footerHeight = 0;
    pageNode.content.forEach(child => {
      if (child.type.name === "pageFooter") {
        // 从配置或属性中获取高度，默认15mm
        footerHeight = child.attrs.height || 15;
      }
    });
    return footerHeight;
  }

  /**
   * 根据位置查找对应的DOM节点
   * @param pos 文档位置
   * @returns DOM节点或null
   */
  private findDOMNodeByPos(pos: number): Node | null {
    try {
      const view = this.editor.view;
      const domPos = view.domAtPos(pos);
      return domPos.node;
    } catch (error) {
      console.warn("Failed to find DOM node at position:", pos, error);
      return null;
    }
  }

  /**
   * 估算内容高度（当无法获取DOM时的备用方法）
   * @param pageContentNode PageContent节点
   * @returns 估算高度(px)
   */
  private estimateContentHeight(pageContentNode: ProseMirrorNode): number {
    let estimatedHeight = 0;
    
    pageContentNode.content.forEach(child => {
      // 根据节点类型估算高度
      switch (child.type.name) {
        case "paragraph":
          estimatedHeight += 20; // 假设每个段落20px
          break;
        case "heading":
          const level = child.attrs.level || 1;
          estimatedHeight += 30 - (level * 2); // 标题高度根据级别调整
          break;
        case "blockquote":
          estimatedHeight += 25;
          break;
        case "codeBlock":
          estimatedHeight += 18 * (child.textContent.split('\n').length || 1);
          break;
        case "table":
          estimatedHeight += 100; // 表格预估高度
          break;
        default:
          estimatedHeight += 20; // 默认高度
      }
    });

    return estimatedHeight;
  }

  /**
   * 在DOM中查找截断位置
   * @param domNode DOM节点
   * @param maxHeight 最大高度
   * @returns 截断位置信息
   */
  private findTruncationPositionInDOM(
    domNode: HTMLElement, 
    maxHeight: number
  ): { pos: number; height: number } | null {
    const children = Array.from(domNode.children);
    let currentHeight = 0;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const childHeight = child.offsetHeight;
      
      if (currentHeight + childHeight > maxHeight) {
        // 找到溢出的位置
        return {
          pos: i,
          height: currentHeight
        };
      }
      
      currentHeight += childHeight;
    }

    return null;
  }
}

/**
 * 创建页面高度计算器实例
 * @param editor TipTap编辑器实例
 * @returns 页面高度计算器
 */
export function createPageHeightCalculator(editor: Editor): PageHeightCalculator {
  return new PageHeightCalculator(editor);
}