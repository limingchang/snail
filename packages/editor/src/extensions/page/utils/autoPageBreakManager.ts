import { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Transaction } from "@tiptap/pm/state";
import { globalInputDetector, CompositionEventListener } from "./inputDetector";
import { createPageHeightCalculator, PageHeightCalculator } from "./heightCalculator";
import { createContentTruncator, ContentTruncator, TruncationOptions } from "./contentTruncator";
import { createAutoPageBreakEventManager, AutoPageBreakEventManager } from "./eventManager";
import { createPerformanceOptimizer, PerformanceOptimizer } from "./performanceOptimizer";
import { createErrorRecoveryManager, ErrorRecoveryManager } from "./errorRecoveryManager";

/**
 * 自动换页配置选项
 */
export interface AutoPageBreakOptions {
  enabled: boolean;               // 是否启用自动换页
  breakThreshold: number;         // 触发换页的高度阈值(0-1)
  preserveWords: boolean;         // 是否保护单词完整性
  preserveParagraphs: boolean;    // 是否保护段落完整性
  debounceDelay: number;          // 防抖延迟(ms)
  maxRetries: number;             // 最大重试次数
}

/**
 * 自动换页事件数据
 */
export interface AutoPageBreakEventData {
  pageIndex: number;              // 当前页索引
  newPageIndex: number;           // 新页面索引
  overflowContent: any;           // 溢出内容
  reason: string;                 // 触发原因
}

/**
 * 自动换页管理器类
 * 负责协调输入检测、高度计算、内容截断和页面创建
 */
export class AutoPageBreakManager {
  private editor: Editor;
  private options: AutoPageBreakOptions;
  private heightCalculator: PageHeightCalculator;
  private contentTruncator: ContentTruncator;
  private eventManager: AutoPageBreakEventManager;
  private performanceOptimizer: PerformanceOptimizer;
  private errorRecoveryManager: ErrorRecoveryManager;
  private compositionListener: CompositionEventListener;
  private debounceTimer: number | null = null;
  private isProcessing = false;
  private retryCount = 0;

  constructor(editor: Editor, options: Partial<AutoPageBreakOptions> = {}) {
    this.editor = editor;
    this.options = {
      enabled: true,
      breakThreshold: 0.95,
      preserveWords: true,
      preserveParagraphs: false,
      debounceDelay: 100,
      maxRetries: 3,
      ...options
    };

    this.heightCalculator = createPageHeightCalculator(editor);
    this.contentTruncator = createContentTruncator(editor);
    this.eventManager = createAutoPageBreakEventManager(editor);
    this.performanceOptimizer = createPerformanceOptimizer();
    this.errorRecoveryManager = createErrorRecoveryManager(editor, this.eventManager);
    this.compositionListener = new CompositionEventListener(globalInputDetector);

    this.bindEvents();
    this.setupPerformanceOptimizations();
  }

  /**
   * 处理编辑器更新事件
   * @param transaction 事务对象
   */
  async handleUpdate(transaction: Transaction): Promise<void> {
    if (!this.options.enabled || this.isProcessing) {
      return;
    }

    // 性能监控开始
    this.performanceOptimizer.performanceMonitor.start('handleUpdate');

    try {
      // 检查是否应该触发自动换页
      if (!globalInputDetector.shouldTriggerAutoPageBreak(transaction)) {
        return;
      }

      // 使用优化的防抖处理
      this.scheduleAutoPageBreakOptimized();
    } finally {
      this.performanceOptimizer.performanceMonitor.end('handleUpdate');
    }
  }

  /**
   * 优化的自动换页调度
   */
  private scheduleAutoPageBreakOptimized(): void {
    const debouncer = this.performanceOptimizer.getDebouncer('autoPageBreak');
    if (debouncer) {
      debouncer.invoke();
    }
  }

  /**
   * 调度自动换页处理（保留兼容性）
   */
  private scheduleAutoPageBreak(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.processAutoPageBreak();
    }, this.options.debounceDelay);
  }

  /**
   * 处理自动换页逻辑
   */
  private async processAutoPageBreak(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.retryCount = 0;

    // 性能监控
    this.performanceOptimizer.performanceMonitor.start('processAutoPageBreak');

    try {
      await this.executeAutoPageBreak();
      this.performanceOptimizer.performanceMonitor.end('processAutoPageBreak', true);
    } catch (error) {
      this.performanceOptimizer.performanceMonitor.end('processAutoPageBreak', false);
      
      // 使用错误恢复管理器处理错误
      const recovery = await this.errorRecoveryManager.handleError(error as Error, {
        operation: 'processAutoPageBreak',
        attempt: this.retryCount + 1
      });
      
      if (!recovery.recovered && this.retryCount < this.options.maxRetries) {
        this.retryCount++;
        setTimeout(() => {
          this.processAutoPageBreak();
        }, 200 * Math.pow(2, this.retryCount)); // 指数退避
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行自动换页操作
   */
  private async executeAutoPageBreak(): Promise<void> {
    // 执行边界条件检查
    const boundaryCheck = this.errorRecoveryManager.getBoundaryChecker().performComprehensiveCheck();
    if (!boundaryCheck.overall) {
      throw new Error(`Boundary condition check failed: ${JSON.stringify(boundaryCheck)}`);
    }

    // 查找当前光标所在的页面和内容区域
    const cursorInfo = this.findCurrentPageContent();
    if (!cursorInfo) {
      return;
    }

    const { pageNode, pagePos, pageContentNode, pageContentPos } = cursorInfo;

    // 检查页面内容状态
    const pageContentCheck = this.errorRecoveryManager.getBoundaryChecker().checkPageContentState(pageNode, pagePos);
    if (!pageContentCheck.valid) {
      throw new Error(`Page content check failed: ${pageContentCheck.issues.join(', ')}`);
    }

    // 检查内容是否溢出
    const overflowInfo = this.heightCalculator.checkContentOverflow(
      pageNode,
      pagePos,
      pageContentNode,
      pageContentPos
    );

    if (!overflowInfo.isOverflowing) {
      return;
    }

    // 发出溢出检测事件
    this.eventManager.emitOverflowDetected({
      pageIndex: pageNode.attrs.index,
      overflowHeight: overflowInfo.overflowHeight,
      contentHeight: this.heightCalculator.getContentActualHeight(pageContentNode, pageContentPos),
      maxHeight: this.heightCalculator.calculatePageHeight(pageNode, pagePos).contentHeight
    });

    // 计算截断选项
    const truncationOptions = this.createTruncationOptions(pageNode, pagePos);

    // 执行内容截断
    const truncationResult = this.contentTruncator.truncateContent(
      pageContentNode,
      pageContentPos,
      truncationOptions
    );

    if (!truncationResult || !truncationResult.success) {
      console.warn("Content truncation failed");
      this.eventManager.emitError({
        error: new Error('Content truncation failed'),
        operation: 'executeAutoPageBreak',
        pageIndex: pageNode.attrs.index
      });
      return;
    }

    // 发出内容截断事件
    this.eventManager.emitContentTruncated({
      pageIndex: pageNode.attrs.index,
      originalContentSize: pageContentNode.content.size,
      remainingContentSize: truncationResult.remainingContent.size,
      overflowContentSize: truncationResult.overflowContent.size,
      truncationMethod: truncationOptions.preserveWords ? 'word' : 'character'
    });

    // 创建新页面并移动内容
    await this.createNewPageWithContent(
      pageNode,
      pagePos,
      truncationResult,
      cursorInfo
    );

    // 发出换页触发事件
    this.eventManager.emitPageBreakTriggered({
      oldPageIndex: pageNode.attrs.index,
      newPageIndex: pageNode.attrs.index + 1,
      reason: 'content_overflow',
      truncationPos: truncationResult.truncationPos
    });
  }

  /**
   * 设置性能优化
   */
  private setupPerformanceOptimizations(): void {
    // 创建防抖器
    this.performanceOptimizer.createDebouncer(
      'autoPageBreak',
      () => this.processAutoPageBreak(),
      {
        delay: this.options.debounceDelay,
        maxWait: this.options.debounceDelay * 3,
        trailing: true
      }
    );

    // 初始化虚拟测量容器
    this.performanceOptimizer.virtualMeasurement.initialize();
  }

  /**
   * 查找当前光标所在的页面内容
   */
  private findCurrentPageContent(): {
    pageNode: ProseMirrorNode;
    pagePos: number;
    pageContentNode: ProseMirrorNode;
    pageContentPos: number;
  } | null {
    const { state } = this.editor;
    const { selection } = state;
    const { from } = selection;

    // 查找包含光标的页面节点
    let pageNode: ProseMirrorNode | null = null;
    let pagePos = 0;
    let pageContentNode: ProseMirrorNode | null = null;
    let pageContentPos = 0;

    state.doc.descendants((node, pos) => {
      if (node.type.name === "page" && pos <= from && pos + node.nodeSize > from) {
        pageNode = node;
        pagePos = pos;

        // 在页面内查找PageContent节点
        node.content.forEach((child, offset) => {
          if (child.type.name === "pageContent") {
            pageContentNode = child;
            pageContentPos = pos + offset + 1;
          }
        });

        return false; // 停止遍历
      }
    });

    if (!pageNode || !pageContentNode) {
      return null;
    }

    return { pageNode, pagePos, pageContentNode, pageContentPos };
  }

  /**
   * 创建截断选项
   */
  private createTruncationOptions(pageNode: ProseMirrorNode, pagePos: number): TruncationOptions {
    const heightCalc = this.heightCalculator.calculatePageHeight(pageNode, pagePos);

    return {
      preserveWords: this.options.preserveWords,
      preserveParagraphs: this.options.preserveParagraphs,
      maxHeight: heightCalc.contentHeight * 3.78, // 转换为像素
      breakThreshold: this.options.breakThreshold
    };
  }

  /**
   * 创建新页面并移动溢出内容
   */
  private async createNewPageWithContent(
    pageNode: ProseMirrorNode,
    pagePos: number,
    truncationResult: any,
    cursorInfo: any
  ): Promise<void> {
    const { tr } = this.editor.state;

    try {
      // 1. 截断当前页面内容
      tr.replaceRange(
        cursorInfo.pageContentPos,
        cursorInfo.pageContentPos + cursorInfo.pageContentNode.nodeSize - 2,
        truncationResult.remainingContent
      );

      // 2. 创建新页面
      const newPageIndex = pageNode.attrs.index + 1;
      await this.createNewPage(newPageIndex);

      // 3. 等待DOM更新
      await this.waitForDOMUpdate();

      // 4. 查找新创建的页面内容区域
      const newPageContentInfo = this.findPageContentByIndex(newPageIndex);
      if (!newPageContentInfo) {
        throw new Error("Failed to find new page content area");
      }

      // 5. 将溢出内容插入新页面
      const insertTr = this.editor.state.tr;
      insertTr.insert(newPageContentInfo.pageContentPos + 1, truncationResult.overflowContent);

      // 6. 将光标移动到新页面的内容末尾
      const newCursorPos = newPageContentInfo.pageContentPos + 1 + truncationResult.overflowContent.size;
      insertTr.setSelection(this.editor.state.selection.constructor.near(
        insertTr.doc.resolve(newCursorPos)
      ));

      // 7. 提交事务
      this.editor.view.dispatch(insertTr);

      // 发出新页面创建事件
      this.eventManager.emitNewPageCreated({
        pageIndex: newPageIndex,
        totalPages: this.editor.storage.page?.total || 0,
        insertedContentSize: truncationResult.overflowContent.size
      });

    } catch (error) {
      // 使用错误恢复管理器处理错误
      const recovery = await this.errorRecoveryManager.handleError(error as Error, {
        operation: 'createNewPageWithContent',
        pageIndex: pageNode.attrs.index,
        retryCount: this.retryCount
      });
      
      // 重试机制
      if (!recovery.recovered && this.retryCount < this.options.maxRetries) {
        this.retryCount++;
        setTimeout(() => {
          this.processAutoPageBreak();
        }, 200 * Math.pow(2, this.retryCount));
      }
    }
  }

  /**
   * 创建新页面
   */
  private async createNewPage(pageIndex: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 使用现有的addNewPage命令
        const result = this.editor.commands.addNewPage();
        if (result) {
          resolve();
        } else {
          reject(new Error("addNewPage command failed"));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 等待DOM更新完成
   */
  private waitForDOMUpdate(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  /**
   * 根据页面索引查找页面内容信息
   */
  private findPageContentByIndex(pageIndex: number): {
    pageContentNode: ProseMirrorNode;
    pageContentPos: number;
  } | null {
    let result: any = null;

    this.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "page" && node.attrs.index === pageIndex) {
        node.content.forEach((child, offset) => {
          if (child.type.name === "pageContent") {
            result = {
              pageContentNode: child,
              pageContentPos: pos + offset + 1
            };
          }
        });
        return false;
      }
    });

    return result;
  }

  /**
   * 绑定事件监听器
   */
  private bindEvents(): void {
    // 绑定输入法事件监听
    const editorElement = this.editor.view.dom;
    this.compositionListener.bind(editorElement);
  }

  /**
   * 发出自定义事件（已废弃，使用eventManager）
   */
  private emitEvent(eventName: string, data: any): void {
    // 保持向后兼容性
    const event = new CustomEvent(eventName, { detail: data });
    this.editor.view.dom.dispatchEvent(event);
  }

  /**
   * 更新配置选项
   */
  updateOptions(newOptions: Partial<AutoPageBreakOptions>): void {
    const oldOptions = { ...this.options };
    this.options = { ...this.options, ...newOptions };
    
    // 发出状态变更事件
    this.eventManager.emitStatusChanged({
      enabled: this.options.enabled,
      isProcessing: this.isProcessing,
      configChanges: newOptions
    });
  }

  /**
   * 启用自动换页
   */
  enable(): void {
    const wasEnabled = this.options.enabled;
    this.options.enabled = true;
    
    if (!wasEnabled) {
      this.eventManager.emitStatusChanged({
        enabled: true,
        isProcessing: this.isProcessing
      });
    }
  }

  /**
   * 禁用自动换页
   */
  disable(): void {
    const wasEnabled = this.options.enabled;
    this.options.enabled = false;
    
    if (wasEnabled) {
      this.eventManager.emitStatusChanged({
        enabled: false,
        isProcessing: this.isProcessing
      });
    }
  }

  /**
   * 手动触发自动换页检查
   */
  triggerManualCheck(): void {
    if (this.options.enabled) {
      this.scheduleAutoPageBreak();
    }
  }

  /**
   * 获取性能优化器
   */
  getPerformanceOptimizer(): PerformanceOptimizer {
    return this.performanceOptimizer;
  }

  /**
   * 获取错误恢复管理器
   */
  getErrorRecoveryManager(): ErrorRecoveryManager {
    return this.errorRecoveryManager;
  }

  /**
   * 获取事件管理器
   */
  getEventManager(): AutoPageBreakEventManager {
    return this.eventManager;
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    enabled: boolean;
    isProcessing: boolean;
    options: AutoPageBreakOptions;
    eventStats: Record<string, number>;
    performanceReport: any;
    errorStats: any;
    boundaryCheck: any;
  } {
    return {
      enabled: this.options.enabled,
      isProcessing: this.isProcessing,
      options: { ...this.options },
      eventStats: this.eventManager.getEventStatistics(),
      performanceReport: this.performanceOptimizer.getPerformanceReport(),
      errorStats: this.errorRecoveryManager.getErrorStatistics(),
      boundaryCheck: this.errorRecoveryManager.getBoundaryChecker().performComprehensiveCheck()
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.compositionListener.unbind();
    this.contentTruncator.dispose();
    this.eventManager.dispose();
    this.performanceOptimizer.dispose();
    globalInputDetector.reset();
  }
}

/**
 * 创建自动换页管理器实例
 */
export function createAutoPageBreakManager(
  editor: Editor, 
  options?: Partial<AutoPageBreakOptions>
): AutoPageBreakManager {
  return new AutoPageBreakManager(editor, options);
}