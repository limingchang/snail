import { Editor } from "@tiptap/core";
import { AutoPageBreakErrorType, ErrorSeverity } from "./errorRecoveryManager";
import { TruncationAlgorithm } from "./enhancedContentTruncator";
import { SmartRetryConfig, DegradationConfig } from "./enhancedErrorRecoveryManager";

/**
 * 错误恢复配置接口
 */
export interface ErrorRecoveryConfiguration {
  // 重试策略配置
  retryStrategies: Record<AutoPageBreakErrorType, SmartRetryConfig>;
  
  // 降级策略配置
  degradationStrategies: Record<AutoPageBreakErrorType, DegradationConfig>;
  
  // 边界检查配置
  boundaryCheck: {
    enabled: boolean;
    cacheEnabled: boolean;
    cacheDuration: number;
    timeoutThreshold: number;
    skipOnCriticalErrors: boolean;
  };
  
  // 内容截断配置
  contentTruncation: {
    defaultAlgorithm: TruncationAlgorithm;
    fallbackChain: TruncationAlgorithm[];
    maxExecutionTime: number;
    accuracyThreshold: number;
    preserveWords: boolean;
    preserveParagraphs: boolean;
  };
  
  // 监控配置
  monitoring: {
    enabled: boolean;
    realTimeMetrics: boolean;
    performanceSampling: boolean;
    diagnosticReporting: boolean;
    alertsEnabled: boolean;
    dataRetentionPeriod: number;
  };
  
  // 性能优化配置
  performance: {
    enableVirtualMeasurement: boolean;
    measurementCacheSize: number;
    debounceDelay: number;
    batchOperations: boolean;
    maxConcurrentOperations: number;
  };
  
  // 用户体验配置
  userExperience: {
    showErrorNotifications: boolean;
    notificationLevel: 'silent' | 'minimal' | 'normal' | 'verbose';
    autoRecoveryEnabled: boolean;
    gracefulDegradation: boolean;
    userControlEnabled: boolean;
  };
}

/**
 * 运行时配置管理器
 */
export class ErrorRecoveryConfigManager {
  private editor: Editor;
  private config: ErrorRecoveryConfiguration;
  private configHistory: ErrorRecoveryConfiguration[] = [];
  private watchers: Set<(config: ErrorRecoveryConfiguration) => void> = new Set();
  private readonly MAX_HISTORY = 10;
  
  constructor(editor: Editor, initialConfig?: Partial<ErrorRecoveryConfiguration>) {
    this.editor = editor;
    this.config = this.mergeWithDefaults(initialConfig || {});
    this.validateConfiguration(this.config);
  }

  /**
   * 获取当前配置
   */
  getConfiguration(): ErrorRecoveryConfiguration {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 更新配置
   */
  updateConfiguration(updates: Partial<ErrorRecoveryConfiguration>): void {
    // 保存当前配置到历史
    this.saveToHistory();
    
    // 合并新配置
    const newConfig = this.deepMerge(this.config, updates);
    
    // 验证新配置
    this.validateConfiguration(newConfig);
    
    // 应用新配置
    this.config = newConfig;
    
    // 通知观察者
    this.notifyWatchers();
    
    console.log('Error recovery configuration updated');
  }

  /**
   * 重置配置到默认值
   */
  resetToDefaults(): void {
    this.saveToHistory();
    this.config = this.getDefaultConfiguration();
    this.notifyWatchers();
    console.log('Error recovery configuration reset to defaults');
  }

  /**
   * 恢复到上一个配置
   */
  restorePrevious(): boolean {
    if (this.configHistory.length === 0) {
      console.warn('No previous configuration to restore');
      return false;
    }
    
    const previousConfig = this.configHistory.pop()!;
    this.config = previousConfig;
    this.notifyWatchers();
    
    console.log('Restored to previous configuration');
    return true;
  }

  /**
   * 获取特定错误类型的重试配置
   */
  getRetryConfig(errorType: AutoPageBreakErrorType): SmartRetryConfig {
    return this.config.retryStrategies[errorType] || this.getDefaultRetryConfig();
  }

  /**
   * 获取特定错误类型的降级配置
   */
  getDegradationConfig(errorType: AutoPageBreakErrorType): DegradationConfig | undefined {
    return this.config.degradationStrategies[errorType];
  }

  /**
   * 更新特定错误类型的重试配置
   */
  updateRetryConfig(errorType: AutoPageBreakErrorType, config: SmartRetryConfig): void {
    this.updateConfiguration({
      retryStrategies: {
        ...this.config.retryStrategies,
        [errorType]: config
      }
    });
  }

  /**
   * 更新特定错误类型的降级配置
   */
  updateDegradationConfig(errorType: AutoPageBreakErrorType, config: DegradationConfig): void {
    this.updateConfiguration({
      degradationStrategies: {
        ...this.config.degradationStrategies,
        [errorType]: config
      }
    });
  }

  /**
   * 启用/禁用监控
   */
  setMonitoringEnabled(enabled: boolean): void {
    this.updateConfiguration({
      monitoring: {
        ...this.config.monitoring,
        enabled
      }
    });
  }

  /**
   * 设置用户体验级别
   */
  setUserExperienceLevel(level: 'silent' | 'minimal' | 'normal' | 'verbose'): void {
    this.updateConfiguration({
      userExperience: {
        ...this.config.userExperience,
        notificationLevel: level
      }
    });
  }

  /**
   * 注册配置变更观察者
   */
  addConfigWatcher(callback: (config: ErrorRecoveryConfiguration) => void): () => void {
    this.watchers.add(callback);
    
    // 返回取消监听的函数
    return () => {
      this.watchers.delete(callback);
    };
  }

  /**
   * 导出配置
   */
  exportConfiguration(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导入配置
   */
  importConfiguration(configJson: string): boolean {
    try {
      const importedConfig = JSON.parse(configJson);
      this.validateConfiguration(importedConfig);
      
      this.saveToHistory();
      this.config = importedConfig;
      this.notifyWatchers();
      
      console.log('Configuration imported successfully');
      return true;
    } catch (error) {
      console.error('Failed to import configuration:', error);
      return false;
    }
  }

  /**
   * 获取配置历史
   */
  getConfigurationHistory(): ErrorRecoveryConfiguration[] {
    return [...this.configHistory];
  }

  /**
   * 验证配置
   */
  private validateConfiguration(config: ErrorRecoveryConfiguration): void {
    // 验证重试策略
    for (const [errorType, retryConfig] of Object.entries(config.retryStrategies)) {
      if (retryConfig.maxAttempts < 0 || retryConfig.maxAttempts > 10) {
        throw new Error(`Invalid maxAttempts for ${errorType}: must be between 0 and 10`);
      }
      
      if (retryConfig.baseDelay < 0 || retryConfig.baseDelay > 10000) {
        throw new Error(`Invalid baseDelay for ${errorType}: must be between 0 and 10000ms`);
      }
      
      if (retryConfig.maxDelay < retryConfig.baseDelay) {
        throw new Error(`Invalid maxDelay for ${errorType}: must be greater than baseDelay`);
      }
    }
    
    // 验证监控配置
    if (config.monitoring.dataRetentionPeriod < 3600000) { // 至少1小时
      throw new Error('Data retention period must be at least 1 hour');
    }
    
    // 验证性能配置
    if (config.performance.measurementCacheSize < 10 || config.performance.measurementCacheSize > 1000) {
      throw new Error('Measurement cache size must be between 10 and 1000');
    }
    
    // 验证内容截断配置
    if (config.contentTruncation.maxExecutionTime < 100 || config.contentTruncation.maxExecutionTime > 5000) {
      throw new Error('Max execution time must be between 100ms and 5000ms');
    }
    
    if (config.contentTruncation.accuracyThreshold < 0 || config.contentTruncation.accuracyThreshold > 1) {
      throw new Error('Accuracy threshold must be between 0 and 1');
    }
  }

  /**
   * 合并配置与默认值
   */
  private mergeWithDefaults(config: Partial<ErrorRecoveryConfiguration>): ErrorRecoveryConfiguration {
    const defaultConfig = this.getDefaultConfiguration();
    return this.deepMerge(defaultConfig, config);
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 保存到历史
   */
  private saveToHistory(): void {
    this.configHistory.push(JSON.parse(JSON.stringify(this.config)));
    
    // 限制历史大小
    if (this.configHistory.length > this.MAX_HISTORY) {
      this.configHistory = this.configHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * 通知观察者
   */
  private notifyWatchers(): void {
    const configCopy = this.getConfiguration();
    this.watchers.forEach(callback => {
      try {
        callback(configCopy);
      } catch (error) {
        console.error('Error in config watcher:', error);
      }
    });
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfiguration(): ErrorRecoveryConfiguration {
    return {
      retryStrategies: {
        [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: {
          maxAttempts: 3,
          baseDelay: 100,
          maxDelay: 1000,
          backoffStrategy: 'exponential',
          jitter: true,
          circuitBreakerThreshold: 5,
          adaptiveRatio: 0.2
        },
        [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: {
          maxAttempts: 2,
          baseDelay: 200,
          maxDelay: 2000,
          backoffStrategy: 'adaptive',
          jitter: true,
          circuitBreakerThreshold: 3,
          adaptiveRatio: 0.3
        },
        [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: {
          maxAttempts: 1,
          baseDelay: 300,
          maxDelay: 1500,
          backoffStrategy: 'linear',
          jitter: false,
          circuitBreakerThreshold: 2,
          adaptiveRatio: 0.1
        },
        [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: {
          maxAttempts: 2,
          baseDelay: 150,
          maxDelay: 1200,
          backoffStrategy: 'exponential',
          jitter: true,
          circuitBreakerThreshold: 3,
          adaptiveRatio: 0.25
        },
        [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: {
          maxAttempts: 3,
          baseDelay: 100,
          maxDelay: 800,
          backoffStrategy: 'linear',
          jitter: false,
          circuitBreakerThreshold: 4,
          adaptiveRatio: 0.15
        },
        [AutoPageBreakErrorType.TRANSACTION_FAILED]: {
          maxAttempts: 1,
          baseDelay: 500,
          maxDelay: 2000,
          backoffStrategy: 'exponential',
          jitter: true,
          circuitBreakerThreshold: 2,
          adaptiveRatio: 0.4
        },
        [AutoPageBreakErrorType.CONFIGURATION_ERROR]: {
          maxAttempts: 0, // 配置错误不重试
          baseDelay: 0,
          maxDelay: 0,
          backoffStrategy: 'linear',
          jitter: false,
          circuitBreakerThreshold: 1,
          adaptiveRatio: 0
        },
        [AutoPageBreakErrorType.UNKNOWN_ERROR]: {
          maxAttempts: 1,
          baseDelay: 200,
          maxDelay: 1000,
          backoffStrategy: 'linear',
          jitter: true,
          circuitBreakerThreshold: 3,
          adaptiveRatio: 0.2
        }
      },
      
      degradationStrategies: {
        [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: {
          strategy: 'simplify',
          fallbackOptions: ['Use simplified measurement', 'Skip accurate calculations'],
          recoveryTimeout: 30000,
          autoReenableDelay: 300000
        },
        [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: {
          strategy: 'fallback',
          fallbackOptions: ['Use conservative truncation', 'Skip complex algorithms'],
          recoveryTimeout: 15000,
          autoReenableDelay: 180000
        },
        [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: {
          strategy: 'skip',
          fallbackOptions: ['Skip current page break', 'Continue editing'],
          recoveryTimeout: 10000,
          autoReenableDelay: 120000
        },
        [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: {
          strategy: 'fallback',
          fallbackOptions: ['Use virtual operations', 'Defer DOM updates'],
          recoveryTimeout: 20000,
          autoReenableDelay: 240000
        },
        [AutoPageBreakErrorType.TRANSACTION_FAILED]: {
          strategy: 'disable',
          fallbackOptions: ['Disable auto page break', 'Manual mode only'],
          recoveryTimeout: 5000,
          autoReenableDelay: 600000
        },
        [AutoPageBreakErrorType.CONFIGURATION_ERROR]: {
          strategy: 'fallback',
          fallbackOptions: ['Use default configuration', 'Reset to safe mode'],
          recoveryTimeout: 0,
          autoReenableDelay: 0
        },
        [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: {
          strategy: 'simplify',
          fallbackOptions: ['Use basic input detection', 'Skip composition events'],
          recoveryTimeout: 25000,
          autoReenableDelay: 200000
        },
        [AutoPageBreakErrorType.UNKNOWN_ERROR]: {
          strategy: 'skip',
          fallbackOptions: ['Skip unknown operations', 'Log for analysis'],
          recoveryTimeout: 15000,
          autoReenableDelay: 300000
        }
      },
      
      boundaryCheck: {
        enabled: true,
        cacheEnabled: true,
        cacheDuration: 1000,
        timeoutThreshold: 5000,
        skipOnCriticalErrors: true
      },
      
      contentTruncation: {
        defaultAlgorithm: TruncationAlgorithm.PRECISE,
        fallbackChain: [TruncationAlgorithm.FAST, TruncationAlgorithm.CONSERVATIVE],
        maxExecutionTime: 500,
        accuracyThreshold: 0.8,
        preserveWords: true,
        preserveParagraphs: false
      },
      
      monitoring: {
        enabled: true,
        realTimeMetrics: true,
        performanceSampling: true,
        diagnosticReporting: true,
        alertsEnabled: true,
        dataRetentionPeriod: 24 * 3600000 // 24小时
      },
      
      performance: {
        enableVirtualMeasurement: true,
        measurementCacheSize: 100,
        debounceDelay: 100,
        batchOperations: true,
        maxConcurrentOperations: 3
      },
      
      userExperience: {
        showErrorNotifications: true,
        notificationLevel: 'normal',
        autoRecoveryEnabled: true,
        gracefulDegradation: true,
        userControlEnabled: true
      }
    };
  }

  /**
   * 获取默认重试配置
   */
  private getDefaultRetryConfig(): SmartRetryConfig {
    return {
      maxAttempts: 1,
      baseDelay: 200,
      maxDelay: 1000,
      backoffStrategy: 'linear',
      jitter: true,
      circuitBreakerThreshold: 3,
      adaptiveRatio: 0.2
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.watchers.clear();
    this.configHistory = [];
  }
}

/**
 * 运行时监控系统
 */
export class RuntimeMonitoringSystem {
  private configManager: ErrorRecoveryConfigManager;
  private systemMetrics: {
    uptime: number;
    memoryUsage: number;
    errorRate: number;
    lastUpdate: number;
  };
  
  private healthChecks: Map<string, () => boolean> = new Map();
  private performanceCounters: Map<string, { count: number; totalTime: number }> = new Map();
  private isMonitoring: boolean = false;
  private monitoringInterval?: number;

  constructor(configManager: ErrorRecoveryConfigManager) {
    this.configManager = configManager;
    this.systemMetrics = {
      uptime: Date.now(),
      memoryUsage: 0,
      errorRate: 0,
      lastUpdate: Date.now()
    };
    
    this.initializeHealthChecks();
  }

  /**
   * 开始运行时监控
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('Runtime monitoring system started');
    
    // 每30秒更新一次系统指标
    this.monitoringInterval = window.setInterval(() => {
      this.updateSystemMetrics();
      this.performHealthChecks();
    }, 30000);
    
    // 立即执行一次
    this.updateSystemMetrics();
  }

  /**
   * 停止运行时监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    console.log('Runtime monitoring system stopped');
  }

  /**
   * 获取系统状态
   */
  getSystemStatus(): {
    healthy: boolean;
    uptime: number;
    metrics: typeof this.systemMetrics;
    healthChecks: Record<string, boolean>;
    performanceCounters: Record<string, { averageTime: number; totalCalls: number }>;
  } {
    const healthResults: Record<string, boolean> = {};
    let allHealthy = true;
    
    for (const [name, check] of this.healthChecks) {
      try {
        const result = check();
        healthResults[name] = result;
        if (!result) allHealthy = false;
      } catch (error) {
        healthResults[name] = false;
        allHealthy = false;
        console.error(`Health check ${name} failed:`, error);
      }
    }
    
    const performanceData: Record<string, { averageTime: number; totalCalls: number }> = {};
    for (const [name, counter] of this.performanceCounters) {
      performanceData[name] = {
        averageTime: counter.count > 0 ? counter.totalTime / counter.count : 0,
        totalCalls: counter.count
      };
    }
    
    return {
      healthy: allHealthy,
      uptime: Date.now() - this.systemMetrics.uptime,
      metrics: { ...this.systemMetrics },
      healthChecks: healthResults,
      performanceCounters: performanceData
    };
  }

  /**
   * 添加性能计数器
   */
  addPerformanceCounter(name: string): void {
    if (!this.performanceCounters.has(name)) {
      this.performanceCounters.set(name, { count: 0, totalTime: 0 });
    }
  }

  /**
   * 记录性能数据
   */
  recordPerformance(name: string, duration: number): void {
    const counter = this.performanceCounters.get(name);
    if (counter) {
      counter.count++;
      counter.totalTime += duration;
    } else {
      this.performanceCounters.set(name, { count: 1, totalTime: duration });
    }
  }

  /**
   * 添加健康检查
   */
  addHealthCheck(name: string, check: () => boolean): void {
    this.healthChecks.set(name, check);
  }

  /**
   * 移除健康检查
   */
  removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  /**
   * 获取配置建议
   */
  getConfigurationRecommendations(): string[] {
    const recommendations: string[] = [];
    const config = this.configManager.getConfiguration();
    const status = this.getSystemStatus();
    
    // 基于系统状态提供建议
    if (!status.healthy) {
      recommendations.push('System health issues detected - consider enabling graceful degradation');
    }
    
    if (status.metrics.errorRate > 0.1) {
      recommendations.push('High error rate detected - consider adjusting retry strategies');
    }
    
    if (status.metrics.memoryUsage > 0.8) {
      recommendations.push('High memory usage - consider reducing cache sizes or enabling cleanup');
    }
    
    // 基于性能数据提供建议
    for (const [operation, perf] of Object.entries(status.performanceCounters)) {
      if (perf.averageTime > 500) {
        recommendations.push(`High latency for ${operation} - consider optimizing or enabling caching`);
      }
    }
    
    // 基于配置提供建议
    if (!config.monitoring.enabled) {
      recommendations.push('Monitoring is disabled - enable for better error recovery insights');
    }
    
    if (config.userExperience.notificationLevel === 'verbose') {
      recommendations.push('Verbose notifications may impact user experience - consider reducing level');
    }
    
    return recommendations;
  }

  /**
   * 自动调优配置
   */
  autoTuneConfiguration(): boolean {
    const status = this.getSystemStatus();
    const config = this.configManager.getConfiguration();
    let tuned = false;
    
    // 基于错误率调整重试策略
    if (status.metrics.errorRate > 0.2) {
      // 错误率过高，减少重试次数
      const newRetryStrategies = { ...config.retryStrategies };
      
      for (const errorType of Object.keys(newRetryStrategies)) {
        const strategy = newRetryStrategies[errorType as AutoPageBreakErrorType];
        if (strategy.maxAttempts > 1) {
          strategy.maxAttempts = Math.max(1, strategy.maxAttempts - 1);
          tuned = true;
        }
      }
      
      if (tuned) {
        this.configManager.updateConfiguration({ retryStrategies: newRetryStrategies });
        console.log('Auto-tuned: Reduced retry attempts due to high error rate');
      }
    }
    
    // 基于内存使用调整缓存
    if (status.metrics.memoryUsage > 0.85) {
      this.configManager.updateConfiguration({
        performance: {
          ...config.performance,
          measurementCacheSize: Math.max(10, Math.floor(config.performance.measurementCacheSize * 0.7))
        }
      });
      tuned = true;
      console.log('Auto-tuned: Reduced cache size due to high memory usage');
    }
    
    // 基于性能调整超时
    const avgResponseTime = Object.values(status.performanceCounters)
      .reduce((sum, perf) => sum + perf.averageTime, 0) / Object.keys(status.performanceCounters).length;
    
    if (avgResponseTime > 800 && config.contentTruncation.maxExecutionTime < 1000) {
      this.configManager.updateConfiguration({
        contentTruncation: {
          ...config.contentTruncation,
          maxExecutionTime: Math.min(1000, config.contentTruncation.maxExecutionTime + 200)
        }
      });
      tuned = true;
      console.log('Auto-tuned: Increased execution timeout due to slow performance');
    }
    
    return tuned;
  }

  /**
   * 更新系统指标
   */
  private updateSystemMetrics(): void {
    // 更新内存使用率
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.systemMetrics.memoryUsage = memory.usedJSHeapSize / memory.totalJSHeapSize;
    }
    
    // 更新错误率（简化计算）
    const errorCounters = Array.from(this.performanceCounters.values());
    const totalOperations = errorCounters.reduce((sum, counter) => sum + counter.count, 0);
    // 这里应该有实际的错误计数逻辑
    this.systemMetrics.errorRate = 0; // 简化为0
    
    this.systemMetrics.lastUpdate = Date.now();
  }

  /**
   * 执行健康检查
   */
  private performHealthChecks(): void {
    const failedChecks: string[] = [];
    
    for (const [name, check] of this.healthChecks) {
      try {
        if (!check()) {
          failedChecks.push(name);
        }
      } catch (error) {
        failedChecks.push(name);
        console.error(`Health check ${name} failed:`, error);
      }
    }
    
    if (failedChecks.length > 0) {
      console.warn(`Health check failures: ${failedChecks.join(', ')}`);
    }
  }

  /**
   * 初始化健康检查
   */
  private initializeHealthChecks(): void {
    // 内存健康检查
    this.addHealthCheck('memory', () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        return memory.usedJSHeapSize / memory.totalJSHeapSize < 0.9;
      }
      return true;
    });
    
    // 配置健康检查
    this.addHealthCheck('configuration', () => {
      try {
        const config = this.configManager.getConfiguration();
        return config.monitoring.enabled === true || config.monitoring.enabled === false; // 简单验证
      } catch {
        return false;
      }
    });
    
    // 性能健康检查
    this.addHealthCheck('performance', () => {
      const avgTimes = Array.from(this.performanceCounters.values())
        .map(counter => counter.count > 0 ? counter.totalTime / counter.count : 0);
      
      return avgTimes.length === 0 || Math.max(...avgTimes) < 2000; // 2秒以内
    });
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopMonitoring();
    this.healthChecks.clear();
    this.performanceCounters.clear();
  }
}

/**
 * 创建错误恢复配置管理器
 */
export function createErrorRecoveryConfigManager(
  editor: Editor,
  initialConfig?: Partial<ErrorRecoveryConfiguration>
): ErrorRecoveryConfigManager {
  return new ErrorRecoveryConfigManager(editor, initialConfig);
}

/**
 * 创建运行时监控系统
 */
export function createRuntimeMonitoringSystem(
  configManager: ErrorRecoveryConfigManager
): RuntimeMonitoringSystem {
  return new RuntimeMonitoringSystem(configManager);
}