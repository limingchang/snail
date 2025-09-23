/**
 * 自动换页功能完整导出
 * 
 * 这个文件提供了PageContent自动换页功能的所有组件和工具，
 * 包括核心管理器、工具类、类型定义等。
 */

// 核心管理器
export {
  AutoPageBreakManager,
  createAutoPageBreakManager,
  type AutoPageBreakOptions,
  type AutoPageBreakEventData
} from './utils/autoPageBreakManager';

// 输入检测
export {
  InputDetector,
  CompositionEventListener,
  globalInputDetector,
  InputType,
  type InputDetectionResult
} from './utils/inputDetector';

// 高度计算
export {
  PageHeightCalculator,
  createPageHeightCalculator,
  type PageHeightCalculation
} from './utils/heightCalculator';

// 内容截断
export {
  ContentTruncator,
  createContentTruncator,
  type ContentTruncationResult,
  type TruncationOptions
} from './utils/contentTruncator';

// 事件系统
export {
  AutoPageBreakEventManager,
  createAutoPageBreakEventManager,
  DefaultEventListeners,
  AutoPageBreakEventType,
  type OverflowDetectedEventData,
  type PageBreakTriggeredEventData,
  type ContentTruncatedEventData,
  type NewPageCreatedEventData,
  type ErrorEventData,
  type StatusChangedEventData,
  type EventListener
} from './utils/eventManager';

// 性能优化
export {
  PerformanceOptimizer,
  CacheManager,
  Debouncer,
  VirtualMeasurementManager,
  PerformanceMonitor,
  createPerformanceOptimizer,
  type PerformanceMetrics,
  type DebounceConfig,
  type CacheEntry
} from './utils/performanceOptimizer';

// 错误处理
export {
  ErrorRecoveryManager,
  BoundaryConditionChecker,
  AutoPageBreakError,
  createErrorRecoveryManager,
  AutoPageBreakErrorType,
  ErrorSeverity,
  type RetryStrategy,
  type RecoveryStrategy
} from './utils/errorRecoveryManager';

// 更新的PageContent扩展
export { PageContent } from './pageContent/pageContent';
export { PageContentView } from './pageContent/pageContentView';
export type { PageContentOptions, AutoPageBreakOptions as PageContentAutoPageBreakOptions } from './typing/pageContent';

/**
 * 快速设置自动换页功能的便捷函数
 * 
 * @param editor TipTap编辑器实例
 * @param options 自动换页配置选项
 * @returns 配置好的自动换页管理器
 * 
 * @example
 * ```typescript
 * import { setupAutoPageBreak } from '@snail-js/editor';
 * 
 * const editor = new Editor({
 *   extensions: [PageContent, ...]
 * });
 * 
 * const autoPageBreak = setupAutoPageBreak(editor, {
 *   enabled: true,
 *   breakThreshold: 0.95,
 *   preserveWords: true
 * });
 * 
 * // 监听换页事件
 * autoPageBreak.getEventManager().on('page_break_triggered', (data) => {
 *   console.log('自动换页触发:', data);
 * });
 * ```
 */
export function setupAutoPageBreak(
  editor: any,
  options: Partial<AutoPageBreakOptions> = {}
): AutoPageBreakManager {
  // 验证编辑器实例
  if (!editor || !editor.view) {
    throw new Error('Invalid editor instance provided');
  }

  // 检查是否已有PageContent扩展
  const hasPageContent = editor.extensionManager?.extensions?.some(
    (ext: any) => ext.name === 'pageContent'
  );
  
  if (!hasPageContent) {
    console.warn('PageContent extension not found. Auto page break may not work correctly.');
  }

  // 创建自动换页管理器
  const manager = createAutoPageBreakManager(editor, {
    enabled: true,
    breakThreshold: 0.95,
    preserveWords: true,
    preserveParagraphs: false,
    debounceDelay: 100,
    maxRetries: 3,
    ...options
  });

  // 设置默认事件监听器
  if (process.env.NODE_ENV === 'development') {
    const eventManager = manager.getEventManager();
    
    // 开发环境下的调试日志
    eventManager.on('overflow_detected', DefaultEventListeners.createConsoleLogger('[AutoPageBreak] 内容溢出:'));
    eventManager.on('page_break_triggered', DefaultEventListeners.createConsoleLogger('[AutoPageBreak] 换页触发:'));
    eventManager.on('error_occurred', DefaultEventListeners.createErrorHandler());
  }

  return manager;
}

/**
 * 为现有编辑器实例添加自动换页监听器的便捷函数
 * 
 * @param editor TipTap编辑器实例
 * @param listeners 事件监听器配置
 * @returns 清理函数
 * 
 * @example
 * ```typescript
 * const cleanup = addAutoPageBreakListeners(editor, {
 *   onOverflow: (data) => console.log('内容溢出', data),
 *   onPageBreak: (data) => console.log('页面分割', data),
 *   onError: (error) => console.error('错误', error)
 * });
 * 
 * // 在组件卸载时清理
 * cleanup();
 * ```
 */
export function addAutoPageBreakListeners(
  editor: any,
  listeners: {
    onOverflow?: (data: OverflowDetectedEventData) => void;
    onPageBreak?: (data: PageBreakTriggeredEventData) => void;
    onContentTruncated?: (data: ContentTruncatedEventData) => void;
    onNewPageCreated?: (data: NewPageCreatedEventData) => void;
    onError?: (data: ErrorEventData) => void;
    onStatusChanged?: (data: StatusChangedEventData) => void;
  }
): () => void {
  const cleanupFunctions: (() => void)[] = [];

  // 添加DOM事件监听器
  if (listeners.onOverflow) {
    const handler = (event: CustomEvent) => listeners.onOverflow!(event.detail);
    editor.view.dom.addEventListener('autoPageBreak:overflow_detected', handler);
    cleanupFunctions.push(() => {
      editor.view.dom.removeEventListener('autoPageBreak:overflow_detected', handler);
    });
  }

  if (listeners.onPageBreak) {
    const handler = (event: CustomEvent) => listeners.onPageBreak!(event.detail);
    editor.view.dom.addEventListener('autoPageBreak:page_break_triggered', handler);
    cleanupFunctions.push(() => {
      editor.view.dom.removeEventListener('autoPageBreak:page_break_triggered', handler);
    });
  }

  if (listeners.onContentTruncated) {
    const handler = (event: CustomEvent) => listeners.onContentTruncated!(event.detail);
    editor.view.dom.addEventListener('autoPageBreak:content_truncated', handler);
    cleanupFunctions.push(() => {
      editor.view.dom.removeEventListener('autoPageBreak:content_truncated', handler);
    });
  }

  if (listeners.onNewPageCreated) {
    const handler = (event: CustomEvent) => listeners.onNewPageCreated!(event.detail);
    editor.view.dom.addEventListener('autoPageBreak:new_page_created', handler);
    cleanupFunctions.push(() => {
      editor.view.dom.removeEventListener('autoPageBreak:new_page_created', handler);
    });
  }

  if (listeners.onError) {
    const handler = (event: CustomEvent) => listeners.onError!(event.detail);
    editor.view.dom.addEventListener('autoPageBreak:error_occurred', handler);
    cleanupFunctions.push(() => {
      editor.view.dom.removeEventListener('autoPageBreak:error_occurred', handler);
    });
  }

  if (listeners.onStatusChanged) {
    const handler = (event: CustomEvent) => listeners.onStatusChanged!(event.detail);
    editor.view.dom.addEventListener('autoPageBreak:status_changed', handler);
    cleanupFunctions.push(() => {
      editor.view.dom.removeEventListener('autoPageBreak:status_changed', handler);
    });
  }

  // 返回清理函数
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
}

/**
 * 获取自动换页功能的状态和统计信息
 * 
 * @param manager 自动换页管理器实例
 * @returns 详细的状态报告
 */
export function getAutoPageBreakReport(manager: AutoPageBreakManager): {
  status: any;
  performance: any;
  events: any;
  errors: any;
  boundary: any;
} {
  const status = manager.getStatus();
  const eventManager = manager.getEventManager();
  const performanceOptimizer = manager.getPerformanceOptimizer();
  const errorRecoveryManager = manager.getErrorRecoveryManager();
  
  return {
    status: {
      enabled: status.enabled,
      isProcessing: status.isProcessing,
      options: status.options
    },
    performance: performanceOptimizer.getPerformanceReport(),
    events: {
      statistics: eventManager.getEventStatistics(),
      history: eventManager.getEventHistory(undefined, 10)
    },
    errors: errorRecoveryManager.getErrorStatistics(),
    boundary: errorRecoveryManager.getBoundaryChecker().performComprehensiveCheck()
  };
}

/**
 * 创建自动换页功能的调试工具
 * 
 * @param manager 自动换页管理器实例
 * @returns 调试工具对象
 */
export function createAutoPageBreakDebugger(manager: AutoPageBreakManager) {
  return {
    /**
     * 获取实时状态
     */
    getStatus: () => getAutoPageBreakReport(manager),
    
    /**
     * 手动触发换页检查
     */
    triggerCheck: () => manager.triggerManualCheck(),
    
    /**
     * 清空缓存
     */
    clearCache: () => {
      manager.getPerformanceOptimizer().cacheManager.clear();
      manager.getPerformanceOptimizer().virtualMeasurement.clearCache();
    },
    
    /**
     * 清空事件历史
     */
    clearEventHistory: () => {
      manager.getEventManager().clearEventHistory();
    },
    
    /**
     * 清空错误历史
     */
    clearErrorHistory: () => {
      manager.getErrorRecoveryManager().clearErrorHistory();
    },
    
    /**
     * 启用详细日志
     */
    enableVerboseLogging: () => {
      const eventManager = manager.getEventManager();
      Object.values(AutoPageBreakEventType).forEach(eventType => {
        eventManager.on(eventType, DefaultEventListeners.createConsoleLogger(`[${eventType}]`));
      });
    },
    
    /**
     * 执行边界检查
     */
    checkBoundary: () => {
      return manager.getErrorRecoveryManager().getBoundaryChecker().performComprehensiveCheck();
    }
  };
}

// 类型重新导出，便于使用
export type {
  // 核心类型
  AutoPageBreakManager,
  AutoPageBreakOptions,
  AutoPageBreakEventData,
  
  // 事件类型
  OverflowDetectedEventData,
  PageBreakTriggeredEventData,
  ContentTruncatedEventData,
  NewPageCreatedEventData,
  ErrorEventData,
  StatusChangedEventData,
  
  // 配置类型
  TruncationOptions,
  DebounceConfig,
  RetryStrategy,
  RecoveryStrategy,
  
  // 结果类型
  ContentTruncationResult,
  PageHeightCalculation,
  InputDetectionResult,
  PerformanceMetrics
};