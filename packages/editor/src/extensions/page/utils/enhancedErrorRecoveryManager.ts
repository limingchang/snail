import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { AutoPageBreakEventManager } from "./eventManager";
import { 
  AutoPageBreakError, 
  AutoPageBreakErrorType, 
  ErrorSeverity,
  RetryStrategy,
  RecoveryStrategy
} from "./errorRecoveryManager";

/**
 * 智能重试策略配置
 */
export interface SmartRetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffStrategy: 'linear' | 'exponential' | 'fibonacci' | 'adaptive';
  jitter: boolean;                    // 是否添加随机抖动
  circuitBreakerThreshold: number;    // 熔断器阈值
  adaptiveRatio: number;              // 自适应调整比例
}

/**
 * 降级策略配置
 */
export interface DegradationConfig {
  strategy: 'skip' | 'simplify' | 'fallback' | 'disable';
  fallbackOptions: string[];
  recoveryTimeout: number;            // 恢复检查超时
  autoReenableDelay: number;          // 自动重新启用延迟
}

/**
 * 错误模式识别器
 */
export interface ErrorPattern {
  type: AutoPageBreakErrorType;
  frequency: number;                  // 频率（次/分钟）
  consecutiveCount: number;           // 连续出现次数
  timeWindow: number;                 // 时间窗口
  trend: 'increasing' | 'stable' | 'decreasing';
}

/**
 * 错误恢复上下文
 */
export interface RecoveryContext {
  operationId: string;
  pageIndex?: number;
  attempt: number;
  errorHistory: AutoPageBreakError[];
  systemState: {
    memoryPressure: number;
    cpuLoad: number;
    errorRate: number;
  };
}

/**
 * 恢复决策结果
 */
export interface RecoveryDecision {
  action: 'retry' | 'degrade' | 'abort';
  strategy: string;
  delay: number;
  reason: string;
  confidence: number;              // 决策置信度 (0-1)
  expectedSuccessRate: number;     // 预期成功率 (0-1)
}

/**
 * 增强版错误恢复管理器
 * 实现智能重试和降级策略
 */
export class EnhancedErrorRecoveryManager {
  private editor: Editor;
  private eventManager: AutoPageBreakEventManager;
  
  // 配置
  private retryConfigs: Map<AutoPageBreakErrorType, SmartRetryConfig>;
  private degradationConfigs: Map<AutoPageBreakErrorType, DegradationConfig>;
  
  // 状态管理
  private errorHistory: AutoPageBreakError[] = [];
  private errorPatterns: Map<AutoPageBreakErrorType, ErrorPattern>;
  private circuitBreakers: Map<AutoPageBreakErrorType, { isOpen: boolean; lastTrip: number; failureCount: number }>;
  private degradedOperations: Set<string>;
  
  // 统计和监控
  private recoveryStats: Map<string, { attempts: number; successes: number; lastSuccess: number }>;
  private performanceMetrics: {
    totalRecoveries: number;
    successfulRecoveries: number;
    averageRecoveryTime: number;
    degradationEvents: number;
  };

  private readonly MAX_ERROR_HISTORY = 100;
  private readonly PATTERN_ANALYSIS_WINDOW = 300000; // 5分钟

  constructor(editor: Editor, eventManager: AutoPageBreakEventManager) {
    this.editor = editor;
    this.eventManager = eventManager;
    
    this.retryConfigs = new Map();
    this.degradationConfigs = new Map();
    this.errorPatterns = new Map();
    this.circuitBreakers = new Map();
    this.degradedOperations = new Set();
    this.recoveryStats = new Map();
    
    this.performanceMetrics = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      averageRecoveryTime: 0,
      degradationEvents: 0
    };
    
    this.initializeDefaultConfigs();
    this.startBackgroundTasks();
  }

  /**
   * 智能错误处理和恢复
   */
  async handleErrorSmart(
    error: Error | AutoPageBreakError,
    context: RecoveryContext
  ): Promise<{ recovered: boolean; decision: RecoveryDecision }> {
    const startTime = performance.now();
    this.performanceMetrics.totalRecoveries++;

    // 转换为标准错误对象
    const standardError = this.normalizeError(error, context);
    
    // 记录错误
    this.recordError(standardError);
    
    // 分析错误模式
    this.analyzeErrorPattern(standardError);
    
    // 检查熔断器状态
    if (this.isCircuitBreakerOpen(standardError.type)) {
      return {
        recovered: false,
        decision: {
          action: 'abort',
          strategy: 'circuit_breaker',
          delay: 0,
          reason: 'Circuit breaker is open for this error type',
          confidence: 1.0,
          expectedSuccessRate: 0
        }
      };
    }

    // 生成恢复决策
    const decision = await this.generateRecoveryDecision(standardError, context);
    
    // 执行恢复动作
    const recovered = await this.executeRecoveryDecision(decision, standardError, context);
    
    // 更新统计
    if (recovered) {
      this.performanceMetrics.successfulRecoveries++;
    }
    
    const recoveryTime = performance.now() - startTime;
    this.updateRecoveryMetrics(recoveryTime);
    
    // 发出恢复事件
    this.eventManager.emitError({
      error: standardError,
      operation: context.operationId,
      pageIndex: context.pageIndex
    });

    return { recovered, decision };
  }

  /**
   * 生成智能恢复决策
   */
  private async generateRecoveryDecision(
    error: AutoPageBreakError,
    context: RecoveryContext
  ): Promise<RecoveryDecision> {
    const errorType = error.type;
    const retryConfig = this.retryConfigs.get(errorType);
    const degradationConfig = this.degradationConfigs.get(errorType);
    
    // 评估系统状态
    const systemHealthScore = this.evaluateSystemHealth(context.systemState);
    
    // 检查错误模式
    const errorPattern = this.errorPatterns.get(errorType);
    const isErrorRateHigh = errorPattern && errorPattern.frequency > 10; // 每分钟超过10次
    
    // 检查连续失败
    const consecutiveFailures = this.getConsecutiveFailures(errorType);
    
    // 决策逻辑
    if (context.attempt === 1 && retryConfig && systemHealthScore > 0.7 && !isErrorRateHigh) {
      // 第一次尝试，系统健康，错误率不高 -> 重试
      return {
        action: 'retry',
        strategy: 'smart_retry',
        delay: this.calculateSmartDelay(retryConfig, context.attempt, consecutiveFailures),
        reason: 'First attempt with good system health',
        confidence: 0.8,
        expectedSuccessRate: 0.7
      };
    }
    
    if (context.attempt <= retryConfig?.maxAttempts && systemHealthScore > 0.5) {
      // 还有重试机会，系统状态可接受 -> 重试
      const delay = this.calculateSmartDelay(retryConfig!, context.attempt, consecutiveFailures);
      return {
        action: 'retry',
        strategy: 'adaptive_retry',
        delay,
        reason: `Retry attempt ${context.attempt} with adaptive delay`,
        confidence: Math.max(0.3, 0.8 - context.attempt * 0.1),
        expectedSuccessRate: Math.max(0.2, 0.6 - context.attempt * 0.1)
      };
    }
    
    if (degradationConfig && this.canDegrade(errorType)) {
      // 可以降级 -> 降级
      return {
        action: 'degrade',
        strategy: degradationConfig.strategy,
        delay: 0,
        reason: 'Degrading due to repeated failures',
        confidence: 0.9,
        expectedSuccessRate: 0.5
      };
    }
    
    // 无法恢复 -> 中止
    return {
      action: 'abort',
      strategy: 'abort',
      delay: 0,
      reason: 'No viable recovery options available',
      confidence: 1.0,
      expectedSuccessRate: 0
    };
  }

  /**
   * 计算智能延迟
   */
  private calculateSmartDelay(
    config: SmartRetryConfig,
    attempt: number,
    consecutiveFailures: number
  ): number {
    let delay: number;
    
    switch (config.backoffStrategy) {
      case 'linear':
        delay = config.baseDelay * attempt;
        break;
      case 'exponential':
        delay = config.baseDelay * Math.pow(2, attempt - 1);
        break;
      case 'fibonacci':
        delay = config.baseDelay * this.fibonacci(attempt);
        break;
      case 'adaptive':
        // 根据连续失败次数和系统负载动态调整
        const loadFactor = 1 + consecutiveFailures * config.adaptiveRatio;
        delay = config.baseDelay * Math.pow(2, attempt - 1) * loadFactor;
        break;
      default:
        delay = config.baseDelay;
    }
    
    // 应用最大延迟限制
    delay = Math.min(delay, config.maxDelay);
    
    // 添加随机抖动
    if (config.jitter) {
      const jitterRange = delay * 0.1;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }
    
    return Math.max(0, delay);
  }

  /**
   * 执行恢复决策
   */
  private async executeRecoveryDecision(
    decision: RecoveryDecision,
    error: AutoPageBreakError,
    context: RecoveryContext
  ): Promise<boolean> {
    switch (decision.action) {
      case 'retry':
        await this.delay(decision.delay);
        return false; // 表示需要重试，不是立即恢复
        
      case 'degrade':
        return await this.performDegradation(error.type, decision.strategy, context);
        
      case 'abort':
        this.tripCircuitBreaker(error.type);
        return false;
        
      default:
        return false;
    }
  }

  /**
   * 执行降级操作
   */
  private async performDegradation(
    errorType: AutoPageBreakErrorType,
    strategy: string,
    context: RecoveryContext
  ): Promise<boolean> {
    this.performanceMetrics.degradationEvents++;
    this.degradedOperations.add(context.operationId);
    
    const config = this.degradationConfigs.get(errorType);
    if (!config) return false;
    
    try {
      switch (config.strategy) {
        case 'skip':
          console.log(`Skipping operation ${context.operationId} due to repeated failures`);
          return true;
          
        case 'simplify':
          console.log(`Simplifying operation ${context.operationId}`);
          // 这里应该调用简化的算法实现
          return true;
          
        case 'fallback':
          console.log(`Using fallback for operation ${context.operationId}`);
          // 这里应该调用备用方案
          return true;
          
        case 'disable':
          console.log(`Disabling auto page break due to ${errorType}`);
          this.degradedOperations.add('auto_page_break');
          return true;
          
        default:
          return false;
      }
    } catch (degradationError) {
      console.error('Degradation strategy failed:', degradationError);
      return false;
    }
  }

  /**
   * 评估系统健康状况
   */
  private evaluateSystemHealth(systemState: { memoryPressure: number; cpuLoad: number; errorRate: number }): number {
    const memoryScore = Math.max(0, 1 - systemState.memoryPressure);
    const cpuScore = Math.max(0, 1 - systemState.cpuLoad);
    const errorScore = Math.max(0, 1 - systemState.errorRate);
    
    return (memoryScore + cpuScore + errorScore) / 3;
  }

  /**
   * 分析错误模式
   */
  private analyzeErrorPattern(error: AutoPageBreakError): void {
    const errorType = error.type;
    const now = Date.now();
    
    let pattern = this.errorPatterns.get(errorType);
    if (!pattern) {
      pattern = {
        type: errorType,
        frequency: 0,
        consecutiveCount: 0,
        timeWindow: now,
        trend: 'stable'
      };
      this.errorPatterns.set(errorType, pattern);
    }
    
    // 更新频率统计
    const recentErrors = this.errorHistory
      .filter(e => e.type === errorType && now - e.timestamp < this.PATTERN_ANALYSIS_WINDOW)
      .length;
    
    const oldFrequency = pattern.frequency;
    pattern.frequency = (recentErrors / this.PATTERN_ANALYSIS_WINDOW) * 60000; // 转换为每分钟
    
    // 分析趋势
    if (pattern.frequency > oldFrequency * 1.2) {
      pattern.trend = 'increasing';
    } else if (pattern.frequency < oldFrequency * 0.8) {
      pattern.trend = 'decreasing';
    } else {
      pattern.trend = 'stable';
    }
    
    // 更新连续计数
    const lastErrors = this.errorHistory.slice(-5);
    pattern.consecutiveCount = 0;
    for (let i = lastErrors.length - 1; i >= 0; i--) {
      if (lastErrors[i].type === errorType) {
        pattern.consecutiveCount++;
      } else {
        break;
      }
    }
  }

  /**
   * 获取连续失败次数
   */
  private getConsecutiveFailures(errorType: AutoPageBreakErrorType): number {
    const pattern = this.errorPatterns.get(errorType);
    return pattern?.consecutiveCount || 0;
  }

  /**
   * 检查熔断器状态
   */
  private isCircuitBreakerOpen(errorType: AutoPageBreakErrorType): boolean {
    const breaker = this.circuitBreakers.get(errorType);
    if (!breaker) return false;
    
    if (breaker.isOpen) {
      const config = this.retryConfigs.get(errorType);
      const cooldownPeriod = config?.maxDelay || 30000; // 默认30秒
      
      if (Date.now() - breaker.lastTrip > cooldownPeriod) {
        // 冷却期结束，半开状态
        breaker.isOpen = false;
        breaker.failureCount = 0;
        return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * 触发熔断器
   */
  private tripCircuitBreaker(errorType: AutoPageBreakErrorType): void {
    let breaker = this.circuitBreakers.get(errorType);
    if (!breaker) {
      breaker = { isOpen: false, lastTrip: 0, failureCount: 0 };
      this.circuitBreakers.set(errorType, breaker);
    }
    
    breaker.failureCount++;
    const config = this.retryConfigs.get(errorType);
    const threshold = config?.circuitBreakerThreshold || 5;
    
    if (breaker.failureCount >= threshold) {
      breaker.isOpen = true;
      breaker.lastTrip = Date.now();
      console.warn(`Circuit breaker opened for ${errorType} after ${breaker.failureCount} failures`);
    }
  }

  /**
   * 检查是否可以降级
   */
  private canDegrade(errorType: AutoPageBreakErrorType): boolean {
    const config = this.degradationConfigs.get(errorType);
    return config !== undefined && !this.degradedOperations.has(errorType);
  }

  /**
   * Fibonacci数列计算
   */
  private fibonacci(n: number): number {
    if (n <= 1) return 1;
    if (n === 2) return 1;
    
    let a = 1, b = 1;
    for (let i = 3; i <= n; i++) {
      const temp = a + b;
      a = b;
      b = temp;
    }
    return b;
  }

  /**
   * 标准化错误对象
   */
  private normalizeError(error: Error | AutoPageBreakError, context: RecoveryContext): AutoPageBreakError {
    if (error instanceof AutoPageBreakError) {
      return error;
    }

    // 智能错误类型识别
    let errorType = AutoPageBreakErrorType.UNKNOWN_ERROR;
    let severity = ErrorSeverity.MEDIUM;

    const message = error.message.toLowerCase();
    
    if (message.includes('boundary') || message.includes('check')) {
      errorType = AutoPageBreakErrorType.INPUT_DETECTION_FAILED;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('height') || message.includes('measure')) {
      errorType = AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED;
      severity = ErrorSeverity.MEDIUM;
    } else if (message.includes('truncat')) {
      errorType = AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('page') || message.includes('create')) {
      errorType = AutoPageBreakErrorType.PAGE_CREATION_FAILED;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('transaction')) {
      errorType = AutoPageBreakErrorType.TRANSACTION_FAILED;
      severity = ErrorSeverity.CRITICAL;
    }

    return new AutoPageBreakError(
      errorType,
      error.message,
      severity,
      { originalError: error, context },
      true
    );
  }

  /**
   * 记录错误
   */
  private recordError(error: AutoPageBreakError): void {
    this.errorHistory.push(error);
    
    // 限制历史大小
    if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_ERROR_HISTORY);
    }
  }

  /**
   * 更新恢复指标
   */
  private updateRecoveryMetrics(recoveryTime: number): void {
    const alpha = 0.1; // 指数移动平均权重
    this.performanceMetrics.averageRecoveryTime = 
      this.performanceMetrics.averageRecoveryTime * (1 - alpha) + recoveryTime * alpha;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 初始化默认配置
   */
  private initializeDefaultConfigs(): void {
    // 输入检测失败的重试配置
    this.retryConfigs.set(AutoPageBreakErrorType.INPUT_DETECTION_FAILED, {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffStrategy: 'exponential',
      jitter: true,
      circuitBreakerThreshold: 5,
      adaptiveRatio: 0.2
    });

    // 高度计算失败的重试配置
    this.retryConfigs.set(AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED, {
      maxAttempts: 2,
      baseDelay: 200,
      maxDelay: 2000,
      backoffStrategy: 'adaptive',
      jitter: true,
      circuitBreakerThreshold: 3,
      adaptiveRatio: 0.3
    });

    // 内容截断失败的重试配置
    this.retryConfigs.set(AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED, {
      maxAttempts: 1,
      baseDelay: 300,
      maxDelay: 1500,
      backoffStrategy: 'linear',
      jitter: false,
      circuitBreakerThreshold: 2,
      adaptiveRatio: 0.1
    });

    // 降级配置
    this.degradationConfigs.set(AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED, {
      strategy: 'simplify',
      fallbackOptions: ['Use simplified measurement', 'Skip accurate calculations'],
      recoveryTimeout: 30000,
      autoReenableDelay: 300000
    });

    this.degradationConfigs.set(AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED, {
      strategy: 'fallback',
      fallbackOptions: ['Use conservative truncation', 'Skip complex algorithms'],
      recoveryTimeout: 15000,
      autoReenableDelay: 180000
    });
  }

  /**
   * 启动后台任务
   */
  private startBackgroundTasks(): void {
    // 定期检查恢复条件
    setInterval(() => {
      this.checkRecoveryConditions();
    }, 60000); // 每分钟检查一次

    // 定期清理过期数据
    setInterval(() => {
      this.cleanupExpiredData();
    }, 300000); // 每5分钟清理一次
  }

  /**
   * 检查恢复条件
   */
  private checkRecoveryConditions(): void {
    const now = Date.now();
    
    // 检查是否可以重新启用降级的操作
    for (const [errorType, config] of this.degradationConfigs) {
      if (this.degradedOperations.has(errorType)) {
        const lastError = this.errorHistory
          .filter(e => e.type === errorType)
          .pop();
        
        if (lastError && now - lastError.timestamp > config.autoReenableDelay) {
          this.degradedOperations.delete(errorType);
          console.log(`Re-enabled operation for ${errorType} after recovery period`);
        }
      }
    }
  }

  /**
   * 清理过期数据
   */
  private cleanupExpiredData(): void {
    const now = Date.now();
    const retentionPeriod = 3600000; // 1小时
    
    // 清理过期错误历史
    this.errorHistory = this.errorHistory.filter(
      error => now - error.timestamp < retentionPeriod
    );
    
    // 重置熔断器（如果长时间没有错误）
    for (const [errorType, breaker] of this.circuitBreakers) {
      if (breaker.isOpen && now - breaker.lastTrip > retentionPeriod) {
        breaker.isOpen = false;
        breaker.failureCount = 0;
        console.log(`Reset circuit breaker for ${errorType} after extended cool-down`);
      }
    }
  }

  /**
   * 获取错误恢复统计
   */
  getRecoveryStatistics(): {
    performance: typeof this.performanceMetrics;
    errorPatterns: Map<AutoPageBreakErrorType, ErrorPattern>;
    circuitBreakers: Map<AutoPageBreakErrorType, { isOpen: boolean; failureCount: number }>;
    degradedOperations: string[];
  } {
    return {
      performance: { ...this.performanceMetrics },
      errorPatterns: new Map(this.errorPatterns),
      circuitBreakers: new Map(
        Array.from(this.circuitBreakers.entries()).map(([type, breaker]) => [
          type,
          { isOpen: breaker.isOpen, failureCount: breaker.failureCount }
        ])
      ),
      degradedOperations: Array.from(this.degradedOperations)
    };
  }

  /**
   * 重置恢复状态
   */
  resetRecoveryState(): void {
    this.errorHistory = [];
    this.errorPatterns.clear();
    this.circuitBreakers.clear();
    this.degradedOperations.clear();
    this.recoveryStats.clear();
    
    this.performanceMetrics = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      averageRecoveryTime: 0,
      degradationEvents: 0
    };
    
    console.log('Error recovery state has been reset');
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.resetRecoveryState();
  }
}

/**
 * 创建增强版错误恢复管理器
 */
export function createEnhancedErrorRecoveryManager(
  editor: Editor,
  eventManager: AutoPageBreakEventManager
): EnhancedErrorRecoveryManager {
  return new EnhancedErrorRecoveryManager(editor, eventManager);
}