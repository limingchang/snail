/**
 * 样式同步管理器
 * 统一管理页面属性变化和NodeView样式更新的协调
 */

import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import type { Margins } from "./styleCalculator";
import { 
  batchUpdatePageHeaderFooterStyles,
  globalNodeViewManager 
} from "./nodeViewManager";
import { 
  detectPageAttributeChanges,
  hasPageMarginChanges,
  analyzePageMarginChanges 
} from "./transactionAnalyzer";
import {
  debounce,
  BatchProcessor,
  globalFrameScheduler,
  globalPerformanceMonitor,
  createDebouncedStyleUpdate
} from "./performanceUtils";

export interface StyleUpdater {
  updateStyles(margins: Margins): void;
  isDestroyed(): boolean;
}

export interface SyncOptions {
  /** 是否启用批量更新优化 */
  enableBatchUpdate?: boolean;
  /** 更新延迟时间（毫秒） */
  updateDelay?: number;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否启用性能监控 */
  enablePerformanceMonitoring?: boolean;
  /** 是否启用防抖优化 */
  enableDebounce?: boolean;
  /** 防抖延迟时间（毫秒） */
  debounceDelay?: number;
}

/**
 * 样式同步管理器类
 * 负责监听文档变化并协调样式更新
 */
export class StyleSyncManager {
  private options: Required<SyncOptions>;
  private updateTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryCounters: Map<string, number> = new Map();
  private batchProcessor: BatchProcessor<{
    editor: Editor;
    pagePos: number;
    pageSize: number;
    newMargins: Margins;
  }>;
  private debouncedUpdate: (editor: Editor, transaction: Transaction) => void;
  
  constructor(options: SyncOptions = {}) {
    this.options = {
      enableBatchUpdate: options.enableBatchUpdate ?? true,
      updateDelay: options.updateDelay ?? 0,
      enableDebugLog: options.enableDebugLog ?? false,
      maxRetries: options.maxRetries ?? 3,
      enablePerformanceMonitoring: options.enablePerformanceMonitoring ?? true,
      enableDebounce: options.enableDebounce ?? true,
      debounceDelay: options.debounceDelay ?? 16
    };
    
    // 初始化批处理器
    this.batchProcessor = new BatchProcessor(
      (items) => this.processBatchedUpdates(items),
      {
        batchSize: 5,
        delay: 16
      }
    );
    
    // 初始化防抖更新
    if (this.options.enableDebounce) {
      this.debouncedUpdate = createDebouncedStyleUpdate(
        this.handleTransactionImmediate.bind(this),
        this.options.debounceDelay
      );
    } else {
      this.debouncedUpdate = this.handleTransactionImmediate.bind(this);
    }
  }
  
  /**
   * 处理ProseMirror事务变化
   * @param editor 编辑器实例
   * @param transaction ProseMirror事务
   */
  public handleTransaction(editor: Editor, transaction: Transaction): void {
    if (this.options.enableDebounce) {
      this.debouncedUpdate(editor, transaction);
    } else {
      this.handleTransactionImmediate(editor, transaction);
    }
  }
  
  /**
   * 立即处理事务变化（不使用防抖）
   * @param editor 编辑器实例
   * @param transaction ProseMirror事务
   */
  private handleTransactionImmediate(editor: Editor, transaction: Transaction): void {
    if (!hasPageMarginChanges(transaction)) {
      return;
    }
    
    const endMeasurement = this.options.enablePerformanceMonitoring
      ? globalPerformanceMonitor.startMeasurement('styleSync.handleTransaction')
      : () => {};
    
    try {
      if (this.options.enableDebugLog) {
        console.log('StyleSyncManager: Detected page margin changes');
      }
      
      const analysis = analyzePageMarginChanges(transaction);
      
      if (analysis.hasChanges) {
        this.processPageChanges(editor, analysis.changes);
      }
    } finally {
      endMeasurement();
    }
  }
  
  /**
   * 处理页面变化
   * @param editor 编辑器实例
   * @param changes 页面变化数组
   */
  private processPageChanges(
    editor: Editor, 
    changes: Array<{
      pagePos: number;
      pageSize: number;
      oldMargins: Margins;
      newMargins: Margins;
    }>
  ): void {
    if (this.options.enableBatchUpdate) {
      this.processBatchChanges(editor, changes);
    } else {
      this.processSequentialChanges(editor, changes);
    }
  }
  
  /**
   * 批量处理变化
   * @param editor 编辑器实例
   * @param changes 页面变化数组
   */
  private processBatchChanges(
    editor: Editor,
    changes: Array<{
      pagePos: number;
      pageSize: number;
      oldMargins: Margins;
      newMargins: Margins;
    }>
  ): void {
    // 使用批处理器处理更新
    const batchItems = changes.map(change => ({
      editor,
      pagePos: change.pagePos,
      pageSize: change.pageSize,
      newMargins: change.newMargins
    }));
    
    this.batchProcessor.addBatch(batchItems);
  }
  
  /**
   * 处理批量更新
   * @param items 批量更新项目
   */
  private async processBatchedUpdates(
    items: Array<{
      editor: Editor;
      pagePos: number;
      pageSize: number;
      newMargins: Margins;
    }>
  ): Promise<void> {
    const endMeasurement = this.options.enablePerformanceMonitoring
      ? globalPerformanceMonitor.startMeasurement('styleSync.processBatchedUpdates')
      : () => {};
    
    try {
      // 使用帧调度器确保更新在合适的时机进行
      globalFrameScheduler.schedule(() => {
        items.forEach(item => {
          batchUpdatePageHeaderFooterStyles(
            item.editor,
            item.pagePos,
            item.pageSize,
            item.newMargins
          );
        });
      });
      
      if (this.options.enableDebugLog) {
        console.log(`StyleSyncManager: Processed batch of ${items.length} updates`);
      }
    } finally {
      endMeasurement();
    }
  }
  
  /**
   * 顺序处理变化
   * @param editor 编辑器实例
   * @param changes 页面变化数组
   */
  private processSequentialChanges(
    editor: Editor,
    changes: Array<{
      pagePos: number;
      pageSize: number;
      oldMargins: Margins;
      newMargins: Margins;
    }>
  ): void {
    changes.forEach(change => {
      this.schedulePageUpdate(editor, change.pagePos, change.pageSize, change.newMargins);
    });
  }
  
  /**
   * 调度页面更新
   * @param editor 编辑器实例
   * @param pagePos 页面位置
   * @param pageSize 页面大小
   * @param newMargins 新的边距
   * @returns Promise
   */
  private schedulePageUpdate(
    editor: Editor,
    pagePos: number,
    pageSize: number,
    newMargins: Margins
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const updateKey = `page_${pagePos}`;
      
      // 清除之前的更新计划
      const existingTimeout = this.updateTimeouts.get(updateKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      
      // 调度新的更新
      const timeout = setTimeout(() => {
        this.executePageUpdate(editor, pagePos, pageSize, newMargins)
          .then(resolve)
          .catch(error => {
            this.handleUpdateError(updateKey, error, () => {
              return this.executePageUpdate(editor, pagePos, pageSize, newMargins);
            })
            .then(resolve)
            .catch(reject);
          })
          .finally(() => {
            this.updateTimeouts.delete(updateKey);
          });
      }, this.options.updateDelay);
      
      this.updateTimeouts.set(updateKey, timeout);
    });
  }
  
  /**
   * 执行页面更新
   * @param editor 编辑器实例
   * @param pagePos 页面位置
   * @param pageSize 页面大小
   * @param newMargins 新的边距
   * @returns Promise
   */
  private executePageUpdate(
    editor: Editor,
    pagePos: number,
    pageSize: number,
    newMargins: Margins
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const endMeasurement = this.options.enablePerformanceMonitoring
        ? globalPerformanceMonitor.startMeasurement('styleSync.executePageUpdate')
        : () => {};
      
      try {
        if (this.options.enableDebugLog) {
          console.log(`StyleSyncManager: Updating page at position ${pagePos}`);
        }
        
        // 使用帧调度器确保更新在合适的时机进行
        globalFrameScheduler.schedule(() => {
          try {
            batchUpdatePageHeaderFooterStyles(editor, pagePos, pageSize, newMargins);
            endMeasurement();
            resolve();
          } catch (error) {
            endMeasurement();
            reject(error);
          }
        });
        
      } catch (error) {
        endMeasurement();
        reject(error);
      }
    });
  }
  
  /**
   * 处理更新错误
   * @param updateKey 更新键
   * @param error 错误对象
   * @param retryFn 重试函数
   * @returns Promise
   */
  private handleUpdateError(
    updateKey: string,
    error: any,
    retryFn: () => Promise<void>
  ): Promise<void> {
    const retryCount = this.retryCounters.get(updateKey) || 0;
    
    if (retryCount < this.options.maxRetries) {
      this.retryCounters.set(updateKey, retryCount + 1);
      
      if (this.options.enableDebugLog) {
        console.warn(`StyleSyncManager: Retrying update for ${updateKey} (attempt ${retryCount + 1})`);
      }
      
      // 指数退避重试
      const delay = Math.pow(2, retryCount) * 100;
      
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          retryFn().then(resolve).catch(reject);
        }, delay);
      });
    } else {
      this.retryCounters.delete(updateKey);
      
      if (this.options.enableDebugLog) {
        console.error(`StyleSyncManager: Max retries exceeded for ${updateKey}:`, error);
      }
      
      return Promise.reject(error);
    }
  }
  
  /**
   * 同步指定页面的样式
   * @param editor 编辑器实例
   * @param pagePos 页面位置
   * @param pageSize 页面大小
   * @param margins 边距
   */
  public syncPageStyles(
    editor: Editor,
    pagePos: number,
    pageSize: number,
    margins: Margins
  ): void {
    this.schedulePageUpdate(editor, pagePos, pageSize, margins).catch(error => {
      if (this.options.enableDebugLog) {
        console.error('StyleSyncManager: Failed to sync page styles:', error);
      }
    });
  }
  
  /**
   * 清理所有待处理的更新
   */
  public clearPendingUpdates(): void {
    // 清除所有超时
    for (const timeout of this.updateTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.updateTimeouts.clear();
    
    // 清除重试计数器
    this.retryCounters.clear();
    
    // 清除批处理器
    this.batchProcessor.clear();
    
    // 清除帧调度器
    globalFrameScheduler.clear();
    
    // 清除NodeView管理器中的待处理更新
    globalNodeViewManager.clearAllUpdates();
  }
  
  /**
   * 获取待处理更新的数量
   * @returns 待处理更新数量
   */
  public getPendingUpdateCount(): number {
    return (
      this.updateTimeouts.size +
      this.batchProcessor.length +
      globalFrameScheduler.pendingCount +
      globalNodeViewManager.getPendingUpdateCount()
    );
  }
  
  /**
   * 更新选项配置
   * @param options 新的选项
   */
  public updateOptions(options: Partial<SyncOptions>): void {
    this.options = { ...this.options, ...options };
    
    // 如果防抖设置发生变化，重新创建防抖函数
    if (options.enableDebounce !== undefined || options.debounceDelay !== undefined) {
      if (this.options.enableDebounce) {
        this.debouncedUpdate = createDebouncedStyleUpdate(
          this.handleTransactionImmediate.bind(this),
          this.options.debounceDelay
        );
      } else {
        this.debouncedUpdate = this.handleTransactionImmediate.bind(this);
      }
    }
  }
  
  /**
   * 获取性能统计信息
   * @returns 性能统计信息
   */
  public getPerformanceStats(): Record<string, any> {
    if (!this.options.enablePerformanceMonitoring) {
      return {};
    }
    
    return globalPerformanceMonitor.getAllStats();
  }
  
  /**
   * 清除性能统计信息
   */
  public clearPerformanceStats(): void {
    globalPerformanceMonitor.clearAll();
  }
}

/**
 * 全局样式同步管理器实例
 */
export const globalStyleSyncManager = new StyleSyncManager({
  enableBatchUpdate: true,
  updateDelay: 0,
  enableDebugLog: true,
  maxRetries: 3,
  enablePerformanceMonitoring: true,
  enableDebounce: true,
  debounceDelay: 16
});

/**
 * 为编辑器实例创建样式同步管理器
 * @param options 选项配置
 * @returns 样式同步管理器实例
 */
export function createStyleSyncManager(options?: SyncOptions): StyleSyncManager {
  return new StyleSyncManager(options);
}

/**
 * 便捷函数：处理事务变化
 * @param editor 编辑器实例
 * @param transaction ProseMirror事务
 */
export function handleTransactionStyleSync(
  editor: Editor,
  transaction: Transaction
): void {
  globalStyleSyncManager.handleTransaction(editor, transaction);
}

/**
 * 便捷函数：同步页面样式
 * @param editor 编辑器实例
 * @param pagePos 页面位置
 * @param pageSize 页面大小
 * @param margins 边距
 */
export function syncPageStyles(
  editor: Editor,
  pagePos: number,
  pageSize: number,
  margins: Margins
): void {
  globalStyleSyncManager.syncPageStyles(editor, pagePos, pageSize, margins);
}