import type { Editor } from "@tiptap/core";
import { findPageNode } from "./findPageNode";

/**
 * 获取页面节点的边距信息
 * @param editor - Tiptap 编辑器实例
 * @param getPos - 获取当前位置的函数
 * @returns 页面边距对象，包含 top, right, bottom, left 属性
 */
export const getPageMargins = (
  editor: Editor,
  getPos: () => number | undefined
): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} => {
  // 查找父页面节点
  const pageInfo = findPageNode(editor.view, getPos);
  
  if (pageInfo?.node.attrs.margins) {
    return pageInfo.node.attrs.margins;
  }
  
  // 返回默认边距值
  return {
    top: '20mm',
    right: '20mm',
    bottom: '20mm',
    left: '20mm'
  };
};