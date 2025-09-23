import { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";

/**
 * 自动换页事件类型枚举
 */
export enum AutoPageBreakEventType {
  OVERFLOW_DETECTED = 'overflow_detected',
  PAGE_BREAK_TRIGGERED = 'page_break_triggered', 
  CONTENT_TRUNCATED = 'content_truncated',
  NEW_PAGE_CREATED = 'new_page_created',
  ERROR_OCCURRED = 'error_occurred',
  STATUS_CHANGED = 'status_changed'
}

/**
 * 基础事件数据接口
 */
export interface BaseEventData {
  timestamp: number;
  source: 'auto' | 'manual';
  editorId?: string;
}

/**
 * 内容溢出事件数据
 */
export interface OverflowDetectedEventData extends BaseEventData {
  pageIndex: number;
  overflowHeight: number;
  contentHeight: number;
  maxHeight: number;
}

/**
 * 换页触发事件数据
 */
export interface PageBreakTriggeredEventData extends BaseEventData {
  oldPageIndex: number;
  newPageIndex: number;
  reason: string;
  truncationPos: number;
}

/**
 * 内容截断事件数据
 */
export interface ContentTruncatedEventData extends BaseEventData {
  pageIndex: number;
  originalContentSize: number;
  remainingContentSize: number;
  overflowContentSize: number;
  truncationMethod: 'character' | 'word' | 'paragraph';
}

/**
 * 新页面创建事件数据
 */
export interface NewPageCreatedEventData extends BaseEventData {
  pageIndex: number;
  totalPages: number;
  insertedContentSize: number;
}

/**
 * 错误事件数据
 */
export interface ErrorEventData extends BaseEventData {
  error: Error;
  operation: string;
  pageIndex?: number;
  retryCount?: number;
}

/**
 * 状态变更事件数据
 */
export interface StatusChangedEventData extends BaseEventData {
  enabled: boolean;
  isProcessing: boolean;
  configChanges?: Record<string, any>;
}

/**
 * 事件监听器类型
 */
export type EventListener<T = any> = (data: T) => void;

/**
 * 自动换页事件管理器类
 * 负责管理所有与自动换页相关的事件
 */
export class AutoPageBreakEventManager {
  private editor: Editor;
  private listeners: Map<AutoPageBreakEventType, Set<EventListener>>;
  private eventHistory: Array<{ type: AutoPageBreakEventType; data: any; timestamp: number }>;
  private maxHistorySize: number = 100;

  constructor(editor: Editor) {
    this.editor = editor;
    this.listeners = new Map();
    this.eventHistory = [];
    
    // 初始化所有事件类型的监听器集合
    Object.values(AutoPageBreakEventType).forEach(eventType => {
      this.listeners.set(eventType, new Set());
    });
  }

  /**
   * 注册事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  on<T>(eventType: AutoPageBreakEventType, listener: EventListener<T>): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.add(listener);
    }
  }

  /**
   * 注册一次性事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  once<T>(eventType: AutoPageBreakEventType, listener: EventListener<T>): void {
    const onceListener = (data: T) => {
      listener(data);
      this.off(eventType, onceListener);
    };
    this.on(eventType, onceListener);
  }

  /**
   * 移除事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  off<T>(eventType: AutoPageBreakEventType, listener: EventListener<T>): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 移除所有指定类型的监听器
   * @param eventType 事件类型
   */
  removeAllListeners(eventType?: AutoPageBreakEventType): void {
    if (eventType) {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.clear();
      }
    } else {
      this.listeners.forEach(listeners => listeners.clear());
    }
  }

  /**
   * 发出事件
   * @param eventType 事件类型
   * @param data 事件数据
   */
  emit<T extends BaseEventData>(eventType: AutoPageBreakEventType, data: Omit<T, keyof BaseEventData> & Partial<BaseEventData>): void {
    const eventData = {
      timestamp: Date.now(),
      source: 'auto' as const,
      ...data
    } as T;

    // 记录事件历史
    this.recordEvent(eventType, eventData);

    // 通知所有监听器
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }

    // 同时发出DOM事件，便于外部组件监听
    this.emitDOMEvent(eventType, eventData);
  }

  /**
   * 发出内容溢出事件
   */
  emitOverflowDetected(data: Omit<OverflowDetectedEventData, keyof BaseEventData>): void {
    this.emit<OverflowDetectedEventData>(AutoPageBreakEventType.OVERFLOW_DETECTED, data);
  }

  /**
   * 发出换页触发事件
   */
  emitPageBreakTriggered(data: Omit<PageBreakTriggeredEventData, keyof BaseEventData>): void {
    this.emit<PageBreakTriggeredEventData>(AutoPageBreakEventType.PAGE_BREAK_TRIGGERED, data);
  }

  /**
   * 发出内容截断事件
   */
  emitContentTruncated(data: Omit<ContentTruncatedEventData, keyof BaseEventData>): void {
    this.emit<ContentTruncatedEventData>(AutoPageBreakEventType.CONTENT_TRUNCATED, data);
  }

  /**
   * 发出新页面创建事件
   */
  emitNewPageCreated(data: Omit<NewPageCreatedEventData, keyof BaseEventData>): void {
    this.emit<NewPageCreatedEventData>(AutoPageBreakEventType.NEW_PAGE_CREATED, data);
  }

  /**
   * 发出错误事件
   */
  emitError(data: Omit<ErrorEventData, keyof BaseEventData>): void {
    this.emit<ErrorEventData>(AutoPageBreakEventType.ERROR_OCCURRED, data);
  }

  /**
   * 发出状态变更事件
   */
  emitStatusChanged(data: Omit<StatusChangedEventData, keyof BaseEventData>): void {
    this.emit<StatusChangedEventData>(AutoPageBreakEventType.STATUS_CHANGED, data);
  }

  /**
   * 获取事件历史
   * @param eventType 可选的事件类型过滤
   * @param limit 返回的最大事件数量
   */
  getEventHistory(eventType?: AutoPageBreakEventType, limit: number = 50): Array<{ type: AutoPageBreakEventType; data: any; timestamp: number }> {
    let events = this.eventHistory;
    
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }
    
    return events.slice(-limit);
  }

  /**
   * 清空事件历史
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 获取事件统计信息
   */
  getEventStatistics(): Record<AutoPageBreakEventType, number> {
    const stats = {} as Record<AutoPageBreakEventType, number>;
    
    Object.values(AutoPageBreakEventType).forEach(eventType => {
      stats[eventType] = 0;
    });
    
    this.eventHistory.forEach(event => {
      stats[event.type]++;
    });
    
    return stats;
  }

  /**
   * 检查是否有监听器
   * @param eventType 事件类型
   */
  hasListeners(eventType: AutoPageBreakEventType): boolean {
    const listeners = this.listeners.get(eventType);
    return listeners ? listeners.size > 0 : false;
  }

  /**
   * 获取监听器数量
   * @param eventType 事件类型
   */
  getListenerCount(eventType?: AutoPageBreakEventType): number {
    if (eventType) {
      const listeners = this.listeners.get(eventType);
      return listeners ? listeners.size : 0;
    }
    
    let total = 0;
    this.listeners.forEach(listeners => {
      total += listeners.size;
    });
    return total;
  }

  /**
   * 记录事件到历史记录
   */
  private recordEvent(eventType: AutoPageBreakEventType, data: any): void {
    this.eventHistory.push({
      type: eventType,
      data,
      timestamp: Date.now()
    });

    // 限制历史记录大小
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 发出DOM事件
   */
  private emitDOMEvent(eventType: AutoPageBreakEventType, data: any): void {
    const domEvent = new CustomEvent(`autoPageBreak:${eventType}`, {
      detail: data,
      bubbles: true,
      cancelable: true
    });
    
    this.editor.view.dom.dispatchEvent(domEvent);
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.removeAllListeners();
    this.clearEventHistory();
  }
}

/**
 * 创建事件管理器实例
 */
export function createAutoPageBreakEventManager(editor: Editor): AutoPageBreakEventManager {
  return new AutoPageBreakEventManager(editor);
}

/**
 * 默认事件监听器工厂
 * 提供一些常用的事件监听器实现
 */
export class DefaultEventListeners {
  /**
   * 控制台日志监听器
   */
  static createConsoleLogger(prefix: string = '[AutoPageBreak]'): EventListener {
    return (data: any) => {
      console.log(`${prefix}`, data);
    };
  }

  /**
   * 错误监听器
   */
  static createErrorHandler(onError?: (error: Error, data: ErrorEventData) => void): EventListener<ErrorEventData> {
    return (data: ErrorEventData) => {
      console.error('Auto page break error:', data.error);
      if (onError) {
        onError(data.error, data);
      }
    };
  }

  /**
   * 统计监听器
   */
  static createStatisticsCollector(): {
    listener: EventListener;
    getStats: () => Record<string, number>;
    reset: () => void;
  } {
    const stats: Record<string, number> = {};
    
    return {
      listener: (data: any) => {
        const eventType = data.type || 'unknown';
        stats[eventType] = (stats[eventType] || 0) + 1;
      },
      getStats: () => ({ ...stats }),
      reset: () => {
        Object.keys(stats).forEach(key => delete stats[key]);
      }
    };
  }
}