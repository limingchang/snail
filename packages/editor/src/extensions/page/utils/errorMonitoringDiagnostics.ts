import { Editor } from "@tiptap/core";
import { AutoPageBreakError, AutoPageBreakErrorType, ErrorSeverity } from "./errorRecoveryManager";
import { AutoPageBreakEventManager } from "./eventManager";

/**
 * 监控指标接口
 */
export interface MonitoringMetrics {
  errorRate: {
    current: number;              // 当前错误率（错误/分钟）
    average: number;              // 平均错误率
    peak: number;                 // 峰值错误率
    trend: 'increasing' | 'stable' | 'decreasing';
  };
  
  performance: {
    averageResponseTime: number;   // 平均响应时间(ms)
    p95ResponseTime: number;       // 95%分位响应时间
    throughput: number;            // 吞吐量（操作/秒）
    errorCount: number;            // 错误总数
  };
  
  systemHealth: {
    memoryUsage: number;           // 内存使用率
    cpuLoad: number;               // CPU负载
    operationQueue: number;        // 操作队列长度
    lastHealthCheck: number;       // 最后健康检查时间
  };
  
  circuitBreakers: {
    totalBreakers: number;         // 熔断器总数
    openBreakers: number;          // 打开的熔断器数量
    halfOpenBreakers: number;      // 半开状态的熔断器数量
  };
}

/**
 * 诊断报告接口
 */
export interface DiagnosticReport {
  timestamp: number;
  summary: {
    overallHealth: 'healthy' | 'warning' | 'critical';
    healthScore: number;           // 健康得分 (0-100)
    activeIssues: number;
    resolvedIssues: number;
  };
  
  issues: DiagnosticIssue[];
  recommendations: string[];
  trends: {
    errorTrend: 'improving' | 'stable' | 'degrading';
    performanceTrend: 'improving' | 'stable' | 'degrading';
    reliabilityTrend: 'improving' | 'stable' | 'degrading';
  };
  
  metrics: MonitoringMetrics;
}

/**
 * 诊断问题接口
 */
export interface DiagnosticIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'performance' | 'reliability' | 'resource' | 'configuration';
  title: string;
  description: string;
  impact: string;
  resolution: string[];
  firstDetected: number;
  lastOccurrence: number;
  occurrenceCount: number;
}

/**
 * 性能样本接口
 */
export interface PerformanceSample {
  timestamp: number;
  operation: string;
  duration: number;
  success: boolean;
  errorType?: AutoPageBreakErrorType;
  metadata: Record<string, any>;
}

/**
 * 告警规则接口
 */
export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: MonitoringMetrics) => boolean;
  severity: 'warning' | 'critical';
  cooldown: number;              // 冷却期（避免重复告警）
  enabled: boolean;
  lastTriggered?: number;
}

/**
 * 错误监控和诊断工具类
 */
export class ErrorMonitoringDiagnostics {
  private editor: Editor;
  private eventManager: AutoPageBreakEventManager;
  
  // 数据存储
  private performanceSamples: PerformanceSample[] = [];
  private errorHistory: AutoPageBreakError[] = [];
  private diagnosticIssues: Map<string, DiagnosticIssue> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  
  // 实时指标
  private currentMetrics: MonitoringMetrics;
  private healthScore: number = 100;
  
  // 配置
  private readonly MAX_SAMPLES = 1000;
  private readonly MAX_ERROR_HISTORY = 500;
  private readonly MONITORING_INTERVAL = 30000; // 30秒
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1分钟
  
  // 状态
  private monitoringActive: boolean = false;
  private lastMonitoringCycle: number = 0;
  
  constructor(editor: Editor, eventManager: AutoPageBreakEventManager) {
    this.editor = editor;
    this.eventManager = eventManager;
    
    this.currentMetrics = this.initializeMetrics();
    this.initializeAlertRules();
    this.setupEventListeners();
  }

  /**
   * 开始监控
   */
  startMonitoring(): void {
    if (this.monitoringActive) return;
    
    this.monitoringActive = true;
    console.log('Error monitoring and diagnostics started');
    
    // 启动定期监控任务
    this.scheduleMonitoringTasks();
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    this.monitoringActive = false;
    console.log('Error monitoring and diagnostics stopped');
  }

  /**
   * 记录性能样本
   */
  recordPerformanceSample(sample: PerformanceSample): void {
    this.performanceSamples.push(sample);
    
    // 限制样本数量
    if (this.performanceSamples.length > this.MAX_SAMPLES) {
      this.performanceSamples = this.performanceSamples.slice(-this.MAX_SAMPLES);
    }
    
    // 更新实时指标
    this.updatePerformanceMetrics();
  }

  /**
   * 记录错误
   */
  recordError(error: AutoPageBreakError): void {
    this.errorHistory.push(error);
    
    // 限制错误历史数量
    if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_ERROR_HISTORY);
    }
    
    // 更新错误率指标
    this.updateErrorRateMetrics();
    
    // 分析新错误
    this.analyzeError(error);
  }

  /**
   * 生成诊断报告
   */
  generateDiagnosticReport(): DiagnosticReport {
    const timestamp = Date.now();
    
    // 更新所有指标
    this.updateAllMetrics();
    
    // 计算健康状况
    const overallHealth = this.calculateOverallHealth();
    const healthScore = this.calculateHealthScore();
    
    // 收集问题
    const issues = Array.from(this.diagnosticIssues.values())
      .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
    
    // 生成建议
    const recommendations = this.generateRecommendations(issues);
    
    // 分析趋势
    const trends = this.analyzeTrends();
    
    return {
      timestamp,
      summary: {
        overallHealth,
        healthScore,
        activeIssues: issues.filter(issue => this.isIssueActive(issue)).length,
        resolvedIssues: issues.filter(issue => !this.isIssueActive(issue)).length
      },
      issues,
      recommendations,
      trends,
      metrics: { ...this.currentMetrics }
    };
  }

  /**
   * 获取实时指标
   */
  getRealTimeMetrics(): MonitoringMetrics {
    this.updateAllMetrics();
    return { ...this.currentMetrics };
  }

  /**
   * 获取性能趋势数据
   */
  getPerformanceTrends(timeRange: number = 3600000): {
    timestamps: number[];
    errorRates: number[];
    responseTimes: number[];
    throughput: number[];
  } {
    const now = Date.now();
    const startTime = now - timeRange;
    
    // 按时间段分组数据
    const bucketSize = timeRange / 20; // 20个数据点
    const buckets: Record<number, PerformanceSample[]> = {};
    
    this.performanceSamples
      .filter(sample => sample.timestamp >= startTime)
      .forEach(sample => {
        const bucketKey = Math.floor((sample.timestamp - startTime) / bucketSize);
        if (!buckets[bucketKey]) buckets[bucketKey] = [];
        buckets[bucketKey].push(sample);
      });
    
    const timestamps: number[] = [];
    const errorRates: number[] = [];
    const responseTimes: number[] = [];
    const throughput: number[] = [];
    
    for (let i = 0; i < 20; i++) {
      const bucketSamples = buckets[i] || [];
      const bucketTime = startTime + i * bucketSize;
      
      timestamps.push(bucketTime);
      
      // 计算错误率
      const totalSamples = bucketSamples.length;
      const errorSamples = bucketSamples.filter(s => !s.success).length;
      errorRates.push(totalSamples > 0 ? (errorSamples / totalSamples) * 100 : 0);
      
      // 计算平均响应时间
      const avgResponseTime = totalSamples > 0 
        ? bucketSamples.reduce((sum, s) => sum + s.duration, 0) / totalSamples 
        : 0;
      responseTimes.push(avgResponseTime);
      
      // 计算吞吐量
      const throughputValue = totalSamples / (bucketSize / 1000); // 每秒操作数
      throughput.push(throughputValue);
    }
    
    return { timestamps, errorRates, responseTimes, throughput };
  }

  /**
   * 获取错误分布统计
   */
  getErrorDistribution(timeRange: number = 3600000): {
    byType: Record<AutoPageBreakErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
    byTimeOfDay: Record<number, number>;
  } {
    const now = Date.now();
    const startTime = now - timeRange;
    
    const recentErrors = this.errorHistory.filter(error => error.timestamp >= startTime);
    
    // 按类型分组
    const byType: Record<string, number> = {};
    Object.values(AutoPageBreakErrorType).forEach(type => {
      byType[type] = 0;
    });
    
    // 按严重程度分组
    const bySeverity: Record<string, number> = {};
    Object.values(ErrorSeverity).forEach(severity => {
      bySeverity[severity] = 0;
    });
    
    // 按小时分组
    const byTimeOfDay: Record<number, number> = {};
    for (let hour = 0; hour < 24; hour++) {
      byTimeOfDay[hour] = 0;
    }
    
    recentErrors.forEach(error => {
      byType[error.type]++;
      bySeverity[error.severity]++;
      
      const hour = new Date(error.timestamp).getHours();
      byTimeOfDay[hour]++;
    });
    
    return {
      byType: byType as Record<AutoPageBreakErrorType, number>,
      bySeverity: bySeverity as Record<ErrorSeverity, number>,
      byTimeOfDay
    };
  }

  /**
   * 添加自定义告警规则
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  /**
   * 移除告警规则
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
  }

  /**
   * 检查告警条件
   */
  private checkAlerts(): void {
    const now = Date.now();
    
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;
      
      // 检查冷却期
      if (rule.lastTriggered && now - rule.lastTriggered < rule.cooldown) {
        continue;
      }
      
      // 检查条件
      if (rule.condition(this.currentMetrics)) {
        this.triggerAlert(rule);
        rule.lastTriggered = now;
      }
    }
  }

  /**
   * 触发告警
   */
  private triggerAlert(rule: AlertRule): void {
    console.warn(`Alert triggered: ${rule.name} (${rule.severity})`);
    
    // 发出告警事件
    this.eventManager.emitError({
      error: new Error(`Alert: ${rule.name}`),
      operation: 'monitoring',
      pageIndex: undefined
    });
    
    // 这里可以添加其他告警处理逻辑，如发送通知等
  }

  /**
   * 更新所有指标
   */
  private updateAllMetrics(): void {
    this.updateErrorRateMetrics();
    this.updatePerformanceMetrics();
    this.updateSystemHealthMetrics();
    this.updateCircuitBreakerMetrics();
  }

  /**
   * 更新错误率指标
   */
  private updateErrorRateMetrics(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    
    // 最近一分钟的错误
    const recentErrors = this.errorHistory.filter(error => error.timestamp >= oneMinuteAgo);
    const hourlyErrors = this.errorHistory.filter(error => error.timestamp >= oneHourAgo);
    
    const currentRate = recentErrors.length; // 每分钟错误数
    const averageRate = hourlyErrors.length / 60; // 小时平均错误率
    
    // 计算峰值错误率
    const peakRate = this.calculatePeakErrorRate();
    
    // 计算趋势
    const trend = this.calculateErrorTrend();
    
    this.currentMetrics.errorRate = {
      current: currentRate,
      average: averageRate,
      peak: peakRate,
      trend
    };
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    const recentSamples = this.performanceSamples.filter(sample => sample.timestamp >= oneHourAgo);
    
    if (recentSamples.length === 0) {
      return;
    }
    
    // 计算平均响应时间
    const avgResponseTime = recentSamples.reduce((sum, s) => sum + s.duration, 0) / recentSamples.length;
    
    // 计算95%分位响应时间
    const sortedDurations = recentSamples.map(s => s.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    const p95ResponseTime = sortedDurations[p95Index] || 0;
    
    // 计算吞吐量
    const throughput = recentSamples.length / 3600; // 每秒操作数
    
    // 计算错误数
    const errorCount = recentSamples.filter(s => !s.success).length;
    
    this.currentMetrics.performance = {
      averageResponseTime: avgResponseTime,
      p95ResponseTime,
      throughput,
      errorCount
    };
  }

  /**
   * 更新系统健康指标
   */
  private updateSystemHealthMetrics(): void {
    const memoryUsage = this.getMemoryUsage();
    const cpuLoad = this.getCpuLoad();
    const operationQueue = this.getOperationQueueLength();
    
    this.currentMetrics.systemHealth = {
      memoryUsage,
      cpuLoad,
      operationQueue,
      lastHealthCheck: Date.now()
    };
  }

  /**
   * 更新熔断器指标
   */
  private updateCircuitBreakerMetrics(): void {
    // 这里需要与熔断器管理器集成
    // 暂时使用模拟数据
    this.currentMetrics.circuitBreakers = {
      totalBreakers: 5,
      openBreakers: 0,
      halfOpenBreakers: 0
    };
  }

  /**
   * 分析错误
   */
  private analyzeError(error: AutoPageBreakError): void {
    // 检查是否为已知问题模式
    this.detectErrorPatterns(error);
    
    // 更新或创建诊断问题
    this.updateDiagnosticIssue(error);
  }

  /**
   * 检测错误模式
   */
  private detectErrorPatterns(error: AutoPageBreakError): void {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    // 检查相同类型错误的频率
    const sameTypeErrors = this.errorHistory.filter(
      e => e.type === error.type && e.timestamp >= fiveMinutesAgo
    );
    
    if (sameTypeErrors.length >= 5) {
      this.createOrUpdateIssue({
        id: `high_frequency_${error.type}`,
        severity: 'high',
        category: 'reliability',
        title: `High frequency ${error.type} errors`,
        description: `Detected ${sameTypeErrors.length} ${error.type} errors in the last 5 minutes`,
        impact: 'May cause degraded user experience',
        resolution: ['Check system resources', 'Review error handling logic', 'Consider circuit breaker'],
        firstDetected: sameTypeErrors[0].timestamp,
        lastOccurrence: now,
        occurrenceCount: sameTypeErrors.length
      });
    }
  }

  /**
   * 更新诊断问题
   */
  private updateDiagnosticIssue(error: AutoPageBreakError): void {
    const issueId = `error_${error.type}_${error.severity}`;
    
    let issue = this.diagnosticIssues.get(issueId);
    if (!issue) {
      issue = {
        id: issueId,
        severity: this.mapErrorSeverityToDiagnostic(error.severity),
        category: this.mapErrorTypeToCategory(error.type),
        title: `${error.type} Error`,
        description: error.message,
        impact: this.getErrorImpact(error.type, error.severity),
        resolution: this.getErrorResolution(error.type),
        firstDetected: error.timestamp,
        lastOccurrence: error.timestamp,
        occurrenceCount: 1
      };
    } else {
      issue.lastOccurrence = error.timestamp;
      issue.occurrenceCount++;
    }
    
    this.diagnosticIssues.set(issueId, issue);
  }

  /**
   * 创建或更新问题
   */
  private createOrUpdateIssue(issueData: DiagnosticIssue): void {
    this.diagnosticIssues.set(issueData.id, issueData);
  }

  /**
   * 计算整体健康状况
   */
  private calculateOverallHealth(): 'healthy' | 'warning' | 'critical' {
    const healthScore = this.calculateHealthScore();
    
    if (healthScore >= 80) return 'healthy';
    if (healthScore >= 60) return 'warning';
    return 'critical';
  }

  /**
   * 计算健康得分
   */
  private calculateHealthScore(): number {
    let score = 100;
    
    // 错误率影响
    const errorRate = this.currentMetrics.errorRate.current;
    if (errorRate > 10) score -= 30;
    else if (errorRate > 5) score -= 15;
    else if (errorRate > 1) score -= 5;
    
    // 性能影响
    const avgResponseTime = this.currentMetrics.performance.averageResponseTime;
    if (avgResponseTime > 1000) score -= 20;
    else if (avgResponseTime > 500) score -= 10;
    else if (avgResponseTime > 200) score -= 5;
    
    // 系统资源影响
    const memoryUsage = this.currentMetrics.systemHealth.memoryUsage;
    if (memoryUsage > 0.9) score -= 25;
    else if (memoryUsage > 0.8) score -= 15;
    else if (memoryUsage > 0.7) score -= 5;
    
    // 熔断器影响
    const openBreakers = this.currentMetrics.circuitBreakers.openBreakers;
    if (openBreakers > 0) score -= openBreakers * 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 生成建议
   */
  private generateRecommendations(issues: DiagnosticIssue[]): string[] {
    const recommendations: string[] = [];
    
    // 基于问题生成建议
    const highSeverityIssues = issues.filter(issue => 
      issue.severity === 'high' || issue.severity === 'critical'
    );
    
    if (highSeverityIssues.length > 0) {
      recommendations.push('Address high severity issues immediately');
    }
    
    // 基于指标生成建议
    if (this.currentMetrics.errorRate.current > 5) {
      recommendations.push('Consider implementing circuit breakers for frequently failing operations');
    }
    
    if (this.currentMetrics.performance.averageResponseTime > 500) {
      recommendations.push('Optimize performance for operations taking longer than 500ms');
    }
    
    if (this.currentMetrics.systemHealth.memoryUsage > 0.8) {
      recommendations.push('Monitor memory usage and consider garbage collection optimization');
    }
    
    return recommendations;
  }

  /**
   * 分析趋势
   */
  private analyzeTrends(): {
    errorTrend: 'improving' | 'stable' | 'degrading';
    performanceTrend: 'improving' | 'stable' | 'degrading';
    reliabilityTrend: 'improving' | 'stable' | 'degrading';
  } {
    return {
      errorTrend: this.calculateErrorTrend(),
      performanceTrend: 'stable', // 简化实现
      reliabilityTrend: 'stable'  // 简化实现
    };
  }

  /**
   * 计算错误趋势
   */
  private calculateErrorTrend(): 'improving' | 'stable' | 'degrading' {
    const now = Date.now();
    const halfHourAgo = now - 1800000;
    const oneHourAgo = now - 3600000;
    
    const recentErrors = this.errorHistory.filter(error => error.timestamp >= halfHourAgo);
    const olderErrors = this.errorHistory.filter(
      error => error.timestamp >= oneHourAgo && error.timestamp < halfHourAgo
    );
    
    const recentRate = recentErrors.length;
    const olderRate = olderErrors.length;
    
    if (recentRate < olderRate * 0.8) return 'improving';
    if (recentRate > olderRate * 1.2) return 'degrading';
    return 'stable';
  }

  /**
   * 计算峰值错误率
   */
  private calculatePeakErrorRate(): number {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const bucketSize = 60000; // 1分钟桶
    
    let maxRate = 0;
    for (let time = oneHourAgo; time < now; time += bucketSize) {
      const bucketErrors = this.errorHistory.filter(
        error => error.timestamp >= time && error.timestamp < time + bucketSize
      );
      maxRate = Math.max(maxRate, bucketErrors.length);
    }
    
    return maxRate;
  }

  /**
   * 获取内存使用率
   */
  private getMemoryUsage(): number {
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
    // 简化实现，实际应该通过性能API获取
    return 0.3; // 默认值
  }

  /**
   * 获取操作队列长度
   */
  private getOperationQueueLength(): number {
    // 简化实现，实际应该从相关组件获取
    return 0;
  }

  /**
   * 映射错误严重程度
   */
  private mapErrorSeverityToDiagnostic(severity: ErrorSeverity): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case ErrorSeverity.LOW: return 'low';
      case ErrorSeverity.MEDIUM: return 'medium';
      case ErrorSeverity.HIGH: return 'high';
      case ErrorSeverity.CRITICAL: return 'critical';
      default: return 'medium';
    }
  }

  /**
   * 映射错误类型到分类
   */
  private mapErrorTypeToCategory(errorType: AutoPageBreakErrorType): 'performance' | 'reliability' | 'resource' | 'configuration' {
    switch (errorType) {
      case AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED:
        return 'performance';
      case AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED:
        return 'reliability';
      case AutoPageBreakErrorType.DOM_OPERATION_FAILED:
        return 'resource';
      case AutoPageBreakErrorType.CONFIGURATION_ERROR:
        return 'configuration';
      default:
        return 'reliability';
    }
  }

  /**
   * 获取错误影响描述
   */
  private getErrorImpact(errorType: AutoPageBreakErrorType, severity: ErrorSeverity): string {
    const impacts: Record<AutoPageBreakErrorType, string> = {
      [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: 'May cause incorrect page breaking behavior',
      [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: 'May result in inaccurate page layout',
      [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: 'May cause content overflow or loss',
      [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: 'May prevent new pages from being created',
      [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: 'May cause visual inconsistencies',
      [AutoPageBreakErrorType.TRANSACTION_FAILED]: 'May cause document corruption',
      [AutoPageBreakErrorType.CONFIGURATION_ERROR]: 'May cause system malfunction',
      [AutoPageBreakErrorType.UNKNOWN_ERROR]: 'Unknown impact on system functionality'
    };
    
    return impacts[errorType] || 'Unknown impact';
  }

  /**
   * 获取错误解决方案
   */
  private getErrorResolution(errorType: AutoPageBreakErrorType): string[] {
    const resolutions: Record<AutoPageBreakErrorType, string[]> = {
      [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: [
        'Check input validation logic',
        'Verify event listener setup',
        'Review composition handling'
      ],
      [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: [
        'Verify DOM element accessibility',
        'Check CSS styles affecting layout',
        'Use fallback measurement methods'
      ],
      [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: [
        'Review truncation algorithm',
        'Check content structure validity',
        'Implement fallback truncation strategy'
      ],
      [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: [
        'Check page template validity',
        'Verify document state',
        'Review transaction handling'
      ],
      [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: [
        'Check DOM element existence',
        'Verify DOM manipulation permissions',
        'Review element timing issues'
      ],
      [AutoPageBreakErrorType.TRANSACTION_FAILED]: [
        'Review transaction logic',
        'Check document state consistency',
        'Implement transaction rollback'
      ],
      [AutoPageBreakErrorType.CONFIGURATION_ERROR]: [
        'Validate configuration parameters',
        'Check default values',
        'Review configuration schema'
      ],
      [AutoPageBreakErrorType.UNKNOWN_ERROR]: [
        'Add better error categorization',
        'Review error handling logic',
        'Implement comprehensive logging'
      ]
    };
    
    return resolutions[errorType] || ['Review error context and logs'];
  }

  /**
   * 获取严重程度权重
   */
  private getSeverityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * 检查问题是否活跃
   */
  private isIssueActive(issue: DiagnosticIssue): boolean {
    const now = Date.now();
    const inactiveThreshold = 3600000; // 1小时
    
    return now - issue.lastOccurrence < inactiveThreshold;
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): MonitoringMetrics {
    return {
      errorRate: {
        current: 0,
        average: 0,
        peak: 0,
        trend: 'stable'
      },
      performance: {
        averageResponseTime: 0,
        p95ResponseTime: 0,
        throughput: 0,
        errorCount: 0
      },
      systemHealth: {
        memoryUsage: 0,
        cpuLoad: 0,
        operationQueue: 0,
        lastHealthCheck: Date.now()
      },
      circuitBreakers: {
        totalBreakers: 0,
        openBreakers: 0,
        halfOpenBreakers: 0
      }
    };
  }

  /**
   * 初始化告警规则
   */
  private initializeAlertRules(): void {
    // 高错误率告警
    this.addAlertRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      condition: (metrics) => metrics.errorRate.current > 10,
      severity: 'critical',
      cooldown: 300000, // 5分钟
      enabled: true
    });

    // 高响应时间告警
    this.addAlertRule({
      id: 'high_response_time',
      name: 'High Response Time',
      condition: (metrics) => metrics.performance.averageResponseTime > 1000,
      severity: 'warning',
      cooldown: 300000,
      enabled: true
    });

    // 高内存使用率告警
    this.addAlertRule({
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      condition: (metrics) => metrics.systemHealth.memoryUsage > 0.9,
      severity: 'critical',
      cooldown: 600000, // 10分钟
      enabled: true
    });

    // 熔断器打开告警
    this.addAlertRule({
      id: 'circuit_breaker_open',
      name: 'Circuit Breaker Open',
      condition: (metrics) => metrics.circuitBreakers.openBreakers > 0,
      severity: 'warning',
      cooldown: 300000,
      enabled: true
    });
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听错误事件
    this.eventManager.addEventListener('error_occurred', (data) => {
      if (data.error instanceof AutoPageBreakError) {
        this.recordError(data.error);
      }
    });

    // 监听性能事件
    this.eventManager.addEventListener('page_break_triggered', (data) => {
      this.recordPerformanceSample({
        timestamp: Date.now(),
        operation: 'page_break',
        duration: 100, // 默认值，实际应该从事件数据获取
        success: true,
        metadata: data
      });
    });
  }

  /**
   * 安排监控任务
   */
  private scheduleMonitoringTasks(): void {
    // 定期更新指标
    const metricsInterval = setInterval(() => {
      if (!this.monitoringActive) {
        clearInterval(metricsInterval);
        return;
      }
      
      this.updateAllMetrics();
      this.checkAlerts();
      this.lastMonitoringCycle = Date.now();
    }, this.MONITORING_INTERVAL);

    // 定期清理过期数据
    const cleanupInterval = setInterval(() => {
      if (!this.monitoringActive) {
        clearInterval(cleanupInterval);
        return;
      }
      
      this.cleanupExpiredData();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * 清理过期数据
   */
  private cleanupExpiredData(): void {
    const now = Date.now();
    const retentionPeriod = 24 * 3600000; // 24小时
    
    // 清理过期性能样本
    this.performanceSamples = this.performanceSamples.filter(
      sample => now - sample.timestamp < retentionPeriod
    );
    
    // 清理过期错误历史
    this.errorHistory = this.errorHistory.filter(
      error => now - error.timestamp < retentionPeriod
    );
    
    // 清理不活跃的诊断问题
    for (const [issueId, issue] of this.diagnosticIssues) {
      if (!this.isIssueActive(issue) && now - issue.lastOccurrence > retentionPeriod) {
        this.diagnosticIssues.delete(issueId);
      }
    }
  }

  /**
   * 获取监控状态
   */
  getMonitoringStatus(): {
    active: boolean;
    lastCycle: number;
    dataPoints: {
      performanceSamples: number;
      errorHistory: number;
      diagnosticIssues: number;
    };
    alertRules: number;
  } {
    return {
      active: this.monitoringActive,
      lastCycle: this.lastMonitoringCycle,
      dataPoints: {
        performanceSamples: this.performanceSamples.length,
        errorHistory: this.errorHistory.length,
        diagnosticIssues: this.diagnosticIssues.size
      },
      alertRules: this.alertRules.size
    };
  }

  /**
   * 重置监控数据
   */
  resetMonitoringData(): void {
    this.performanceSamples = [];
    this.errorHistory = [];
    this.diagnosticIssues.clear();
    this.currentMetrics = this.initializeMetrics();
    this.healthScore = 100;
    
    console.log('Monitoring data has been reset');
  }

  /**
   * 导出监控数据
   */
  exportMonitoringData(): {
    timestamp: number;
    metrics: MonitoringMetrics;
    performanceSamples: PerformanceSample[];
    errorHistory: AutoPageBreakError[];
    diagnosticIssues: DiagnosticIssue[];
  } {
    return {
      timestamp: Date.now(),
      metrics: { ...this.currentMetrics },
      performanceSamples: [...this.performanceSamples],
      errorHistory: [...this.errorHistory],
      diagnosticIssues: Array.from(this.diagnosticIssues.values())
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopMonitoring();
    this.resetMonitoringData();
    this.alertRules.clear();
  }
}

/**
 * 创建错误监控和诊断工具实例
 */
export function createErrorMonitoringDiagnostics(
  editor: Editor,
  eventManager: AutoPageBreakEventManager
): ErrorMonitoringDiagnostics {
  return new ErrorMonitoringDiagnostics(editor, eventManager);
}