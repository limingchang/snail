/**
 * 性能优化工具集
 * 提供防抖、节流、批量处理等性能优化功能
 */

/**
 * 简单的防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      timeoutId = null;
      func(...args);
    }, delay);
  };
}

/**
 * 简单的节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  
  return function(...args: Parameters<T>) {
    const now = Date.now();
    
    if (now - lastCallTime >= delay) {
      lastCallTime = now;
      func(...args);
    }
  };
}

/**
 * 批量处理器
 */
export class BatchProcessor<T> {
  private items: T[] = [];
  private processTimer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly delay: number;
  private readonly processor: (items: T[]) => void | Promise<void>;
  
  constructor(
    processor: (items: T[]) => void | Promise<void>,
    options: {
      batchSize?: number;
      delay?: number;
    } = {}
  ) {
    this.processor = processor;
    this.batchSize = options.batchSize || 10;
    this.delay = options.delay || 16;
  }
  
  add(item: T): void {
    this.items.push(item);
    
    if (this.items.length >= this.batchSize) {
      this.flush();
    } else {
      this.scheduleProcess();
    }
  }
  
  addBatch(items: T[]): void {
    this.items.push(...items);
    
    if (this.items.length >= this.batchSize) {
      this.flush();
    } else {
      this.scheduleProcess();
    }
  }
  
  flush(): void {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
    
    if (this.items.length > 0) {
      const itemsToProcess = this.items.splice(0);
      
      try {
        const result = this.processor(itemsToProcess);
        
        if (result instanceof Promise) {
          result.catch(error => {
            console.error('BatchProcessor: Error processing batch:', error);
          });
        }
      } catch (error) {
        console.error('BatchProcessor: Error processing batch:', error);
      }
    }
  }
  
  private scheduleProcess(): void {
    if (this.processTimer) {
      return;
    }
    
    this.processTimer = setTimeout(() => {
      this.processTimer = null;
      this.flush();
    }, this.delay);
  }
  
  clear(): void {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
    this.items.length = 0;
  }
  
  get length(): number {
    return this.items.length;
  }
}

/**
 * 帧调度器
 */
export class FrameScheduler {
  private tasks: Array<() => void> = [];
  private isScheduled = false;
  
  schedule(task: () => void): void {
    this.tasks.push(task);
    
    if (!this.isScheduled) {
      this.isScheduled = true;
      requestAnimationFrame(() => {
        this.isScheduled = false;
        this.processTasks();
      });
    }
  }
  
  scheduleBatch(tasks: Array<() => void>): void {
    this.tasks.push(...tasks);
    
    if (!this.isScheduled) {
      this.isScheduled = true;
      requestAnimationFrame(() => {
        this.isScheduled = false;
        this.processTasks();
      });
    }
  }
  
  private processTasks(): void {
    const tasksToProcess = this.tasks.splice(0);
    
    tasksToProcess.forEach(task => {
      try {
        task();
      } catch (error) {
        console.error('FrameScheduler: Error executing task:', error);
      }
    });
  }
  
  clear(): void {
    this.tasks.length = 0;
  }
  
  get pendingCount(): number {
    return this.tasks.length;
  }
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();
  private maxSamples: number;
  
  constructor(maxSamples = 100) {
    this.maxSamples = maxSamples;
  }
  
  startMeasurement(name: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.recordMeasurement(name, duration);
    };
  }
  
  recordMeasurement(name: string, duration: number): void {
    let samples = this.measurements.get(name);
    if (!samples) {
      samples = [];
      this.measurements.set(name, samples);
    }
    
    samples.push(duration);
    
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }
  
  getStats(name: string) {
    const samples = this.measurements.get(name);
    if (!samples || samples.length === 0) {
      return null;
    }
    
    const count = samples.length;
    const sum = samples.reduce((acc, val) => acc + val, 0);
    const average = sum / count;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const latest = samples[samples.length - 1];
    
    return { count, average, min, max, latest };
  }
  
  getAllStats() {
    const result: Record<string, any> = {};
    
    for (const [name] of this.measurements) {
      result[name] = this.getStats(name);
    }
    
    return result;
  }
  
  clearMeasurement(name: string): void {
    this.measurements.delete(name);
  }
  
  clearAll(): void {
    this.measurements.clear();
  }
}

// 全局实例
export const globalFrameScheduler = new FrameScheduler();
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * 创建用于样式更新的防抖函数
 */
export function createDebouncedStyleUpdate<T extends (...args: any[]) => any>(
  updateFn: T,
  delay = 16
): (...args: Parameters<T>) => void {
  return debounce(updateFn, delay);
}

/**
 * 创建用于样式更新的节流函数
 */
export function createThrottledStyleUpdate<T extends (...args: any[]) => any>(
  updateFn: T,
  delay = 16
): (...args: Parameters<T>) => void {
  return throttle(updateFn, delay);
}