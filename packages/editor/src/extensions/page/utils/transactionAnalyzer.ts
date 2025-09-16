/**
 * ProseMirror事务分析工具
 * 用于分析ProseMirror事务中的页面属性变化，检测页面边距更新
 */

import type { Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Margins } from "./styleCalculator";

export interface PageAttributeChange {
  /** 页面节点在文档中的位置 */
  pagePos: number;
  /** 页面节点的大小 */
  pageSize: number;
  /** 更新前的边距 */
  oldMargins: Margins;
  /** 更新后的边距 */
  newMargins: Margins;
}

/**
 * 检测ProseMirror事务中的页面属性变化
 * @param transaction ProseMirror事务
 * @returns 页面属性变化数组
 */
export const detectPageAttributeChanges = (
  transaction: Transaction
): PageAttributeChange[] => {
  const changes: PageAttributeChange[] = [];
  
  // 检查是否有文档变化
  if (!transaction.docChanged) {
    return changes;
  }
  
  // 简化的检测逻辑：检查所有步骤是否涉及页面节点属性变化
  try {
    transaction.steps.forEach((step, stepIndex) => {
      const stepJson = step.toJSON();
      
      // 检查是否是属性变化
      if (stepJson.stepType === 'replace' || stepJson.stepType === 'replaceAround') {
        // 查找可能涉及的页面节点
        const from = stepJson.from || 0;
        const to = stepJson.to || from;
        
        // 在变化前的文档中查找页面节点
        transaction.before.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === 'page' && node.attrs.margins) {
            // 获取变化后的对应节点
            try {
              const mapping = transaction.mapping.slice(0, stepIndex + 1);
              const newPos = mapping.map(pos);
              const afterNode = transaction.doc.nodeAt(newPos);
              
              if (afterNode && afterNode.type.name === 'page' && afterNode.attrs.margins) {
                // 检查边距是否真的发生了变化
                if (hasMarginsChanged(node.attrs.margins, afterNode.attrs.margins)) {
                  changes.push({
                    pagePos: newPos,
                    pageSize: afterNode.nodeSize,
                    oldMargins: node.attrs.margins,
                    newMargins: afterNode.attrs.margins
                  });
                }
              }
            } catch (error) {
              console.warn('Error mapping page position:', error);
            }
          }
        });
      }
    });
  } catch (error) {
    console.warn('Error analyzing transaction:', error);
  }
  
  // 去重处理
  return deduplicatePageChanges(changes);
};

/**
 * 检查边距是否发生变化
 * @param oldMargins 旧边距
 * @param newMargins 新边距
 * @returns 是否有变化
 */
function hasMarginsChanged(oldMargins: Margins, newMargins: Margins): boolean {
  return (
    oldMargins.top !== newMargins.top ||
    oldMargins.right !== newMargins.right ||
    oldMargins.bottom !== newMargins.bottom ||
    oldMargins.left !== newMargins.left
  );
}

/**
 * 去除重复的页面变化
 * @param changes 变化数组
 * @returns 去重后的变化数组
 */
function deduplicatePageChanges(
  changes: PageAttributeChange[]
): PageAttributeChange[] {
  const seen = new Set<number>();
  return changes.filter(change => {
    if (seen.has(change.pagePos)) {
      return false;
    }
    seen.add(change.pagePos);
    return true;
  });
}

/**
 * 检查事务是否包含页面边距变化
 * @param transaction ProseMirror事务
 * @returns 是否包含页面边距变化
 */
export const hasPageMarginChanges = (transaction: Transaction): boolean => {
  const changes = detectPageAttributeChanges(transaction);
  return changes.length > 0;
};

/**
 * 获取事务中所有受影响的页面位置
 * @param transaction ProseMirror事务
 * @returns 页面位置数组
 */
export const getAffectedPagePositions = (transaction: Transaction): number[] => {
  const changes = detectPageAttributeChanges(transaction);
  return changes.map(change => change.pagePos);
};

/**
 * 分析事务中的页面边距变化详情
 * @param transaction ProseMirror事务
 * @returns 详细的变化分析
 */
export const analyzePageMarginChanges = (
  transaction: Transaction
): {
  hasChanges: boolean;
  affectedPages: number;
  changes: PageAttributeChange[];
} => {
  const changes = detectPageAttributeChanges(transaction);
  
  return {
    hasChanges: changes.length > 0,
    affectedPages: changes.length,
    changes
  };
};