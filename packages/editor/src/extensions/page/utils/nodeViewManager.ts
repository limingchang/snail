/**
 * 高级NodeView管理器
 * 提供批量更新、性能优化和生命周期管理功能
 */

import type { Editor } from "@tiptap/core";
import type { Margins } from "./styleCalculator";

export interface StyleUpdate {
  /** 更新标识符 */
  id: string;
  /** 执行更新的函数 */
  execute: () => void;
  /** 更新优先级 */
  priority?: number;
}

export interface EnhancedHeaderFooterNodeView {
  /** 销毁状态标志 */
  isDestroyed: boolean;
  /** 更新样式方法 */
  updateStyles(margins: Margins): void;
  /** 销毁方法 */
  destroy(): void;
  /** DOM元素引用 */
  dom: HTMLElement;
  /** 节点类型 */
  nodeType: string;
  /** 节点位置 */
  position: number;
  /** 最后更新时间戳 */
  lastUpdated?: number;
}

/**
 * NodeView管理器类
 * 负责管理所有页眉页脚NodeView的注册、更新和销毁
 */
export class NodeViewManager {
  private updateQueue: Map<string, StyleUpdate> = new Map();
  private pendingUpdates: Set<string> = new Set();
  private updateScheduled: boolean = false;
  
  constructor() {
    // 绑定方法以确保正确的this上下文
    this.flushUpdates = this.flushUpdates.bind(this);
  }
  
  /**
   * 批量更新NodeView样式
   * @param updates 样式更新数组
   */
  public batchUpdateStyles(updates: StyleUpdate[]): void {
    // 去重并添加到更新队列
    updates.forEach(update => {
      this.updateQueue.set(update.id, update);
      this.pendingUpdates.add(update.id);
    });
    
    // 调度更新执行
    this.scheduleUpdateFlush();
  }
  
  /**
   * 注册延迟更新
   * @param nodeId 节点ID
   * @param updateFn 更新函数
   * @param priority 优先级
   */
  public scheduleUpdate(
    nodeId: string,
    updateFn: () => void,
    priority: number = 0
  ): void {
    const update: StyleUpdate = {
      id: nodeId,
      execute: updateFn,
      priority
    };
    
    this.updateQueue.set(nodeId, update);
    this.pendingUpdates.add(nodeId);
    this.scheduleUpdateFlush();
  }
  
  /**
   * 调度更新刷新
   */
  private scheduleUpdateFlush(): void {
    if (this.updateScheduled) {
      return;
    }
    
    this.updateScheduled = true;
    
    // 使用requestAnimationFrame确保DOM更新的流畅性
    requestAnimationFrame(() => {
      this.flushUpdates();
      this.updateScheduled = false;
    });
  }
  
  /**
   * 执行所有待处理的更新
   */
  private flushUpdates(): void {
    if (this.pendingUpdates.size === 0) {
      return;
    }
    
    // 获取所有待处理的更新并按优先级排序
    const updates = Array.from(this.pendingUpdates)
      .map(id => this.updateQueue.get(id))
      .filter((update): update is StyleUpdate => update !== undefined)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // 执行更新
    updates.forEach(update => {
      try {
        update.execute();
      } catch (error) {
        console.error(`NodeView样式更新失败 [${update.id}]:`, error);
      }
    });
    
    // 清理已处理的更新
    this.pendingUpdates.clear();
    updates.forEach(update => {
      this.updateQueue.delete(update.id);
    });
  }
  
  /**
   * 取消待处理的更新
   * @param nodeId 节点ID
   */
  public cancelUpdate(nodeId: string): void {
    this.updateQueue.delete(nodeId);
    this.pendingUpdates.delete(nodeId);
  }
  
  /**
   * 清理所有待处理的更新
   */
  public clearAllUpdates(): void {
    this.updateQueue.clear();
    this.pendingUpdates.clear();
  }
  
  /**
   * 检查是否有待处理的更新
   * @returns 是否有待处理更新
   */
  public hasPendingUpdates(): boolean {
    return this.pendingUpdates.size > 0;
  }
  
  /**
   * 获取待处理更新的数量
   * @returns 待处理更新数量
   */
  public getPendingUpdateCount(): number {
    return this.pendingUpdates.size;
  }
}

/**
 * 全局NodeView管理器实例
 */
export const globalNodeViewManager = new NodeViewManager();

/**
 * 增强版的NodeView注册表
 * 使用WeakMap以编辑器实例为键，支持更丰富的功能
 */
const enhancedNodeViewRegistries = new WeakMap<
  Editor,
  Map<string, EnhancedHeaderFooterNodeView>
>();

/**
 * 生成增强版节点唯一标识
 * @param nodeType 节点类型
 * @param position 节点位置
 * @returns 唯一标识
 */
function generateEnhancedNodeKey(nodeType: string, position: number): string {
  return `${nodeType}_${position}`;
}

/**
 * 注册增强版NodeView实例
 * @param editor 编辑器实例
 * @param nodeView NodeView实例
 */
export function registerEnhancedNodeView(
  editor: Editor,
  nodeView: EnhancedHeaderFooterNodeView
): void {
  let registry = enhancedNodeViewRegistries.get(editor);
  if (!registry) {
    registry = new Map();
    enhancedNodeViewRegistries.set(editor, registry);
  }
  
  const key = generateEnhancedNodeKey(nodeView.nodeType, nodeView.position);
  registry.set(key, nodeView);
}

/**
 * 注销增强版NodeView实例
 * @param editor 编辑器实例
 * @param nodeType 节点类型
 * @param position 节点位置
 */
export function unregisterEnhancedNodeView(
  editor: Editor,
  nodeType: string,
  position: number
): void {
  const registry = enhancedNodeViewRegistries.get(editor);
  if (!registry) return;
  
  const key = generateEnhancedNodeKey(nodeType, position);
  const nodeView = registry.get(key);
  
  if (nodeView) {
    // 取消任何待处理的更新
    globalNodeViewManager.cancelUpdate(key);
    // 从注册表中移除
    registry.delete(key);
  }
}

/**
 * 获取增强版NodeView实例
 * @param editor 编辑器实例
 * @param nodeType 节点类型
 * @param position 节点位置
 * @returns NodeView实例或undefined
 */
export function getEnhancedNodeView(
  editor: Editor,
  nodeType: string,
  position: number
): EnhancedHeaderFooterNodeView | undefined {
  const registry = enhancedNodeViewRegistries.get(editor);
  if (!registry) return undefined;
  
  const key = generateEnhancedNodeKey(nodeType, position);
  return registry.get(key);
}

/**
 * 获取指定页面范围内的所有增强版页眉页脚NodeView实例
 * @param editor 编辑器实例
 * @param pagePos 页面节点位置
 * @param pageSize 页面节点大小
 * @returns 页眉页脚NodeView实例数组
 */
export function getPageEnhancedHeaderFooterViews(
  editor: Editor,
  pagePos: number,
  pageSize: number
): EnhancedHeaderFooterNodeView[] {
  const registry = enhancedNodeViewRegistries.get(editor);
  if (!registry) return [];
  
  const views: EnhancedHeaderFooterNodeView[] = [];
  
  for (const nodeView of registry.values()) {
    // 检查是否是页眉或页脚节点，且在当前页面范围内
    if (
      (nodeView.nodeType === 'pageHeader' || nodeView.nodeType === 'pageFooter') &&
      nodeView.position > pagePos &&
      nodeView.position < pagePos + pageSize
    ) {
      views.push(nodeView);
    }
  }
  
  return views;
}

/**
 * 批量更新指定页面的所有页眉页脚样式
 * @param editor 编辑器实例
 * @param pagePos 页面位置
 * @param pageSize 页面大小
 * @param newMargins 新的边距
 */
export function batchUpdatePageHeaderFooterStyles(
  editor: Editor,
  pagePos: number,
  pageSize: number,
  newMargins: Margins
): void {
  const views = getPageEnhancedHeaderFooterViews(editor, pagePos, pageSize);
  
  const updates: StyleUpdate[] = views.map(nodeView => ({
    id: generateEnhancedNodeKey(nodeView.nodeType, nodeView.position),
    execute: () => {
      if (!nodeView.isDestroyed) {
        nodeView.updateStyles(newMargins);
        nodeView.lastUpdated = Date.now();
      }
    },
    priority: 1 // 高优先级
  }));
  
  globalNodeViewManager.batchUpdateStyles(updates);
}

/**
 * 清理编辑器相关的所有增强版NodeView实例
 * @param editor 编辑器实例
 */
export function clearEnhancedEditorNodeViews(editor: Editor): void {
  const registry = enhancedNodeViewRegistries.get(editor);
  if (!registry) return;
  
  // 取消所有待处理的更新
  for (const nodeView of registry.values()) {
    const key = generateEnhancedNodeKey(nodeView.nodeType, nodeView.position);
    globalNodeViewManager.cancelUpdate(key);
    nodeView.destroy();
  }
  
  // 清理注册表
  registry.clear();
  enhancedNodeViewRegistries.delete(editor);
}