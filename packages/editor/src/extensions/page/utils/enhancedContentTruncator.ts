import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode, Fragment, Slice } from "@tiptap/pm/model";
import { Transaction } from "@tiptap/pm/state";

/**
 * 截断算法类型枚举
 */
export enum TruncationAlgorithm {
  PRECISE = 'precise',        // 精确截断：使用二分查找 + 虚拟测量
  FAST = 'fast',             // 快速截断：使用字符比例估算
  CONSERVATIVE = 'conservative' // 保守截断：固定比例（75%）截断
}

/**
 * 截断状态枚举
 */
export enum TruncationStatus {
  SUCCESS = 'success',
  TIMEOUT = 'timeout',
  MEASUREMENT_FAILED = 'measurement_failed',
  ALGORITHM_FAILED = 'algorithm_failed',
  FALLBACK_USED = 'fallback_used'
}

/**
 * 增强版内容截断结果接口
 */
export interface EnhancedContentTruncationResult {
  remainingContent: Fragment;     // 保留在当前页的内容
  overflowContent: Fragment;      // 需要移到下一页的内容
  truncationPos: number;          // 截断位置
  success: boolean;               // 截断是否成功
  status: TruncationStatus;       // 截断状态
  algorithmUsed: TruncationAlgorithm; // 使用的算法
  executionTime: number;          // 执行时间(ms)
  accuracy: number;               // 准确度评估(0-1)
  fallbackReason?: string;        // 降级原因
}

/**
 * 截断选项接口 - 增强版
 */
export interface EnhancedTruncationOptions {
  preserveWords: boolean;         // 是否保护单词完整性
  preserveParagraphs: boolean;    // 是否保护段落完整性
  maxHeight: number;              // 最大允许高度(px)
  breakThreshold: number;         // 触发截断的阈值(0-1)
  maxExecutionTime: number;       // 最大执行时间(ms)
  preferredAlgorithm: TruncationAlgorithm; // 首选算法
  fallbackChain: TruncationAlgorithm[];    // 降级链
  accuracyThreshold: number;      // 准确度阈值
}

/**
 * 算法性能统计接口
 */
export interface AlgorithmPerformance {
  algorithm: TruncationAlgorithm;
  totalExecutions: number;
  successCount: number;
  averageTime: number;
  averageAccuracy: number;
  lastUsed: number;
}

/**
 * 增强版内容截断器类
 * 实现分级截断算法和智能降级机制
 */
export class EnhancedContentTruncator {
  private editor: Editor;
  private measurementCache: Map<string, { height: number; timestamp: number }>;
  private virtualContainer: HTMLElement | null = null;
  private performanceStats: Map<TruncationAlgorithm, AlgorithmPerformance>;
  private readonly CACHE_DURATION = 5000; // 5秒缓存
  private readonly MAX_EXECUTION_TIME = 500; // 最大执行时间500ms

  constructor(editor: Editor) {
    this.editor = editor;
    this.measurementCache = new Map();
    this.performanceStats = new Map();
    this.initializePerformanceStats();
    this.createVirtualContainer();
  }

  /**
   * 增强版内容截断方法
   */
  async truncateContentEnhanced(
    pageContentNode: ProseMirrorNode,
    pageContentPos: number,
    options: EnhancedTruncationOptions
  ): Promise<EnhancedContentTruncationResult> {
    const startTime = performance.now();
    let algorithmUsed = options.preferredAlgorithm;
    let fallbackReason: string | undefined;

    // 快速检查是否需要截断
    const currentHeight = await this.measureNodeHeightSafe(pageContentNode);
    if (currentHeight <= options.maxHeight) {
      return this.createSuccessResult(
        pageContentNode.content,
        Fragment.empty,
        0,
        algorithmUsed,
        performance.now() - startTime,
        1.0
      );
    }

    // 尝试算法链
    const algorithmChain = [options.preferredAlgorithm, ...options.fallbackChain];
    
    for (let i = 0; i < algorithmChain.length; i++) {
      const algorithm = algorithmChain[i];
      
      try {
        const result = await this.executeAlgorithm(
          algorithm,
          pageContentNode,
          pageContentPos,
          options,
          startTime
        );

        if (result.success && this.isAccuracyAcceptable(result.accuracy, options.accuracyThreshold)) {
          this.updatePerformanceStats(algorithm, true, result.executionTime, result.accuracy);
          return result;
        }

        // 如果结果不满意但未超时，尝试下一个算法
        if (i < algorithmChain.length - 1) {
          fallbackReason = `${algorithm} algorithm insufficient accuracy: ${result.accuracy.toFixed(2)}`;
          continue;
        }
      } catch (error) {
        console.warn(`Algorithm ${algorithm} failed:`, error);
        fallbackReason = `${algorithm} algorithm failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        if (i < algorithmChain.length - 1) {
          continue;
        }
      }
    }

    // 所有算法都失败，返回保守结果
    const conservativeResult = this.createConservativeResult(
      pageContentNode,
      options,
      performance.now() - startTime
    );
    conservativeResult.fallbackReason = fallbackReason;
    
    return conservativeResult;
  }

  /**
   * 执行指定算法
   */
  private async executeAlgorithm(
    algorithm: TruncationAlgorithm,
    pageContentNode: ProseMirrorNode,
    pageContentPos: number,
    options: EnhancedTruncationOptions,
    startTime: number
  ): Promise<EnhancedContentTruncationResult> {
    const algorithmStartTime = performance.now();

    switch (algorithm) {
      case TruncationAlgorithm.PRECISE:
        return await this.executePreciseTruncation(pageContentNode, options, startTime);
      
      case TruncationAlgorithm.FAST:
        return await this.executeFastTruncation(pageContentNode, options, startTime);
      
      case TruncationAlgorithm.CONSERVATIVE:
        return this.executeConservativeTruncation(pageContentNode, options, startTime);
      
      default:
        throw new Error(`Unknown algorithm: ${algorithm}`);
    }
  }

  /**
   * 精确截断算法
   */
  private async executePreciseTruncation(
    pageContentNode: ProseMirrorNode,
    options: EnhancedTruncationOptions,
    startTime: number
  ): Promise<EnhancedContentTruncationResult> {
    const targetHeight = options.maxHeight * options.breakThreshold;
    
    // 使用二分查找找到最佳截断位置
    const truncationPoint = await this.binarySearchTruncationPoint(
      pageContentNode,
      targetHeight,
      options,
      startTime
    );

    if (!truncationPoint) {
      throw new Error('Failed to find suitable truncation point');
    }

    const { remaining, overflow } = this.splitContentAtPosition(
      pageContentNode,
      truncationPoint.position
    );

    const accuracy = await this.calculateAccuracy(remaining, targetHeight);
    
    return this.createSuccessResult(
      remaining,
      overflow,
      truncationPoint.position,
      TruncationAlgorithm.PRECISE,
      performance.now() - startTime,
      accuracy
    );
  }

  /**
   * 快速截断算法
   */
  private async executeFastTruncation(
    pageContentNode: ProseMirrorNode,
    options: EnhancedTruncationOptions,
    startTime: number
  ): Promise<EnhancedContentTruncationResult> {
    const currentHeight = await this.measureNodeHeightSafe(pageContentNode);
    const targetHeight = options.maxHeight * options.breakThreshold;
    
    // 使用比例估算
    const estimatedRatio = targetHeight / currentHeight;
    const contentSize = pageContentNode.content.size;
    const estimatedPosition = Math.floor(contentSize * estimatedRatio);
    
    // 调整到合适的边界
    const adjustedPosition = this.adjustToWordOrParagraphBoundary(
      pageContentNode,
      estimatedPosition,
      options
    );

    const { remaining, overflow } = this.splitContentAtPosition(
      pageContentNode,
      adjustedPosition
    );

    const accuracy = await this.calculateAccuracy(remaining, targetHeight);
    
    return this.createSuccessResult(
      remaining,
      overflow,
      adjustedPosition,
      TruncationAlgorithm.FAST,
      performance.now() - startTime,
      accuracy
    );
  }

  /**
   * 保守截断算法
   */
  private executeConservativeTruncation(
    pageContentNode: ProseMirrorNode,
    options: EnhancedTruncationOptions,
    startTime: number
  ): EnhancedContentTruncationResult {
    // 使用固定75%比例
    const contentSize = pageContentNode.content.size;
    const conservativePosition = Math.floor(contentSize * 0.75);
    
    const { remaining, overflow } = this.splitContentAtPosition(
      pageContentNode,
      conservativePosition
    );

    return this.createSuccessResult(
      remaining,
      overflow,
      conservativePosition,
      TruncationAlgorithm.CONSERVATIVE,
      performance.now() - startTime,
      0.75 // 固定准确度
    );
  }

  /**
   * 二分查找截断点
   */
  private async binarySearchTruncationPoint(
    pageContentNode: ProseMirrorNode,
    targetHeight: number,
    options: EnhancedTruncationOptions,
    startTime: number
  ): Promise<{ position: number; height: number } | null> {
    let left = 0;
    let right = pageContentNode.content.size;
    let bestPosition = 0;
    let bestHeight = 0;
    const maxIterations = 20; // 限制迭代次数
    let iterations = 0;

    while (left <= right && iterations < maxIterations) {
      // 检查超时
      if (performance.now() - startTime > options.maxExecutionTime) {
        break;
      }

      const mid = Math.floor((left + right) / 2);
      
      try {
        const { remaining } = this.splitContentAtPosition(pageContentNode, mid);
        const height = await this.measureFragmentHeight(remaining);

        if (height <= targetHeight) {
          bestPosition = mid;
          bestHeight = height;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      } catch (error) {
        console.warn('Binary search iteration failed:', error);
        break;
      }

      iterations++;
    }

    return bestPosition > 0 ? { position: bestPosition, height: bestHeight } : null;
  }

  /**
   * 调整到单词或段落边界
   */
  private adjustToWordOrParagraphBoundary(
    pageContentNode: ProseMirrorNode,
    position: number,
    options: EnhancedTruncationOptions
  ): number {
    if (!options.preserveWords && !options.preserveParagraphs) {
      return position;
    }

    // 简化的边界调整逻辑
    // 在实际实现中，这里应该分析内容结构
    const contentSize = pageContentNode.content.size;
    const adjustedPosition = Math.min(position, contentSize - 1);
    
    // 向前调整避免在单词中间截断
    if (options.preserveWords) {
      return Math.max(0, adjustedPosition - 10); // 简化处理
    }
    
    return adjustedPosition;
  }

  /**
   * 在指定位置分割内容
   */
  private splitContentAtPosition(
    pageContentNode: ProseMirrorNode,
    position: number
  ): { remaining: Fragment; overflow: Fragment } {
    const content = pageContentNode.content;
    const safePosition = Math.max(0, Math.min(position, content.size));
    
    const remaining = content.cut(0, safePosition);
    const overflow = content.cut(safePosition);
    
    return { remaining, overflow };
  }

  /**
   * 安全测量节点高度
   */
  private async measureNodeHeightSafe(node: ProseMirrorNode): Promise<number> {
    const cacheKey = this.getNodeCacheKey(node);
    const cached = this.measurementCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.height;
    }

    try {
      const height = await this.performVirtualMeasurement(node);
      this.measurementCache.set(cacheKey, {
        height,
        timestamp: Date.now()
      });
      return height;
    } catch (error) {
      console.warn('Height measurement failed, using estimation:', error);
      return this.estimateNodeHeight(node);
    }
  }

  /**
   * 测量Fragment高度
   */
  private async measureFragmentHeight(fragment: Fragment): Promise<number> {
    try {
      if (!this.virtualContainer) {
        return this.estimateFragmentHeight(fragment);
      }

      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = 'width: 210mm; visibility: hidden; position: absolute; top: -9999px;';
      
      // 简化的Fragment渲染
      fragment.forEach(node => {
        const nodeElement = this.createVirtualNode(node);
        tempDiv.appendChild(nodeElement);
      });

      this.virtualContainer.appendChild(tempDiv);
      const height = tempDiv.offsetHeight;
      this.virtualContainer.removeChild(tempDiv);

      return height;
    } catch (error) {
      return this.estimateFragmentHeight(fragment);
    }
  }

  /**
   * 计算准确度
   */
  private async calculateAccuracy(
    remaining: Fragment,
    targetHeight: number
  ): Promise<number> {
    try {
      const actualHeight = await this.measureFragmentHeight(remaining);
      const ratio = Math.min(actualHeight / targetHeight, targetHeight / actualHeight);
      return Math.max(0, Math.min(1, ratio));
    } catch (error) {
      return 0.8; // 默认准确度
    }
  }

  /**
   * 检查准确度是否可接受
   */
  private isAccuracyAcceptable(accuracy: number, threshold: number): boolean {
    return accuracy >= threshold;
  }

  /**
   * 创建成功结果
   */
  private createSuccessResult(
    remaining: Fragment,
    overflow: Fragment,
    position: number,
    algorithm: TruncationAlgorithm,
    executionTime: number,
    accuracy: number
  ): EnhancedContentTruncationResult {
    return {
      remainingContent: remaining,
      overflowContent: overflow,
      truncationPos: position,
      success: true,
      status: TruncationStatus.SUCCESS,
      algorithmUsed: algorithm,
      executionTime,
      accuracy
    };
  }

  /**
   * 创建保守结果
   */
  private createConservativeResult(
    pageContentNode: ProseMirrorNode,
    options: EnhancedTruncationOptions,
    executionTime: number
  ): EnhancedContentTruncationResult {
    const { remaining, overflow } = this.splitContentAtPosition(
      pageContentNode,
      Math.floor(pageContentNode.content.size * 0.75)
    );

    return {
      remainingContent: remaining,
      overflowContent: overflow,
      truncationPos: Math.floor(pageContentNode.content.size * 0.75),
      success: true,
      status: TruncationStatus.FALLBACK_USED,
      algorithmUsed: TruncationAlgorithm.CONSERVATIVE,
      executionTime,
      accuracy: 0.75
    };
  }

  /**
   * 虚拟测量实现
   */
  private async performVirtualMeasurement(node: ProseMirrorNode): Promise<number> {
    if (!this.virtualContainer) {
      return this.estimateNodeHeight(node);
    }

    try {
      const virtualNode = this.createVirtualNode(node);
      this.virtualContainer.appendChild(virtualNode);
      
      // 等待渲染完成
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      const height = virtualNode.offsetHeight;
      this.virtualContainer.removeChild(virtualNode);
      
      return height;
    } catch (error) {
      console.warn('Virtual measurement failed:', error);
      return this.estimateNodeHeight(node);
    }
  }

  /**
   * 创建虚拟DOM节点
   */
  private createVirtualNode(node: ProseMirrorNode): HTMLElement {
    const element = document.createElement(this.getHTMLTagForNodeType(node.type.name));
    
    if (node.textContent) {
      element.textContent = node.textContent;
    }

    // 递归处理子节点
    node.content.forEach(child => {
      const childElement = this.createVirtualNode(child);
      element.appendChild(childElement);
    });

    return element;
  }

  /**
   * 获取节点类型对应的HTML标签
   */
  private getHTMLTagForNodeType(nodeType: string): string {
    const typeMap: Record<string, string> = {
      paragraph: 'p',
      heading: 'h1',
      blockquote: 'blockquote',
      codeBlock: 'pre',
      table: 'table',
      tableRow: 'tr',
      tableCell: 'td',
      listItem: 'li',
      orderedList: 'ol',
      bulletList: 'ul'
    };

    return typeMap[nodeType] || 'div';
  }

  /**
   * 估算节点高度
   */
  private estimateNodeHeight(node: ProseMirrorNode): number {
    const typeHeights: Record<string, number> = {
      paragraph: 20,
      heading: 30,
      blockquote: 25,
      codeBlock: 100,
      table: 150,
      listItem: 20
    };

    return typeHeights[node.type.name] || 20;
  }

  /**
   * 估算Fragment高度
   */
  private estimateFragmentHeight(fragment: Fragment): number {
    let totalHeight = 0;
    fragment.forEach(node => {
      totalHeight += this.estimateNodeHeight(node);
    });
    return totalHeight;
  }

  /**
   * 获取节点缓存键
   */
  private getNodeCacheKey(node: ProseMirrorNode): string {
    return `${node.type.name}_${node.nodeSize}_${node.textContent?.length || 0}`;
  }

  /**
   * 初始化性能统计
   */
  private initializePerformanceStats(): void {
    Object.values(TruncationAlgorithm).forEach(algorithm => {
      this.performanceStats.set(algorithm, {
        algorithm,
        totalExecutions: 0,
        successCount: 0,
        averageTime: 0,
        averageAccuracy: 0,
        lastUsed: 0
      });
    });
  }

  /**
   * 更新性能统计
   */
  private updatePerformanceStats(
    algorithm: TruncationAlgorithm,
    success: boolean,
    executionTime: number,
    accuracy: number
  ): void {
    const stats = this.performanceStats.get(algorithm);
    if (!stats) return;

    stats.totalExecutions++;
    if (success) stats.successCount++;
    
    // 计算移动平均
    const weight = 0.1;
    stats.averageTime = stats.averageTime * (1 - weight) + executionTime * weight;
    stats.averageAccuracy = stats.averageAccuracy * (1 - weight) + accuracy * weight;
    stats.lastUsed = Date.now();
  }

  /**
   * 获取算法性能报告
   */
  getPerformanceReport(): Map<TruncationAlgorithm, AlgorithmPerformance> {
    return new Map(this.performanceStats);
  }

  /**
   * 创建虚拟容器
   */
  private createVirtualContainer(): void {
    if (typeof document === 'undefined') return;
    
    this.virtualContainer = document.createElement('div');
    this.virtualContainer.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: 210mm;
      visibility: hidden;
      pointer-events: none;
      overflow: hidden;
    `;
    
    document.body.appendChild(this.virtualContainer);
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.virtualContainer && this.virtualContainer.parentNode) {
      this.virtualContainer.parentNode.removeChild(this.virtualContainer);
    }
    this.measurementCache.clear();
    this.performanceStats.clear();
  }
}

/**
 * 创建增强版内容截断器
 */
export function createEnhancedContentTruncator(editor: Editor): EnhancedContentTruncator {
  return new EnhancedContentTruncator(editor);
}