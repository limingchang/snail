import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

// 导入所有增强的错误恢复组件
import { AutoPageBreakEventManager } from "./eventManager";
import { 
  EnhancedContentTruncator, 
  EnhancedTruncationOptions,
  TruncationAlgorithm
} from "./enhancedContentTruncator";
import { 
  EnhancedErrorRecoveryManager,
  RecoveryContext,
  RecoveryDecision
} from "./enhancedErrorRecoveryManager";
import { 
  ErrorMonitoringDiagnostics,
  DiagnosticReport,
  MonitoringMetrics
} from "./errorMonitoringDiagnostics";
import { 
  ErrorRecoveryConfigManager,
  RuntimeMonitoringSystem,
  ErrorRecoveryConfiguration
} from "./errorRecoveryConfig";
import { 
  UserExperienceOptimizer,
  UserNotification,
  StatusIndicator,
  NotificationLevel
} from "./userExperienceOptimizer";
import { 
  AutoPageBreakError, 
  AutoPageBreakErrorType, 
  ErrorSeverity 
} from "./errorRecoveryManager";

/**
 * 增强版错误恢复系统配置
 */
export interface EnhancedErrorRecoverySystemConfig {
  // 基础配置
  enabled: boolean;
  autoStart: boolean;
  
  // 组件启用配置
  enableEnhancedTruncation: boolean;
  enableSmartRetry: boolean;
  enableMonitoring: boolean;
  enableUserExperience: boolean;
  enableRuntimeConfig: boolean;
  
  // 初始配置
  initialConfig?: Partial<ErrorRecoveryConfiguration>;
  
  // 回调配置
  onSystemReady?: () => void;
  onErrorRecovered?: (error: AutoPageBreakError, decision: RecoveryDecision) => void;
  onSystemDegraded?: (errorType: AutoPageBreakErrorType, strategy: string) => void;
  onUserNotification?: (notification: UserNotification) => void;
}

/**
 * 系统状态接口
 */
export interface SystemStatus {
  initialized: boolean;
  healthy: boolean;
  monitoring: boolean;
  degradedOperations: string[];
  lastUpdate: number;
  
  metrics: MonitoringMetrics;
  diagnostic: DiagnosticReport;
  userStatus: StatusIndicator;
  
  components: {
    truncator: boolean;
    recoveryManager: boolean;
    monitoring: boolean;
    config: boolean;
    userExperience: boolean;
  };
}

/**
 * 增强版错误恢复系统
 * 
 * 这是一个集成的错误恢复系统，包含了所有增强功能：
 * - 分级边界检查和容错机制
 * - 多算法内容截断和失败检测切换
 * - 智能重试和降级策略
 * - 实时错误监控和诊断工具
 * - 配置管理和运行时监控
 * - 用户体验优化和错误提示
 */
export class EnhancedErrorRecoverySystem {
  private editor: Editor;
  private config: EnhancedErrorRecoverySystemConfig;
  
  // 核心组件
  private eventManager: AutoPageBreakEventManager;
  private contentTruncator: EnhancedContentTruncator;
  private recoveryManager: EnhancedErrorRecoveryManager;
  private monitoring: ErrorMonitoringDiagnostics;
  private configManager: ErrorRecoveryConfigManager;
  private runtimeMonitoring: RuntimeMonitoringSystem;
  private userExperience: UserExperienceOptimizer;
  
  // 状态管理
  private initialized: boolean = false;
  private systemHealthy: boolean = true;
  private activeOperations: Set<string> = new Set();
  
  // 性能统计
  private systemMetrics: {
    totalOperations: number;
    successfulOperations: number;
    recoveredOperations: number;
    degradedOperations: number;
    startTime: number;
  };

  constructor(editor: Editor, config: EnhancedErrorRecoverySystemConfig) {
    this.editor = editor;
    this.config = { ...this.getDefaultConfig(), ...config };
    
    this.systemMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      recoveredOperations: 0,
      degradedOperations: 0,
      startTime: Date.now()
    };
    
    // 初始化事件管理器（所有组件的基础）
    this.eventManager = new AutoPageBreakEventManager(editor);
    
    this.initializeComponents();
    
    if (this.config.autoStart) {
      this.start();
    }
  }

  /**
   * 启动错误恢复系统
   */
  async start(): Promise<void> {
    if (this.initialized) {
      console.warn('Enhanced error recovery system already started');
      return;
    }

    try {
      console.log('Starting Enhanced Error Recovery System...');
      
      // 启动事件管理器
      this.eventManager.start();
      
      // 启动监控系统
      if (this.config.enableMonitoring && this.monitoring) {
        this.monitoring.startMonitoring();
      }
      
      // 启动运行时监控
      if (this.config.enableRuntimeConfig && this.runtimeMonitoring) {
        this.runtimeMonitoring.startMonitoring();
      }
      
      // 设置系统级事件监听
      this.setupSystemEventListeners();
      
      this.initialized = true;
      console.log('Enhanced Error Recovery System started successfully');
      
      // 触发就绪回调
      if (this.config.onSystemReady) {
        this.config.onSystemReady();
      }
      
    } catch (error) {
      console.error('Failed to start Enhanced Error Recovery System:', error);
      throw error;
    }
  }

  /**
   * 停止错误恢复系统
   */
  async stop(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log('Stopping Enhanced Error Recovery System...');
    
    try {
      // 停止各个组件
      if (this.monitoring) {
        this.monitoring.stopMonitoring();
      }
      
      if (this.runtimeMonitoring) {
        this.runtimeMonitoring.stopMonitoring();
      }
      
      this.eventManager.dispose();
      
      this.initialized = false;
      console.log('Enhanced Error Recovery System stopped');
      
    } catch (error) {
      console.error('Error stopping Enhanced Error Recovery System:', error);
    }
  }

  /**
   * 增强版内容截断
   */
  async truncateContentEnhanced(
    pageContentNode: ProseMirrorNode,
    pageContentPos: number,
    options: EnhancedTruncationOptions
  ) {
    if (!this.config.enableEnhancedTruncation || !this.contentTruncator) {
      throw new Error('Enhanced truncation is not enabled');
    }

    this.systemMetrics.totalOperations++;
    const operationId = `truncate_${Date.now()}`;
    this.activeOperations.add(operationId);

    try {
      const result = await this.contentTruncator.truncateContentEnhanced(
        pageContentNode,
        pageContentPos,
        options
      );

      if (result.success) {
        this.systemMetrics.successfulOperations++;
      }

      // 记录性能数据
      if (this.monitoring) {
        this.monitoring.recordPerformanceSample({
          timestamp: Date.now(),
          operation: 'content_truncation',
          duration: result.executionTime,
          success: result.success,
          errorType: result.success ? undefined : AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED,
          metadata: {
            algorithm: result.algorithmUsed,
            accuracy: result.accuracy,
            status: result.status
          }
        });
      }

      return result;
      
    } catch (error) {
      await this.handleSystemError(error as Error, {
        operationId,
        operation: 'content_truncation',
        pageIndex: pageContentNode.attrs?.index
      });
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * 智能错误处理
   */
  async handleErrorSmart(
    error: Error | AutoPageBreakError,
    context: Partial<RecoveryContext> = {}
  ): Promise<{ recovered: boolean; decision: RecoveryDecision }> {
    if (!this.config.enableSmartRetry || !this.recoveryManager) {
      throw new Error('Smart retry is not enabled');
    }

    this.systemMetrics.totalOperations++;
    
    const fullContext: RecoveryContext = {
      operationId: context.operationId || `recovery_${Date.now()}`,
      pageIndex: context.pageIndex,
      attempt: context.attempt || 1,
      errorHistory: context.errorHistory || [],
      systemState: {
        memoryPressure: this.getMemoryPressure(),
        cpuLoad: this.getCpuLoad(),
        errorRate: this.getErrorRate()
      }
    };

    try {
      const result = await this.recoveryManager.handleErrorSmart(error, fullContext);
      
      if (result.recovered) {
        this.systemMetrics.recoveredOperations++;
        
        if (this.config.onErrorRecovered) {
          const autoError = error instanceof AutoPageBreakError ? error : 
            new AutoPageBreakError(AutoPageBreakErrorType.UNKNOWN_ERROR, error.message);
          this.config.onErrorRecovered(autoError, result.decision);
        }
      }

      return result;
      
    } catch (recoveryError) {
      console.error('Smart error recovery failed:', recoveryError);
      throw recoveryError;
    }
  }

  /**
   * 获取系统状态
   */
  getSystemStatus(): SystemStatus {
    return {
      initialized: this.initialized,
      healthy: this.systemHealthy,
      monitoring: this.monitoring?.getMonitoringStatus().active || false,
      degradedOperations: this.getDegradedOperations(),
      lastUpdate: Date.now(),
      
      metrics: this.monitoring?.getRealTimeMetrics() || this.getEmptyMetrics(),
      diagnostic: this.monitoring?.generateDiagnosticReport() || this.getEmptyDiagnostic(),
      userStatus: this.userExperience?.getCurrentStatus() || this.getEmptyUserStatus(),
      
      components: {
        truncator: !!this.contentTruncator,
        recoveryManager: !!this.recoveryManager,
        monitoring: !!this.monitoring,
        config: !!this.configManager,
        userExperience: !!this.userExperience
      }
    };
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): {
    systemMetrics: typeof this.systemMetrics;
    uptime: number;
    successRate: number;
    recoveryRate: number;
    activeOperations: number;
    algorithmPerformance?: Map<TruncationAlgorithm, any>;
  } {
    const uptime = Date.now() - this.systemMetrics.startTime;
    const totalOps = this.systemMetrics.totalOperations;
    
    return {
      systemMetrics: { ...this.systemMetrics },
      uptime,
      successRate: totalOps > 0 ? this.systemMetrics.successfulOperations / totalOps : 1,
      recoveryRate: totalOps > 0 ? this.systemMetrics.recoveredOperations / totalOps : 0,
      activeOperations: this.activeOperations.size,
      algorithmPerformance: this.contentTruncator?.getPerformanceReport()
    };
  }

  /**
   * 更新配置
   */
  updateConfiguration(updates: Partial<ErrorRecoveryConfiguration>): void {
    if (!this.configManager) {
      throw new Error('Configuration manager is not available');
    }
    
    this.configManager.updateConfiguration(updates);
  }

  /**
   * 设置用户体验级别
   */
  setUserExperienceLevel(level: NotificationLevel): void {
    if (this.userExperience) {
      this.userExperience.updateUserControls({ notificationLevel: level });
    }
    
    if (this.configManager) {
      this.configManager.setUserExperienceLevel(level);
    }
  }

  /**
   * 手动触发系统自检
   */
  async performSystemSelfCheck(): Promise<{
    passed: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // 检查组件状态
    if (!this.initialized) {
      issues.push('System not initialized');
      recommendations.push('Call start() method to initialize the system');
    }
    
    if (this.config.enableEnhancedTruncation && !this.contentTruncator) {
      issues.push('Enhanced truncation enabled but truncator not available');
      recommendations.push('Check truncator initialization');
    }
    
    if (this.config.enableMonitoring && !this.monitoring) {
      issues.push('Monitoring enabled but monitoring component not available');
      recommendations.push('Check monitoring initialization');
    }
    
    // 检查系统健康
    if (this.monitoring) {
      const diagnostic = this.monitoring.generateDiagnosticReport();
      if (diagnostic.summary.overallHealth === 'critical') {
        issues.push('System health is critical');
        recommendations.push(...diagnostic.recommendations);
      }
    }
    
    // 检查内存使用
    const memoryPressure = this.getMemoryPressure();
    if (memoryPressure > 0.9) {
      issues.push(`High memory pressure: ${(memoryPressure * 100).toFixed(1)}%`);
      recommendations.push('Consider reducing cache sizes or enabling cleanup');
    }
    
    return {
      passed: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * 强制重置系统
   */
  async forceReset(): Promise<void> {
    console.log('Performing force reset of Enhanced Error Recovery System...');
    
    try {
      // 停止系统
      await this.stop();
      
      // 清理状态
      this.systemHealthy = true;
      this.activeOperations.clear();
      
      // 重置指标
      this.systemMetrics = {
        totalOperations: 0,
        successfulOperations: 0,
        recoveredOperations: 0,
        degradedOperations: 0,
        startTime: Date.now()
      };
      
      // 重置组件
      if (this.monitoring) {
        this.monitoring.resetMonitoringData();
      }
      
      if (this.recoveryManager) {
        this.recoveryManager.resetRecoveryState();
      }
      
      if (this.configManager) {
        this.configManager.resetToDefaults();
      }
      
      // 重新启动
      await this.start();
      
      console.log('Force reset completed successfully');
      
    } catch (error) {
      console.error('Force reset failed:', error);
      throw error;
    }
  }

  /**
   * 初始化组件
   */
  private initializeComponents(): void {
    try {
      // 初始化配置管理器
      if (this.config.enableRuntimeConfig) {
        this.configManager = new ErrorRecoveryConfigManager(this.editor, this.config.initialConfig);
        this.runtimeMonitoring = new RuntimeMonitoringSystem(this.configManager);
      }
      
      // 初始化内容截断器
      if (this.config.enableEnhancedTruncation) {
        this.contentTruncator = new EnhancedContentTruncator(this.editor);
      }
      
      // 初始化恢复管理器
      if (this.config.enableSmartRetry) {
        this.recoveryManager = new EnhancedErrorRecoveryManager(this.editor, this.eventManager);
      }
      
      // 初始化监控系统
      if (this.config.enableMonitoring) {
        this.monitoring = new ErrorMonitoringDiagnostics(this.editor, this.eventManager);
      }
      
      // 初始化用户体验优化器
      if (this.config.enableUserExperience) {
        this.userExperience = new UserExperienceOptimizer(
          this.editor, 
          this.eventManager, 
          this.configManager?.getConfiguration()
        );
      }
      
    } catch (error) {
      console.error('Component initialization failed:', error);
      throw error;
    }
  }

  /**
   * 设置系统事件监听器
   */
  private setupSystemEventListeners(): void {
    // 监听配置变更
    if (this.configManager) {
      this.configManager.addConfigWatcher((config) => {
        console.log('Configuration updated, applying changes...');
        this.applyConfigurationChanges(config);
      });
    }
    
    // 监听用户通知
    if (this.userExperience && this.config.onUserNotification) {
      this.userExperience.onNotification(this.config.onUserNotification);
    }
    
    // 监听错误事件
    this.eventManager.addEventListener('error_occurred', async (data) => {
      if (data.error instanceof AutoPageBreakError) {
        await this.handleSystemError(data.error, {
          operationId: data.operation || 'unknown',
          operation: data.operation,
          pageIndex: data.pageIndex
        });
      }
    });
  }

  /**
   * 处理系统错误
   */
  private async handleSystemError(
    error: Error,
    context: { operationId: string; operation?: string; pageIndex?: number }
  ): Promise<void> {
    try {
      // 如果启用了智能恢复，尝试恢复
      if (this.config.enableSmartRetry && this.recoveryManager) {
        const recoveryContext: RecoveryContext = {
          operationId: context.operationId,
          pageIndex: context.pageIndex,
          attempt: 1,
          errorHistory: [],
          systemState: {
            memoryPressure: this.getMemoryPressure(),
            cpuLoad: this.getCpuLoad(),
            errorRate: this.getErrorRate()
          }
        };
        
        const result = await this.recoveryManager.handleErrorSmart(error, recoveryContext);
        
        if (result.decision.action === 'degrade') {
          this.systemMetrics.degradedOperations++;
          
          if (this.config.onSystemDegraded) {
            const errorType = error instanceof AutoPageBreakError ? 
              error.type : AutoPageBreakErrorType.UNKNOWN_ERROR;
            this.config.onSystemDegraded(errorType, result.decision.strategy);
          }
        }
      }
      
      // 记录错误到监控系统
      if (this.monitoring && error instanceof AutoPageBreakError) {
        this.monitoring.recordError(error);
      }
      
    } catch (handlingError) {
      console.error('Error handling failed:', handlingError);
      this.systemHealthy = false;
    }
  }

  /**
   * 应用配置变更
   */
  private applyConfigurationChanges(config: ErrorRecoveryConfiguration): void {
    // 更新用户体验设置
    if (this.userExperience) {
      this.userExperience.updateUserControls({
        enableAutoRecovery: config.userExperience.autoRecoveryEnabled,
        enableGracefulDegradation: config.userExperience.gracefulDegradation,
        allowManualOverride: config.userExperience.userControlEnabled,
        notificationLevel: config.userExperience.notificationLevel
      });
    }
    
    // 更新监控设置
    if (this.monitoring) {
      if (config.monitoring.enabled) {
        this.monitoring.startMonitoring();
      } else {
        this.monitoring.stopMonitoring();
      }
    }
  }

  /**
   * 获取降级操作列表
   */
  private getDegradedOperations(): string[] {
    if (!this.recoveryManager) return [];
    
    const stats = this.recoveryManager.getRecoveryStatistics();
    return stats.degradedOperations;
  }

  /**
   * 获取内存压力
   */
  private getMemoryPressure(): number {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize / memory.totalJSHeapSize;
    }
    return 0.5; // 默认值
  }

  /**
   * 获取CPU负载
   */
  private getCpuLoad(): number {
    // 简化实现
    return 0.3;
  }

  /**
   * 获取错误率
   */
  private getErrorRate(): number {
    const total = this.systemMetrics.totalOperations;
    const failed = total - this.systemMetrics.successfulOperations;
    return total > 0 ? failed / total : 0;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): EnhancedErrorRecoverySystemConfig {
    return {
      enabled: true,
      autoStart: true,
      enableEnhancedTruncation: true,
      enableSmartRetry: true,
      enableMonitoring: true,
      enableUserExperience: true,
      enableRuntimeConfig: true
    };
  }

  /**
   * 获取空指标对象
   */
  private getEmptyMetrics(): MonitoringMetrics {
    return {
      errorRate: { current: 0, average: 0, peak: 0, trend: 'stable' },
      performance: { averageResponseTime: 0, p95ResponseTime: 0, throughput: 0, errorCount: 0 },
      systemHealth: { memoryUsage: 0, cpuLoad: 0, operationQueue: 0, lastHealthCheck: Date.now() },
      circuitBreakers: { totalBreakers: 0, openBreakers: 0, halfOpenBreakers: 0 }
    };
  }

  /**
   * 获取空诊断报告
   */
  private getEmptyDiagnostic(): DiagnosticReport {
    return {
      timestamp: Date.now(),
      summary: { overallHealth: 'healthy', healthScore: 100, activeIssues: 0, resolvedIssues: 0 },
      issues: [],
      recommendations: [],
      trends: { errorTrend: 'stable', performanceTrend: 'stable', reliabilityTrend: 'stable' },
      metrics: this.getEmptyMetrics()
    };
  }

  /**
   * 获取空用户状态
   */
  private getEmptyUserStatus(): StatusIndicator {
    return {
      status: 'healthy',
      message: 'All systems operating normally',
      details: [],
      actionRequired: false,
      suggestions: []
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stop();
    
    // 清理组件
    if (this.contentTruncator) {
      this.contentTruncator.dispose();
    }
    
    if (this.recoveryManager) {
      this.recoveryManager.dispose();
    }
    
    if (this.monitoring) {
      this.monitoring.dispose();
    }
    
    if (this.configManager) {
      this.configManager.dispose();
    }
    
    if (this.runtimeMonitoring) {
      this.runtimeMonitoring.dispose();
    }
    
    if (this.userExperience) {
      this.userExperience.dispose();
    }
    
    this.activeOperations.clear();
  }
}

/**
 * 创建增强版错误恢复系统
 */
export function createEnhancedErrorRecoverySystem(
  editor: Editor,
  config: EnhancedErrorRecoverySystemConfig
): EnhancedErrorRecoverySystem {
  return new EnhancedErrorRecoverySystem(editor, config);
}

/**
 * 便捷创建函数 - 使用默认配置
 */
export function createDefaultEnhancedErrorRecoverySystem(
  editor: Editor,
  overrides?: Partial<EnhancedErrorRecoverySystemConfig>
): EnhancedErrorRecoverySystem {
  const defaultConfig: EnhancedErrorRecoverySystemConfig = {
    enabled: true,
    autoStart: true,
    enableEnhancedTruncation: true,
    enableSmartRetry: true,
    enableMonitoring: true,
    enableUserExperience: true,
    enableRuntimeConfig: true
  };
  
  return new EnhancedErrorRecoverySystem(editor, { ...defaultConfig, ...overrides });
}