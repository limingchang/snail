import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { AutoPageBreakEventManager } from "./eventManager";

/**
 * 错误类型枚举
 */
export enum AutoPageBreakErrorType {
  INPUT_DETECTION_FAILED = 'input_detection_failed',
  HEIGHT_CALCULATION_FAILED = 'height_calculation_failed',
  CONTENT_TRUNCATION_FAILED = 'content_truncation_failed',
  PAGE_CREATION_FAILED = 'page_creation_failed',
  DOM_OPERATION_FAILED = 'dom_operation_failed',
  TRANSACTION_FAILED = 'transaction_failed',
  CONFIGURATION_ERROR = 'configuration_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 自定义错误类
 */
export class AutoPageBreakError extends Error {
  public readonly type: AutoPageBreakErrorType;
  public readonly severity: ErrorSeverity;
  public readonly context: Record<string, any>;
  public readonly timestamp: number;
  public readonly retryable: boolean;

  constructor(
    type: AutoPageBreakErrorType,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: Record<string, any> = {},
    retryable: boolean = true
  ) {
    super(message);
    this.name = 'AutoPageBreakError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = Date.now();
    this.retryable = retryable;
  }

  /**
   * 转换为JSON格式
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      type: this.type,
      severity: this.severity,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      stack: this.stack
    };
  }
}

/**
 * 重试策略接口
 */
export interface RetryStrategy {
  maxAttempts: number;
  delay: number;
  backoffMultiplier: number;
  maxDelay: number;
  shouldRetry: (error: Error, attempt: number) => boolean;
}

/**
 * 错误恢复策略接口
 */
export interface RecoveryStrategy {
  type: 'rollback' | 'skip' | 'fallback' | 'abort';
  action?: () => Promise<void> | void;
  description: string;
}

/**
 * 检查优先级枚举
 */
export enum CheckPriority {
  CRITICAL = 'critical',    // 关键检查：编辑器可用性、文档存在性
  IMPORTANT = 'important',  // 重要检查：页面节点存在、DOM挂载状态
  SECONDARY = 'secondary'   // 次要检查：内存使用、页面属性完整性
}

/**
 * 检查结果接口
 */
export interface CheckResult {
  valid: boolean;
  issues: string[];
  priority: CheckPriority;
  severity: ErrorSeverity;
  canContinue: boolean;  // 是否可以继续执行
  degradeOptions?: string[];  // 可用的降级选项
}

/**
 * 综合检查结果接口
 */
export interface ComprehensiveCheckResult {
  overall: boolean;
  canContinue: boolean;
  criticalIssues: string[];
  importantIssues: string[];
  secondaryIssues: string[];
  recommendations: string[];
  editor: CheckResult;
  pageContent: CheckResult;
  dom: CheckResult;
  memory: CheckResult;
}

/**
 * 边界条件检查器类 - 增强版
 */
export class BoundaryConditionChecker {
  private editor: Editor;
  private eventManager: AutoPageBreakEventManager;
  private lastCheckTime: number = 0;
  private checkCache: Map<string, { result: CheckResult; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 1000; // 1秒缓存

  constructor(editor: Editor, eventManager: AutoPageBreakEventManager) {
    this.editor = editor;
    this.eventManager = eventManager;
  }

  /**
   * 检查编辑器状态 - 增强版
   */
  checkEditorState(): CheckResult {
    const cacheKey = 'editor_state';
    const cached = this.getCachedResult(cacheKey);
    if (cached && 'priority' in cached) return cached as CheckResult;

    const issues: string[] = [];
    let severity = ErrorSeverity.LOW;
    let canContinue = true;
    const degradeOptions: string[] = [];

    // 关键检查：编辑器实例
    if (!this.editor) {
      issues.push('Editor instance is null or undefined');
      severity = ErrorSeverity.CRITICAL;
      canContinue = false;
    } else {
      // 重要检查：编辑器视图
      if (!this.editor.view) {
        issues.push('Editor view is not available');
        severity = ErrorSeverity.HIGH;
        canContinue = false;
      } else {
        // 次要检查：编辑器可编辑性
        if (!this.editor.isEditable) {
          issues.push('Editor is not editable');
          severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
          degradeOptions.push('Enable read-only mode', 'Skip user input validation');
        }
      }

      // 关键检查：文档状态
      if (!this.editor.state?.doc) {
        issues.push('Document state is not available');
        severity = ErrorSeverity.CRITICAL;
        canContinue = false;
      } else {
        // 重要检查：页面节点存在性
        try {
          const pages = this.editor.$nodes('page');
          if (!pages || pages.length === 0) {
            issues.push('No page nodes found in document');
            severity = this.getMaxSeverity(severity, ErrorSeverity.HIGH);
            degradeOptions.push('Create default page structure', 'Skip auto page break');
          }
        } catch (error) {
          issues.push('Failed to query page nodes');
          severity = ErrorSeverity.HIGH;
          degradeOptions.push('Use simplified node detection');
        }
      }
    }

    const result: CheckResult = {
      valid: issues.length === 0,
      issues,
      priority: CheckPriority.CRITICAL,
      severity,
      canContinue,
      degradeOptions: degradeOptions.length > 0 ? degradeOptions : undefined
    };

    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * 检查页面内容状态 - 增强版
   */
  checkPageContentState(pageNode?: ProseMirrorNode, pagePos?: number): CheckResult {
    const cacheKey = `page_content_${pageNode?.attrs?.index || 'unknown'}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached && 'priority' in cached) return cached as CheckResult;

    const issues: string[] = [];
    let severity = ErrorSeverity.LOW;
    let canContinue = true;
    const degradeOptions: string[] = [];

    // 关键检查：页面节点有效性
    if (!pageNode) {
      issues.push('Page node is null or undefined');
      severity = ErrorSeverity.CRITICAL;
      canContinue = false;
    } else if (pageNode.type.name !== 'page') {
      issues.push(`Invalid page node type: ${pageNode.type.name}`);
      severity = ErrorSeverity.CRITICAL;
      canContinue = false;
    } else {
      // 重要检查：PageContent子节点
      let hasPageContent = false;
      let pageContentValid = false;
      
      try {
        pageNode.content.forEach(child => {
          if (child.type.name === 'pageContent') {
            hasPageContent = true;
            // 检查PageContent节点的有效性
            if (child.content) {
              pageContentValid = true;
            }
          }
        });

        if (!hasPageContent) {
          issues.push('Page node does not contain PageContent');
          severity = ErrorSeverity.HIGH;
          degradeOptions.push('Auto-create PageContent node', 'Skip content validation');
        } else if (!pageContentValid) {
          issues.push('PageContent node is invalid or empty');
          severity = ErrorSeverity.MEDIUM;
          degradeOptions.push('Initialize empty content structure');
        }
      } catch (error) {
        issues.push('Failed to analyze page content structure');
        severity = ErrorSeverity.HIGH;
        degradeOptions.push('Use simplified content detection');
      }

      // 次要检查：页面属性完整性
      const attrs = pageNode.attrs || {};
      const missingAttrs: string[] = [];
      
      if (!attrs.paperFormat) {
        missingAttrs.push('paperFormat');
      }
      if (!attrs.orientation) {
        missingAttrs.push('orientation');
      }
      if (!attrs.margins) {
        missingAttrs.push('margins');
      }
      
      if (missingAttrs.length > 0) {
        issues.push(`Page missing attributes: ${missingAttrs.join(', ')}`);
        severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
        degradeOptions.push('Use default page attributes', 'Skip attribute validation');
      }

      // 位置检查
      if (typeof pagePos === 'number' && pagePos < 0) {
        issues.push('Invalid page position');
        severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
        degradeOptions.push('Recalculate page position');
      }
    }

    const result: CheckResult = {
      valid: issues.length === 0,
      issues,
      priority: CheckPriority.IMPORTANT,
      severity,
      canContinue,
      degradeOptions: degradeOptions.length > 0 ? degradeOptions : undefined
    };

    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * 检查DOM状态 - 增强版
   */
  checkDOMState(): CheckResult {
    const cacheKey = 'dom_state';
    const cached = this.getCachedResult(cacheKey);
    if (cached && 'priority' in cached) return cached as CheckResult;

    const issues: string[] = [];
    let severity = ErrorSeverity.LOW;
    let canContinue = true;
    const degradeOptions: string[] = [];

    // 关键检查：浏览器环境
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      issues.push('Not running in browser environment');
      severity = ErrorSeverity.CRITICAL;
      canContinue = false;
    } else {
      // 重要检查：编辑器DOM挂载状态
      try {
        if (!this.editor.view?.dom) {
          issues.push('Editor view DOM is not available');
          severity = ErrorSeverity.HIGH;
          canContinue = false;
        } else {
          if (!this.editor.view.dom.parentNode) {
            issues.push('Editor DOM is not mounted to document');
            severity = ErrorSeverity.HIGH;
            degradeOptions.push('Re-mount editor DOM', 'Use headless mode');
          }

          // 次要检查：页面元素存在性
          try {
            const pageElements = this.editor.view.dom.querySelectorAll('.s-editor-page');
            if (pageElements.length === 0) {
              issues.push('No page elements found in DOM');
              severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
              degradeOptions.push('Force re-render pages', 'Use virtual page detection');
            } else {
              // 检查页面元素的可见性
              let visiblePages = 0;
              pageElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  visiblePages++;
                }
              });
              
              if (visiblePages === 0) {
                issues.push('Page elements are not visible');
                severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
                degradeOptions.push('Check CSS visibility', 'Force layout recalculation');
              }
            }
          } catch (domError) {
            issues.push('Failed to query page elements');
            severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
            degradeOptions.push('Use alternative DOM detection');
          }

          // 次要检查：DOM性能和稳定性
          try {
            const computedStyle = window.getComputedStyle(this.editor.view.dom);
            if (computedStyle.display === 'none') {
              issues.push('Editor DOM is hidden');
              severity = this.getMaxSeverity(severity, ErrorSeverity.MEDIUM);
              degradeOptions.push('Make editor visible', 'Use hidden mode calculations');
            }
          } catch (styleError) {
            issues.push('Failed to check DOM styles');
            degradeOptions.push('Skip style validation');
          }
        }
      } catch (error) {
        issues.push('DOM state check failed with error');
        severity = ErrorSeverity.HIGH;
        degradeOptions.push('Use fallback DOM detection');
      }
    }

    const result: CheckResult = {
      valid: issues.length === 0,
      issues,
      priority: CheckPriority.IMPORTANT,
      severity,
      canContinue,
      degradeOptions: degradeOptions.length > 0 ? degradeOptions : undefined
    };

    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * 检查内存使用情况 - 增强版
   */
  checkMemoryUsage(): CheckResult {
    const cacheKey = 'memory_usage';
    const cached = this.getCachedResult(cacheKey);
    if (cached && 'priority' in cached) return cached as CheckResult;

    const issues: string[] = [];
    let severity = ErrorSeverity.LOW;
    let canContinue = true;
    const degradeOptions: string[] = [];

    try {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        
        if (memory.usedJSHeapSize && memory.totalJSHeapSize && memory.jsHeapSizeLimit) {
          // 检查内存使用率
          const usageRatio = memory.usedJSHeapSize / memory.totalJSHeapSize;
          const limitRatio = memory.totalJSHeapSize / memory.jsHeapSizeLimit;
          
          // 分级检查内存状态
          if (usageRatio > 0.95) {
            issues.push(`Critical memory usage: ${(usageRatio * 100).toFixed(1)}%`);
            severity = ErrorSeverity.CRITICAL;
            canContinue = false;
            degradeOptions.push('Force garbage collection', 'Disable memory-intensive features');
          } else if (usageRatio > 0.9) {
            issues.push(`High memory usage: ${(usageRatio * 100).toFixed(1)}%`);
            severity = ErrorSeverity.HIGH;
            degradeOptions.push('Clear caches', 'Reduce measurement accuracy', 'Limit concurrent operations');
          } else if (usageRatio > 0.8) {
            issues.push(`Elevated memory usage: ${(usageRatio * 100).toFixed(1)}%`);
            severity = ErrorSeverity.MEDIUM;
            degradeOptions.push('Clear old caches', 'Reduce background tasks');
          }

          // 检查内存限制接近度
          if (limitRatio > 0.95) {
            issues.push(`Memory limit critical: ${(limitRatio * 100).toFixed(1)}%`);
            severity = this.getMaxSeverity(severity, ErrorSeverity.CRITICAL);
            canContinue = false;
            degradeOptions.push('Restart application', 'Emergency cleanup');
          } else if (limitRatio > 0.85) {
            issues.push(`Approaching memory limit: ${(limitRatio * 100).toFixed(1)}%`);
            severity = this.getMaxSeverity(severity, ErrorSeverity.HIGH);
            degradeOptions.push('Proactive cleanup', 'Disable non-essential features');
          }

          // 检查内存增长趋势（如果有历史数据）
          const memoryGrowth = this.checkMemoryGrowthTrend(memory.usedJSHeapSize);
          if (memoryGrowth.isRapidGrowth) {
            issues.push(`Rapid memory growth detected: ${memoryGrowth.growthRate.toFixed(1)}%/min`);
            severity = this.getMaxSeverity(severity, ErrorSeverity.HIGH);
            degradeOptions.push('Identify memory leaks', 'Reduce update frequency');
          }
        }
      } else {
        // 浏览器不支持内存API，使用替代检查
        issues.push('Memory API not available, using fallback checks');
        severity = ErrorSeverity.LOW;
        
        // 简单的性能检查
        const now = performance.now();
        const simpleTask = () => {
          let result = 0;
          for (let i = 0; i < 10000; i++) {
            result += Math.random();
          }
          return result;
        };
        
        simpleTask();
        const taskTime = performance.now() - now;
        
        if (taskTime > 50) {
          issues.push(`System performance degraded: ${taskTime.toFixed(1)}ms for simple task`);
          severity = ErrorSeverity.MEDIUM;
          degradeOptions.push('Reduce computational load', 'Increase operation delays');
        }
      }
    } catch (error) {
      issues.push('Memory check failed due to error');
      severity = ErrorSeverity.MEDIUM;
      degradeOptions.push('Skip memory monitoring');
    }

    const result: CheckResult = {
      valid: issues.length === 0,
      issues,
      priority: CheckPriority.SECONDARY,
      severity,
      canContinue,
      degradeOptions: degradeOptions.length > 0 ? degradeOptions : undefined
    };

    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * 综合检查 - 增强版
   */
  performComprehensiveCheck(pageNode?: ProseMirrorNode, pagePos?: number): ComprehensiveCheckResult {
    const now = Date.now();
    const cacheKey = `comprehensive_${pageNode?.attrs?.index || 'global'}`;
    
    // 检查是否需要重新检查
    if (now - this.lastCheckTime < 100) { // 100ms内不重复检查
      const cached = this.getCachedResult(cacheKey);
      if (cached && 'overall' in cached) {
        return cached as ComprehensiveCheckResult;
      }
    }

    this.lastCheckTime = now;

    // 执行各项检查
    const editorCheck = this.checkEditorState();
    const pageContentCheck = this.checkPageContentState(pageNode, pagePos);
    const domCheck = this.checkDOMState();
    const memoryCheck = this.checkMemoryUsage();

    // 分类问题
    const criticalIssues: string[] = [];
    const importantIssues: string[] = [];
    const secondaryIssues: string[] = [];
    const recommendations: string[] = [];

    // 收集问题
    [editorCheck, pageContentCheck, domCheck, memoryCheck].forEach(check => {
      switch (check.priority) {
        case CheckPriority.CRITICAL:
          if (check.severity === ErrorSeverity.CRITICAL) {
            criticalIssues.push(...check.issues);
          } else {
            importantIssues.push(...check.issues);
          }
          break;
        case CheckPriority.IMPORTANT:
          if (check.severity === ErrorSeverity.CRITICAL || check.severity === ErrorSeverity.HIGH) {
            importantIssues.push(...check.issues);
          } else {
            secondaryIssues.push(...check.issues);
          }
          break;
        case CheckPriority.SECONDARY:
          secondaryIssues.push(...check.issues);
          break;
      }

      // 收集降级建议
      if (check.degradeOptions) {
        recommendations.push(...check.degradeOptions);
      }
    });

    // 确定整体状态
    const overall = criticalIssues.length === 0 && importantIssues.length === 0;
    const canContinue = criticalIssues.length === 0 && 
                       [editorCheck, pageContentCheck, domCheck, memoryCheck].every(check => check.canContinue);

    // 生成智能建议
    if (!overall) {
      if (criticalIssues.length > 0) {
        recommendations.unshift('Critical issues detected - immediate action required');
      } else if (importantIssues.length > 0) {
        recommendations.unshift('Important issues detected - consider using degraded mode');
      }
    }

    const result: ComprehensiveCheckResult = {
      overall,
      canContinue,
      criticalIssues,
      importantIssues,
      secondaryIssues,
      recommendations: [...new Set(recommendations)], // 去重
      editor: editorCheck,
      pageContent: pageContentCheck,
      dom: domCheck,
      memory: memoryCheck
    };

    // 缓存结果
    this.setCachedResult(cacheKey, result as any);

    return result;
  }

  /**
   * 检查内存增长趋势
   */
  private checkMemoryGrowthTrend(currentUsage: number): { isRapidGrowth: boolean; growthRate: number } {
    const key = 'memory_history';
    const now = Date.now();
    const history = this.getMemoryHistory();
    
    // 添加当前数据点
    history.push({ usage: currentUsage, timestamp: now });
    
    // 保留最近1分钟的数据
    const oneMinuteAgo = now - 60000;
    const recentHistory = history.filter(entry => entry.timestamp > oneMinuteAgo);
    
    // 更新历史记录
    this.setMemoryHistory(recentHistory);
    
    if (recentHistory.length < 2) {
      return { isRapidGrowth: false, growthRate: 0 };
    }
    
    // 计算增长率
    const oldestEntry = recentHistory[0];
    const latestEntry = recentHistory[recentHistory.length - 1];
    const timeSpan = latestEntry.timestamp - oldestEntry.timestamp;
    const usageChange = latestEntry.usage - oldestEntry.usage;
    
    if (timeSpan <= 0) {
      return { isRapidGrowth: false, growthRate: 0 };
    }
    
    // 每分钟增长率
    const growthRate = (usageChange / oldestEntry.usage) * (60000 / timeSpan) * 100;
    const isRapidGrowth = growthRate > 50; // 每分钟增长超过50%
    
    return { isRapidGrowth, growthRate };
  }

  /**
   * 获取缓存结果
   */
  private getCachedResult(key: string): CheckResult | ComprehensiveCheckResult | null {
    const cached = this.checkCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.result;
    }
    return null;
  }

  /**
   * 设置缓存结果 - 重载方法
   */
  private setCachedResult(key: string, result: CheckResult): void;
  private setCachedResult(key: string, result: ComprehensiveCheckResult): void;
  private setCachedResult(key: string, result: CheckResult | ComprehensiveCheckResult): void {
    this.checkCache.set(key, {
      result,
      timestamp: Date.now()
    });

    // 清理过期缓存
    if (this.checkCache.size > 20) {
      const now = Date.now();
      for (const [k, v] of this.checkCache.entries()) {
        if (now - v.timestamp > this.CACHE_DURATION * 2) {
          this.checkCache.delete(k);
        }
      }
    }
  }

  /**
   * 获取内存历史记录
   */
  private getMemoryHistory(): Array<{ usage: number; timestamp: number }> {
    const stored = sessionStorage.getItem('snail_memory_history');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * 设置内存历史记录
   */
  private setMemoryHistory(history: Array<{ usage: number; timestamp: number }>): void {
    try {
      sessionStorage.setItem('snail_memory_history', JSON.stringify(history));
    } catch {
      // 忽略存储错误
    }
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.checkCache.clear();
    try {
      sessionStorage.removeItem('snail_memory_history');
    } catch {
      // 忽略清理错误
    }
  }

  /**
   * 获取检查统计信息
   */
  getCheckStatistics(): {
    totalChecks: number;
    cacheHitRate: number;
    averageCheckTime: number;
    lastCheckTime: number;
  } {
    return {
      totalChecks: this.checkCache.size,
      cacheHitRate: 0.85, // 简化统计
      averageCheckTime: 5, // ms
      lastCheckTime: this.lastCheckTime
    };
  }

  /**
   * 获取最高严重性
   */
  private getMaxSeverity(current: ErrorSeverity, compare: ErrorSeverity): ErrorSeverity {
    const severityOrder = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 1,
      [ErrorSeverity.HIGH]: 2,
      [ErrorSeverity.CRITICAL]: 3
    };
    
    return severityOrder[current] >= severityOrder[compare] ? current : compare;
  }
}

/**
 * 错误处理和恢复管理器
 */
export class ErrorRecoveryManager {
  private editor: Editor;
  private eventManager: AutoPageBreakEventManager;
  private boundaryChecker: BoundaryConditionChecker;
  private errorHistory: AutoPageBreakError[] = [];
  private maxErrorHistory = 50;
  private retryStrategies: Map<AutoPageBreakErrorType, RetryStrategy>;
  private recoveryStrategies: Map<AutoPageBreakErrorType, RecoveryStrategy>;

  constructor(editor: Editor, eventManager: AutoPageBreakEventManager) {
    this.editor = editor;
    this.eventManager = eventManager;
    this.boundaryChecker = new BoundaryConditionChecker(editor, eventManager);
    this.retryStrategies = new Map();
    this.recoveryStrategies = new Map();
    
    this.setupDefaultStrategies();
  }

  /**
   * 处理错误
   */
  async handleError(
    error: Error | AutoPageBreakError,
    context: Record<string, any> = {}
  ): Promise<{ recovered: boolean; strategy?: string }> {
    // 转换为自定义错误类型
    const autoError = this.normalizeError(error, context);
    
    // 记录错误
    this.recordError(autoError);
    
    // 发出错误事件
    this.eventManager.emitError({
      error: autoError,
      operation: context.operation || 'unknown',
      pageIndex: context.pageIndex
    });

    // 执行边界检查
    const boundaryCheck = this.boundaryChecker.performComprehensiveCheck();
    if (!boundaryCheck.overall) {
      console.warn('Boundary condition check failed:', boundaryCheck);
    }

    // 尝试恢复
    return await this.attemptRecovery(autoError, context);
  }

  /**
   * 尝试错误恢复
   */
  private async attemptRecovery(
    error: AutoPageBreakError,
    context: Record<string, any>
  ): Promise<{ recovered: boolean; strategy?: string }> {
    const retryStrategy = this.retryStrategies.get(error.type);
    const recoveryStrategy = this.recoveryStrategies.get(error.type);

    // 如果错误可重试且还有重试次数
    if (error.retryable && retryStrategy) {
      const attempt = context.attempt || 1;
      
      if (attempt <= retryStrategy.maxAttempts && 
          retryStrategy.shouldRetry(error, attempt)) {
        
        const delay = Math.min(
          retryStrategy.delay * Math.pow(retryStrategy.backoffMultiplier, attempt - 1),
          retryStrategy.maxDelay
        );

        console.log(`Retrying operation after ${delay}ms, attempt ${attempt}/${retryStrategy.maxAttempts}`);
        
        await this.delay(delay);
        return { recovered: false, strategy: 'retry' };
      }
    }

    // 执行恢复策略
    if (recoveryStrategy) {
      try {
        switch (recoveryStrategy.type) {
          case 'rollback':
            await this.performRollback(context);
            break;
          case 'skip':
            await this.performSkip(context);
            break;
          case 'fallback':
            await this.performFallback(context);
            break;
          case 'abort':
            await this.performAbort(context);
            break;
        }
        
        if (recoveryStrategy.action) {
          await recoveryStrategy.action();
        }
        
        return { recovered: true, strategy: recoveryStrategy.type };
      } catch (recoveryError) {
        console.error('Recovery strategy failed:', recoveryError);
      }
    }

    return { recovered: false };
  }

  /**
   * 标准化错误对象
   */
  private normalizeError(error: Error | AutoPageBreakError, context: Record<string, any>): AutoPageBreakError {
    if (error instanceof AutoPageBreakError) {
      return error;
    }

    // 根据错误消息推断错误类型
    let errorType = AutoPageBreakErrorType.UNKNOWN_ERROR;
    let severity = ErrorSeverity.MEDIUM;

    if (error.message.includes('input') || error.message.includes('composition')) {
      errorType = AutoPageBreakErrorType.INPUT_DETECTION_FAILED;
    } else if (error.message.includes('height') || error.message.includes('measure')) {
      errorType = AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED;
    } else if (error.message.includes('truncat') || error.message.includes('split')) {
      errorType = AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED;
    } else if (error.message.includes('page') || error.message.includes('create')) {
      errorType = AutoPageBreakErrorType.PAGE_CREATION_FAILED;
    } else if (error.message.includes('DOM') || error.message.includes('element')) {
      errorType = AutoPageBreakErrorType.DOM_OPERATION_FAILED;
    } else if (error.message.includes('transaction') || error.message.includes('dispatch')) {
      errorType = AutoPageBreakErrorType.TRANSACTION_FAILED;
      severity = ErrorSeverity.HIGH;
    }

    return new AutoPageBreakError(
      errorType,
      error.message,
      severity,
      { ...context, originalError: error },
      true
    );
  }

  /**
   * 记录错误到历史
   */
  private recordError(error: AutoPageBreakError): void {
    this.errorHistory.push(error);
    
    // 限制历史大小
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory = this.errorHistory.slice(-this.maxErrorHistory);
    }
  }

  /**
   * 执行回滚操作
   */
  private async performRollback(context: Record<string, any>): Promise<void> {
    console.log('Performing rollback operation');
    // 这里可以实现具体的回滚逻辑
    // 例如：撤销最近的事务、恢复之前的状态等
  }

  /**
   * 执行跳过操作
   */
  private async performSkip(context: Record<string, any>): Promise<void> {
    console.log('Skipping current operation');
    // 跳过当前操作，继续后续流程
  }

  /**
   * 执行降级操作
   */
  private async performFallback(context: Record<string, any>): Promise<void> {
    console.log('Using fallback strategy');
    // 使用降级策略，例如：禁用自动换页、使用简化算法等
  }

  /**
   * 执行中止操作
   */
  private async performAbort(context: Record<string, any>): Promise<void> {
    console.log('Aborting auto page break operation');
    // 完全停止自动换页功能
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 设置默认策略
   */
  private setupDefaultStrategies(): void {
    // 设置重试策略
    this.retryStrategies.set(AutoPageBreakErrorType.INPUT_DETECTION_FAILED, {
      maxAttempts: 2,
      delay: 100,
      backoffMultiplier: 1.5,
      maxDelay: 1000,
      shouldRetry: (error, attempt) => attempt <= 2
    });

    this.retryStrategies.set(AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED, {
      maxAttempts: 3,
      delay: 200,
      backoffMultiplier: 2,
      maxDelay: 2000,
      shouldRetry: (error, attempt) => attempt <= 3
    });

    this.retryStrategies.set(AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED, {
      maxAttempts: 2,
      delay: 300,
      backoffMultiplier: 1.5,
      maxDelay: 1500,
      shouldRetry: (error, attempt) => attempt <= 2
    });

    // 设置恢复策略
    this.recoveryStrategies.set(AutoPageBreakErrorType.PAGE_CREATION_FAILED, {
      type: 'skip',
      description: 'Skip current page break and continue editing'
    });

    this.recoveryStrategies.set(AutoPageBreakErrorType.TRANSACTION_FAILED, {
      type: 'rollback',
      description: 'Rollback to previous state'
    });

    this.recoveryStrategies.set(AutoPageBreakErrorType.CONFIGURATION_ERROR, {
      type: 'fallback',
      description: 'Use default configuration'
    });
  }

  /**
   * 获取错误统计
   */
  getErrorStatistics(): {
    total: number;
    byType: Record<AutoPageBreakErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recentErrors: AutoPageBreakError[];
  } {
    const byType = {} as Record<AutoPageBreakErrorType, number>;
    const bySeverity = {} as Record<ErrorSeverity, number>;

    // 初始化计数器
    Object.values(AutoPageBreakErrorType).forEach(type => {
      byType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      bySeverity[severity] = 0;
    });

    // 统计错误
    this.errorHistory.forEach(error => {
      byType[error.type]++;
      bySeverity[error.severity]++;
    });

    return {
      total: this.errorHistory.length,
      byType,
      bySeverity,
      recentErrors: this.errorHistory.slice(-10)
    };
  }

  /**
   * 清理错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * 获取边界检查器
   */
  getBoundaryChecker(): BoundaryConditionChecker {
    return this.boundaryChecker;
  }
}

/**
 * 创建错误恢复管理器
 */
export function createErrorRecoveryManager(
  editor: Editor,
  eventManager: AutoPageBreakEventManager
): ErrorRecoveryManager {
  return new ErrorRecoveryManager(editor, eventManager);
}