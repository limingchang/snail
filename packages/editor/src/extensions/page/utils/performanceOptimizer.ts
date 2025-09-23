import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * 缓存接口
 */
export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
}

/**
 * 性能监控数据接口
 */
export interface PerformanceMetrics {
  measurementTime: number;
  cacheHitRate: number;
  averageProcessingTime: number;
  totalOperations: number;
  failureRate: number;
}

/**
 * 防抖配置接口
 */
export interface DebounceConfig {
  delay: number;
  maxWait?: number;
  leading?: boolean;
  trailing?: boolean;
}

/**
 * 缓存管理器类
 * 提供高效的数据缓存和过期管理
 */
export class CacheManager<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTTL: number;
  private cleanupInterval: number | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0
  };

  constructor(maxSize: number = 1000, defaultTTL: number = 300000) { // 5分钟默认TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.startCleanupScheduler();
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    entry.accessCount++;
    this.stats.hits++;
    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const actualTTL = ttl || this.defaultTTL;
    
    // 如果缓存已满，清理最久未使用的条目
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: now,
      expiresAt: now + actualTTL,
      accessCount: 1
    });

    this.stats.sets++;
  }

  /**
   * 删除缓存条目
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    hitRate: number;
    stats: typeof this.stats;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      stats: { ...this.stats }
    };
  }

  /**
   * 检查条目是否过期
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * 清理过期条目
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 淘汰最久未使用的条目
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;
    let lruAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < lruTime || 
          (entry.timestamp === lruTime && entry.accessCount < lruAccess)) {
        lruKey = key;
        lruTime = entry.timestamp;
        lruAccess = entry.accessCount;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * 启动清理调度器
   */
  private startCleanupScheduler(): void {
    this.cleanupInterval = window.setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 重置统计信息
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

/**
 * 防抖函数实现
 * 支持前导执行和最大等待时间
 */
export class Debouncer {
  private timerId: number | null = null;
  private maxTimerId: number | null = null;
  private lastCallTime = 0;
  private lastInvokeTime = 0;

  constructor(
    private func: (...args: any[]) => any,
    private config: DebounceConfig
  ) {}

  /**
   * 执行防抖函数
   */
  invoke(...args: any[]): any {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    const timeSinceLastInvoke = now - this.lastInvokeTime;

    this.lastCallTime = now;

    // 前导执行
    if (this.config.leading && 
        (!this.lastInvokeTime || timeSinceLastInvoke >= this.config.delay)) {
      this.lastInvokeTime = now;
      return this.func.apply(null, args);
    }

    // 清除之前的定时器
    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    // 设置延迟执行
    if (this.config.trailing !== false) {
      this.timerId = window.setTimeout(() => {
        this.lastInvokeTime = Date.now();
        this.timerId = null;
        this.func.apply(null, args);
      }, this.config.delay);
    }

    // 最大等待时间处理
    if (this.config.maxWait && !this.maxTimerId) {
      this.maxTimerId = window.setTimeout(() => {
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = null;
        }
        this.maxTimerId = null;
        this.lastInvokeTime = Date.now();
        this.func.apply(null, args);
      }, this.config.maxWait);
    }
  }

  /**
   * 取消防抖
   */
  cancel(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.maxTimerId) {
      clearTimeout(this.maxTimerId);
      this.maxTimerId = null;
    }
  }

  /**
   * 立即执行
   */
  flush(...args: any[]): any {
    this.cancel();
    this.lastInvokeTime = Date.now();
    return this.func.apply(null, args);
  }
}

/**
 * 虚拟测量管理器
 * 提供高效的DOM元素测量功能
 */
export class VirtualMeasurementManager {
  private container: HTMLElement | null = null;
  private measurementCache: CacheManager<number>;
  private observer: ResizeObserver | null = null;
  private isInitialized = false;

  constructor() {
    this.measurementCache = new CacheManager(500, 600000); // 10分钟缓存
  }

  /**
   * 初始化虚拟测量容器
   */
  initialize(): void {
    if (this.isInitialized) return;

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 210mm;
      visibility: hidden;
      pointer-events: none;
      z-index: -1;
      overflow: hidden;
    `;
    
    document.body.appendChild(this.container);
    
    // 监听窗口大小变化，清理缓存
    this.setupResizeObserver();
    
    this.isInitialized = true;
  }

  /**
   * 测量元素高度
   */
  measureHeight(element: HTMLElement, cacheKey?: string): number {
    if (!this.isInitialized) {
      this.initialize();
    }

    if (!this.container) {
      return this.fallbackMeasurement(element);
    }

    // 尝试从缓存获取
    if (cacheKey) {
      const cached = this.measurementCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      // 克隆元素进行测量
      const clone = element.cloneNode(true) as HTMLElement;
      this.container.appendChild(clone);
      
      // 强制重排
      clone.offsetHeight;
      
      const height = clone.offsetHeight;
      
      this.container.removeChild(clone);
      
      // 缓存结果
      if (cacheKey) {
        this.measurementCache.set(cacheKey, height);
      }
      
      return height;
    } catch (error) {
      console.warn('Virtual measurement failed:', error);
      return this.fallbackMeasurement(element);
    }
  }

  /**
   * 测量文本高度
   */
  measureTextHeight(text: string, styles: Partial<CSSStyleDeclaration> = {}): number {
    if (!this.isInitialized) {
      this.initialize();
    }

    const cacheKey = this.generateTextCacheKey(text, styles);
    const cached = this.measurementCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const span = document.createElement('span');
    span.textContent = text;
    
    // 应用样式
    Object.assign(span.style, styles);
    
    const height = this.measureHeight(span, cacheKey);
    return height;
  }

  /**
   * 批量测量
   */
  measureBatch(elements: HTMLElement[]): number[] {
    if (!this.container || !this.isInitialized) {
      this.initialize();
    }

    const results: number[] = [];
    const fragment = document.createDocumentFragment();
    
    // 批量添加到容器
    elements.forEach((element, index) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-measure-index', index.toString());
      fragment.appendChild(clone);
    });
    
    this.container!.appendChild(fragment);
    
    // 强制重排一次
    this.container!.offsetHeight;
    
    // 批量获取高度
    elements.forEach((_, index) => {
      const clone = this.container!.querySelector(`[data-measure-index=\"${index}\"]`) as HTMLElement;
      if (clone) {
        results.push(clone.offsetHeight);
      } else {
        results.push(0);
      }
    });
    
    // 清理
    this.container!.innerHTML = '';
    
    return results;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.measurementCache.clear();
  }

  /**
   * 获取测量统计
   */
  getStats(): any {
    return this.measurementCache.getStats();
  }

  /**
   * 后备测量方法
   */
  private fallbackMeasurement(element: HTMLElement): number {
    // 简单估算
    const computedStyle = window.getComputedStyle(element);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const textContent = element.textContent || '';
    const lines = Math.ceil(textContent.length / 50); // 粗略估算
    return lines * lineHeight;
  }

  /**
   * 生成文本缓存键
   */
  private generateTextCacheKey(text: string, styles: Partial<CSSStyleDeclaration>): string {
    const styleStr = Object.entries(styles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join(';');
    return `text_${text.length}_${btoa(styleStr).substring(0, 10)}`;
  }

  /**
   * 设置窗口大小监听
   */
  private setupResizeObserver(): void {
    if ('ResizeObserver' in window) {
      this.observer = new ResizeObserver(() => {
        this.clearCache();
      });
      this.observer.observe(document.body);
    } else {
      window.addEventListener('resize', () => {
        this.clearCache();
      });
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    if (this.observer) {
      this.observer.disconnect();
    }
    
    this.measurementCache.dispose();
    this.isInitialized = false;
  }
}

/**
 * 性能监控器
 * 监控自动换页功能的性能指标
 */
export class PerformanceMonitor {
  private metrics: {
    operations: Array<{ name: string; duration: number; timestamp: number; success: boolean }>;
    startTimes: Map<string, number>;
  };
  private maxHistorySize = 1000;

  constructor() {
    this.metrics = {
      operations: [],
      startTimes: new Map()
    };
  }

  /**
   * 开始计时
   */
  start(operationName: string): void {
    this.metrics.startTimes.set(operationName, performance.now());
  }

  /**
   * 结束计时
   */
  end(operationName: string, success: boolean = true): number {
    const startTime = this.metrics.startTimes.get(operationName);
    if (!startTime) {
      console.warn(`No start time found for operation: ${operationName}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.metrics.startTimes.delete(operationName);

    this.metrics.operations.push({
      name: operationName,
      duration,
      timestamp: Date.now(),
      success
    });

    // 限制历史大小
    if (this.metrics.operations.length > this.maxHistorySize) {
      this.metrics.operations = this.metrics.operations.slice(-this.maxHistorySize);
    }

    return duration;
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    const operations = this.metrics.operations;
    const total = operations.length;
    
    if (total === 0) {
      return {
        measurementTime: 0,
        cacheHitRate: 0,
        averageProcessingTime: 0,
        totalOperations: 0,
        failureRate: 0
      };
    }

    const successful = operations.filter(op => op.success).length;
    const totalDuration = operations.reduce((sum, op) => sum + op.duration, 0);

    return {
      measurementTime: performance.now(),
      cacheHitRate: 0, // 由缓存管理器提供
      averageProcessingTime: totalDuration / total,
      totalOperations: total,
      failureRate: (total - successful) / total
    };
  }

  /**
   * 清理历史记录
   */
  clear(): void {
    this.metrics.operations = [];
    this.metrics.startTimes.clear();
  }
}

/**
 * 性能优化工具集合
 */
export class PerformanceOptimizer {
  public cacheManager: CacheManager;
  public virtualMeasurement: VirtualMeasurementManager;
  public performanceMonitor: PerformanceMonitor;
  private debouncers: Map<string, Debouncer>;

  constructor() {
    this.cacheManager = new CacheManager();
    this.virtualMeasurement = new VirtualMeasurementManager();
    this.performanceMonitor = new PerformanceMonitor();
    this.debouncers = new Map();
  }

  /**
   * 创建防抖函数
   */
  createDebouncer(name: string, func: (...args: any[]) => any, config: DebounceConfig): Debouncer {
    const debouncer = new Debouncer(func, config);
    this.debouncers.set(name, debouncer);
    return debouncer;
  }

  /**
   * 获取防抖函数
   */
  getDebouncer(name: string): Debouncer | undefined {
    return this.debouncers.get(name);
  }

  /**
   * 获取综合性能报告
   */
  getPerformanceReport(): {
    cache: any;
    measurements: any;
    operations: PerformanceMetrics;
    memory: any;
  } {
    return {
      cache: this.cacheManager.getStats(),
      measurements: this.virtualMeasurement.getStats(),
      operations: this.performanceMonitor.getMetrics(),
      memory: this.getMemoryUsage()
    };
  }

  /**
   * 获取内存使用情况
   */
  private getMemoryUsage(): any {
    if ('memory' in performance) {
      return (performance as any).memory;
    }
    return null;
  }

  /**
   * 清理所有资源
   */
  dispose(): void {
    this.cacheManager.dispose();
    this.virtualMeasurement.dispose();
    this.performanceMonitor.clear();
    this.debouncers.forEach(debouncer => debouncer.cancel());
    this.debouncers.clear();
  }
}

/**
 * 创建性能优化器实例
 */
export function createPerformanceOptimizer(): PerformanceOptimizer {
  return new PerformanceOptimizer();
}