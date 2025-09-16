/**
 * 页眉页脚样式计算工具
 * 提供统一的样式计算功能，确保样式计算的一致性
 */

// export interface Margins {
//   top: string;
//   right: string;
//   bottom: string;
//   left: string;
// }
import { Margins } from "../typing/index";

export interface HeaderFooterOptions {
  height: number;
  headerLine?: boolean;
  footerLine?: boolean;
}

export interface HeaderFooterStyles {
  position: string;
  top?: string;
  bottom?: string;
  left: string;
  width: string;
  height: string;
  lineHeight: string;
  display: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  justifyContent: string;
  alignItems: string;
  border: string;
  borderBottom?: string;
  borderTop?: string;
}

/**
 * 计算页眉样式
 * @param margins 页面边距
 * @param options 页眉选项
 * @returns 页眉样式对象
 */
export const calculateHeaderStyles = (attrs: {
  [attr: string]: any;
}): Partial<CSSStyleDeclaration> => {
  const  margins  = attrs.pageMargins;
  const baseStyles: Partial<CSSStyleDeclaration> = {
    position: "absolute",
    left: typeof margins.left === "string" ? margins.left : `${margins.left}px`,
    width: `calc(100% - ${margins.left} - ${margins.right})`,
    height: `${attrs.height}px`,
    lineHeight: `${attrs.height}px`,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: `${attrs.height}px`,
    justifyContent: "center",
    alignItems: "center",
    border: "1px solid #fff",
    top:
      typeof margins.top === "string"
        ? `calc(${margins.top} - ${attrs.height}px - 2px)`
        : `calc(${margins.top}px - ${attrs.height}px - 2px)`,
  };

  if (attrs.headerLine) {
    baseStyles.borderBottom = "1px solid #000";
  }

  return baseStyles;
};

/**
 * 计算页脚样式
 * @param margins 页面边距
 * @param options 页脚选项
 * @returns 页脚样式对象
 */
export const calculateFooterStyles = (
  margins: Margins,
  options: HeaderFooterOptions
): HeaderFooterStyles => {
  const baseStyles: HeaderFooterStyles = {
    position: "absolute",
    left: typeof margins.left === "string" ? margins.left : `${margins.left}px`,
    width: `calc(100% - ${margins.left} - ${margins.right} - 2px)`,
    height: `${options.height}px`,
    lineHeight: `${options.height}px`,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: `${options.height}px`,
    justifyContent: "center",
    alignItems: "center",
    border: "1px solid #fff",
    bottom:
      typeof margins.bottom === "string"
        ? `calc(${margins.bottom} - ${options.height}px - 2px)`
        : `calc(${margins.bottom}px - ${options.height}px - 2px)`,
  };

  if (options.footerLine) {
    baseStyles.borderTop = "1px solid #000";
  }

  return baseStyles;
};

/**
 * 应用样式到DOM元素
 * @param element 目标DOM元素
 * @param styles 样式对象
 */
export const applyStylesToElement = (
  element: HTMLElement,
  styles: Partial<HeaderFooterStyles>
): void => {
  Object.entries(styles).forEach(([property, value]) => {
    if (value !== undefined) {
      // 将camelCase转换为kebab-case
      const cssProperty = property.replace(
        /[A-Z]/g,
        (letter) => `-${letter.toLowerCase()}`
      );
      element.style.setProperty(cssProperty, value);
    }
  });
};

/**
 * 获取页眉页脚类型的标准化选项
 * @param type 节点类型 ('header' | 'footer')
 * @param options 原始选项
 * @returns 标准化的选项对象
 */
export const normalizeHeaderFooterOptions = (
  type: "header" | "footer",
  options: any
): HeaderFooterOptions => {
  return {
    height: options.height || 50,
    headerLine: type === "header" ? options.headerLine || false : undefined,
    footerLine: type === "footer" ? options.footerLine || false : undefined,
  };
};

/**
 * 检查边距是否有变化
 * @param oldMargins 旧边距
 * @param newMargins 新边距
 * @returns 是否有变化
 */
export const hasMarginsChanged = (
  oldMargins: Margins,
  newMargins: Margins
): boolean => {
  return (
    oldMargins.top !== newMargins.top ||
    oldMargins.right !== newMargins.right ||
    oldMargins.bottom !== newMargins.bottom ||
    oldMargins.left !== newMargins.left
  );
};

const isValidMarginValue = (value: string | number): boolean => {
  if (typeof value === "number") return true;
  const validUnits = /^(\d+(\.\d+)?)(mm|cm|in|px|pt)$/;
  return validUnits.test(value);
};

/**
 * 验证边距值的合法性
 * @param margins 边距对象
 * @returns 是否合法
 */
export const validateMargins = (margins: Margins): boolean => {
  return (
    isValidMarginValue(margins.top) &&
    isValidMarginValue(margins.right) &&
    isValidMarginValue(margins.bottom) &&
    isValidMarginValue(margins.left)
  );
};
