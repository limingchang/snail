import type { Editor } from "@tiptap/core";

/**
 * 性能优化管理器
 * 负责管理防抖、节流、内存清理等性能相关功能
 */
export class PerformanceManager {
  private debounceTimers: Map<string, number> = new Map();
  private throttleTimers: Map<string, number> = new Map();
  private lastExecution: Map<string, number> = new Map();
  private animationFrameIds: Set<number> = new Set();
  
  /**
   * 防抖执行
   * @param key 防抖标识
   * @param callback 回调函数
   * @param delay 延迟时间（毫秒）
   */
  debounce<T extends (...args: any[]) => void>(
    key: string,
    callback: T,
    delay: number = 300
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      // 清除之前的定时器
      const existingTimer = this.debounceTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // 设置新的定时器
      const timer = window.setTimeout(() => {
        callback.apply(null, args);
        this.debounceTimers.delete(key);
      }, delay);
      
      this.debounceTimers.set(key, timer);
    };
  }

  /**
   * 节流执行
   * @param key 节流标识
   * @param callback 回调函数
   * @param interval 节流间隔（毫秒）
   */
  throttle<T extends (...args: any[]) => void>(
    key: string,
    callback: T,
    interval: number = 100
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      const now = Date.now();
      const lastTime = this.lastExecution.get(key) || 0;
      
      if (now - lastTime >= interval) {
        callback.apply(null, args);
        this.lastExecution.set(key, now);
      } else {
        // 如果在节流期间，设置一个延迟执行
        const existingTimer = this.throttleTimers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        const remainingTime = interval - (now - lastTime);
        const timer = window.setTimeout(() => {
          callback.apply(null, args);
          this.lastExecution.set(key, Date.now());
          this.throttleTimers.delete(key);
        }, remainingTime);
        
        this.throttleTimers.set(key, timer);
      }
    };
  }

  /**
   * 使用 requestAnimationFrame 优化 DOM 操作
   * @param callback 要在下一帧执行的回调
   */
  scheduleAnimationFrame(callback: () => void): number {
    const id = requestAnimationFrame(() => {
      callback();
      this.animationFrameIds.delete(id);
    });
    
    this.animationFrameIds.add(id);
    return id;
  }

  /**
   * 批量 DOM 操作优化
   * @param operations DOM 操作数组
   */
  batchDOMOperations(operations: (() => void)[]): void {
    this.scheduleAnimationFrame(() => {
      // 在单个动画帧中执行所有操作
      operations.forEach(operation => {
        try {
          operation();
        } catch (error) {
          console.warn('批量DOM操作出错:', error);
        }
      });
    });
  }

  /**
   * 内存使用监控
   */
  getMemoryUsage(): MemoryInfo | null {
    if ('memory' in performance) {
      return (performance as any).memory;
    }
    return null;
  }

  /**
   * 清理所有定时器和动画帧
   */
  cleanup(): void {
    // 清理防抖定时器
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    // 清理节流定时器
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();
    
    // 清理执行记录
    this.lastExecution.clear();
    
    // 清理动画帧
    this.animationFrameIds.forEach(id => cancelAnimationFrame(id));
    this.animationFrameIds.clear();
  }

  /**
   * 获取性能统计信息
   */
  getPerformanceStats(): {
    debounceTimers: number;
    throttleTimers: number;
    animationFrames: number;
    memoryUsage: MemoryInfo | null;
  } {
    return {
      debounceTimers: this.debounceTimers.size,
      throttleTimers: this.throttleTimers.size,
      animationFrames: this.animationFrameIds.size,
      memoryUsage: this.getMemoryUsage()
    };
  }
}

/**
 * 编辑器性能监控器
 * 专门用于监控编辑器相关的性能指标
 */
export class EditorPerformanceMonitor {
  private performanceManager: PerformanceManager;
  private isMonitoring: boolean = false;
  private monitoringInterval: number | null = null;
  private performanceData: Array<{
    timestamp: number;
    memoryUsage?: MemoryInfo;
    nodeCount: number;
    selectionTime: number;
  }> = [];

  constructor() {
    this.performanceManager = new PerformanceManager();
  }

  /**
   * 开始性能监控
   */
  startMonitoring(editor: Editor, interval: number = 5000): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitoringInterval = window.setInterval(() => {
      this.collectPerformanceData(editor);
    }, interval);
  }

  /**
   * 停止性能监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * 收集性能数据
   */
  private collectPerformanceData(editor: Editor): void {
    const startTime = performance.now();
    
    // 获取文档节点数量
    let nodeCount = 0;
    editor.state.doc.descendants(() => {
      nodeCount++;
    });
    
    const selectionTime = performance.now() - startTime;
    
    const data = {
      timestamp: Date.now(),
      memoryUsage: this.performanceManager.getMemoryUsage(),
      nodeCount,
      selectionTime
    };
    
    this.performanceData.push(data);
    
    // 保持最近100条记录
    if (this.performanceData.length > 100) {
      this.performanceData.shift();
    }
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): {
    averageNodeCount: number;
    averageSelectionTime: number;
    memoryTrend: Array<{ timestamp: number; usage: number }>;
    recommendations: string[];
  } {
    if (this.performanceData.length === 0) {
      return {
        averageNodeCount: 0,
        averageSelectionTime: 0,
        memoryTrend: [],
        recommendations: []
      };
    }

    const avgNodeCount = this.performanceData.reduce((sum, data) => sum + data.nodeCount, 0) / this.performanceData.length;
    const avgSelectionTime = this.performanceData.reduce((sum, data) => sum + data.selectionTime, 0) / this.performanceData.length;
    
    const memoryTrend = this.performanceData
      .filter(data => data.memoryUsage)
      .map(data => ({
        timestamp: data.timestamp,
        usage: data.memoryUsage!.usedJSHeapSize
      }));

    const recommendations: string[] = [];
    
    // 生成优化建议
    if (avgNodeCount > 1000) {
      recommendations.push('文档节点数量较多，建议优化内容结构或考虑分页');
    }
    
    if (avgSelectionTime > 10) {
      recommendations.push('选择操作耗时较长，建议优化选择器性能');
    }
    
    if (memoryTrend.length > 1) {
      const memoryGrowth = memoryTrend[memoryTrend.length - 1].usage - memoryTrend[0].usage;
      if (memoryGrowth > 50 * 1024 * 1024) { // 50MB
        recommendations.push('内存使用增长较快，建议检查内存泄漏');
      }
    }

    return {
      averageNodeCount: Math.round(avgNodeCount),
      averageSelectionTime: Math.round(avgSelectionTime * 100) / 100,
      memoryTrend,
      recommendations
    };
  }

  /**
   * 清理性能数据
   */
  cleanup(): void {
    this.stopMonitoring();
    this.performanceData = [];
    this.performanceManager.cleanup();
  }

  /**
   * 获取性能管理器实例
   */
  getPerformanceManager(): PerformanceManager {
    return this.performanceManager;
  }
}

/**
 * 内存泄漏检测器
 */
export class MemoryLeakDetector {
  private initialMemory: number | null = null;
  private memoryCheckpoints: Array<{ name: string; memory: number; timestamp: number }> = [];

  /**
   * 设置初始内存基线
   */
  setBaseline(name: string = 'baseline'): void {
    const memory = this.getCurrentMemoryUsage();
    if (memory !== null) {
      this.initialMemory = memory;
      this.addCheckpoint(name);
    }
  }

  /**
   * 添加内存检查点
   */
  addCheckpoint(name: string): void {
    const memory = this.getCurrentMemoryUsage();
    if (memory !== null) {
      this.memoryCheckpoints.push({
        name,
        memory,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 获取当前内存使用量
   */
  private getCurrentMemoryUsage(): number | null {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return null;
  }

  /**
   * 检测可能的内存泄漏
   */
  detectLeaks(): {
    hasLeak: boolean;
    memoryGrowth: number;
    checkpoints: Array<{ name: string; memory: number; growth: number; timestamp: number }>;
  } {
    if (this.memoryCheckpoints.length < 2) {
      return {
        hasLeak: false,
        memoryGrowth: 0,
        checkpoints: []
      };
    }

    const baseline = this.memoryCheckpoints[0].memory;
    const current = this.memoryCheckpoints[this.memoryCheckpoints.length - 1].memory;
    const memoryGrowth = current - baseline;
    
    // 内存增长超过100MB视为可能泄漏
    const hasLeak = memoryGrowth > 100 * 1024 * 1024;

    const checkpoints = this.memoryCheckpoints.map(checkpoint => ({
      name: checkpoint.name,
      memory: checkpoint.memory,
      growth: checkpoint.memory - baseline,
      timestamp: checkpoint.timestamp
    }));

    return {
      hasLeak,
      memoryGrowth,
      checkpoints
    };
  }

  /**
   * 清理检测数据
   */
  cleanup(): void {
    this.initialMemory = null;
    this.memoryCheckpoints = [];
  }
}