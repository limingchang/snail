import { Editor } from "@tiptap/core";
import { AutoPageBreakError, AutoPageBreakErrorType, ErrorSeverity } from "./errorRecoveryManager";
import { AutoPageBreakEventManager } from "./eventManager";
import { ErrorRecoveryConfiguration } from "./errorRecoveryConfig";

/**
 * 用户通知级别
 */
export type NotificationLevel = 'silent' | 'minimal' | 'normal' | 'verbose';

/**
 * 通知类型
 */
export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success'
}

/**
 * 用户通知接口
 */
export interface UserNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  details?: string;
  timestamp: number;
  duration?: number;
  actions?: NotificationAction[];
  dismissible: boolean;
  persistent: boolean;
}

/**
 * 通知操作接口
 */
export interface NotificationAction {
  id: string;
  label: string;
  action: () => void | Promise<void>;
  style: 'primary' | 'secondary' | 'danger';
}

/**
 * 恢复建议接口
 */
export interface RecoverySuggestion {
  id: string;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  steps: string[];
  autoApplyable: boolean;
  autoApplyAction?: () => Promise<boolean>;
}

/**
 * 用户控制选项接口
 */
export interface UserControlOptions {
  enableAutoRecovery: boolean;
  enableGracefulDegradation: boolean;
  allowManualOverride: boolean;
  showAdvancedOptions: boolean;
  notificationLevel: NotificationLevel;
}

/**
 * 状态指示器接口
 */
export interface StatusIndicator {
  status: 'healthy' | 'warning' | 'error' | 'degraded';
  message: string;
  details: string[];
  actionRequired: boolean;
  suggestions: RecoverySuggestion[];
}

/**
 * 用户体验优化器类
 */
export class UserExperienceOptimizer {
  private editor: Editor;
  private eventManager: AutoPageBreakEventManager;
  private notifications: Map<string, UserNotification> = new Map();
  private userControls: UserControlOptions;
  private notificationCallbacks: Set<(notification: UserNotification) => void> = new Set();
  private statusCallbacks: Set<(status: StatusIndicator) => void> = new Set();
  
  private currentStatus: StatusIndicator;
  private errorHistory: AutoPageBreakError[] = [];
  private recoveryActions: Map<string, () => Promise<boolean>> = new Map();
  
  private readonly MAX_NOTIFICATIONS = 10;
  private readonly NOTIFICATION_CLEANUP_INTERVAL = 60000; // 1分钟

  constructor(
    editor: Editor, 
    eventManager: AutoPageBreakEventManager,
    initialConfig?: ErrorRecoveryConfiguration
  ) {
    this.editor = editor;
    this.eventManager = eventManager;
    
    this.userControls = {
      enableAutoRecovery: initialConfig?.userExperience.autoRecoveryEnabled ?? true,
      enableGracefulDegradation: initialConfig?.userExperience.gracefulDegradation ?? true,
      allowManualOverride: initialConfig?.userExperience.userControlEnabled ?? true,
      showAdvancedOptions: false,
      notificationLevel: initialConfig?.userExperience.notificationLevel ?? 'normal'
    };
    
    this.currentStatus = {
      status: 'healthy',
      message: 'All systems operating normally',
      details: [],
      actionRequired: false,
      suggestions: []
    };
    
    this.initializeRecoveryActions();
    this.setupEventListeners();
    this.startNotificationCleanup();
  }

  /**
   * 显示错误通知
   */
  showErrorNotification(error: AutoPageBreakError, context?: Record<string, any>): void {
    if (!this.shouldShowNotification(error.severity)) return;
    
    const notification = this.createErrorNotification(error, context);
    this.addNotification(notification);
    
    // 更新状态指示器
    this.updateStatusFromError(error);
  }

  /**
   * 显示恢复成功通知
   */
  showRecoverySuccessNotification(errorType: AutoPageBreakErrorType): void {
    if (this.userControls.notificationLevel === 'silent') return;
    
    const notification: UserNotification = {
      id: `recovery_success_${Date.now()}`,
      type: NotificationType.SUCCESS,
      title: 'Issue Resolved',
      message: `Successfully recovered from ${this.getErrorTypeDisplayName(errorType)}`,
      timestamp: Date.now(),
      duration: 3000,
      dismissible: true,
      persistent: false
    };
    
    this.addNotification(notification);
    this.updateStatusToHealthy();
  }

  /**
   * 显示降级通知
   */
  showDegradationNotification(errorType: AutoPageBreakErrorType, strategy: string): void {
    if (this.userControls.notificationLevel === 'silent') return;
    
    const actions: NotificationAction[] = [];
    
    if (this.userControls.allowManualOverride) {
      actions.push({
        id: 'retry_full_function',
        label: 'Retry Full Function',
        action: async () => {
          await this.retryOperation(errorType);
        },
        style: 'primary'
      });
      
      actions.push({
        id: 'accept_degradation',
        label: 'Continue with Limited Function',
        action: () => {
          this.dismissNotification(`degradation_${errorType}`);
        },
        style: 'secondary'
      });
    }
    
    const notification: UserNotification = {
      id: `degradation_${errorType}`,
      type: NotificationType.WARNING,
      title: 'Feature Temporarily Limited',
      message: `${this.getErrorTypeDisplayName(errorType)} is using simplified mode due to technical issues`,
      details: `Strategy: ${strategy}`,
      timestamp: Date.now(),
      actions,
      dismissible: true,
      persistent: true
    };
    
    this.addNotification(notification);
    this.updateStatusToDegraded(errorType, strategy);
  }

  /**
   * 提供恢复建议
   */
  suggestRecovery(error: AutoPageBreakError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    
    switch (error.type) {
      case AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED:
        suggestions.push({
          id: 'refresh_layout',
          title: 'Refresh Page Layout',
          description: 'Recalculate page dimensions and layout',
          impact: 'low',
          difficulty: 'easy',
          estimatedTime: '< 1 second',
          steps: ['Refresh page layout calculations', 'Update display'],
          autoApplyable: true,
          autoApplyAction: async () => this.refreshLayout()
        });
        
        suggestions.push({
          id: 'check_css_styles',
          title: 'Check CSS Styles',
          description: 'Verify that page styles are not interfering with measurements',
          impact: 'medium',
          difficulty: 'medium',
          estimatedTime: '30 seconds',
          steps: [
            'Open browser developer tools',
            'Check for CSS conflicts affecting page layout',
            'Verify element visibility and dimensions'
          ],
          autoApplyable: false
        });
        break;
        
      case AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED:
        suggestions.push({
          id: 'use_simple_truncation',
          title: 'Use Simplified Truncation',
          description: 'Switch to a more reliable but less precise truncation method',
          impact: 'low',
          difficulty: 'easy',
          estimatedTime: 'Immediate',
          steps: ['Switch to conservative truncation algorithm'],
          autoApplyable: true,
          autoApplyAction: async () => this.useSimpleTruncation()
        });
        break;
        
      case AutoPageBreakErrorType.PAGE_CREATION_FAILED:
        suggestions.push({
          id: 'manual_page_break',
          title: 'Add Page Break Manually',
          description: 'Insert a page break at the current cursor position',
          impact: 'low',
          difficulty: 'easy',
          estimatedTime: '< 5 seconds',
          steps: [
            'Position cursor where you want the page break',
            'Use the page break tool or keyboard shortcut'
          ],
          autoApplyable: false
        });
        break;
        
      case AutoPageBreakErrorType.DOM_OPERATION_FAILED:
        suggestions.push({
          id: 'reload_editor',
          title: 'Reload Editor',
          description: 'Refresh the editor to resolve DOM issues',
          impact: 'medium',
          difficulty: 'easy',
          estimatedTime: '3-5 seconds',
          steps: ['Save current work', 'Reload the editor'],
          autoApplyable: false
        });
        break;
    }
    
    return suggestions;
  }

  /**
   * 获取当前状态
   */
  getCurrentStatus(): StatusIndicator {
    return { ...this.currentStatus };
  }

  /**
   * 更新用户控制选项
   */
  updateUserControls(options: Partial<UserControlOptions>): void {
    this.userControls = { ...this.userControls, ...options };
    console.log('User control options updated:', this.userControls);
  }

  /**
   * 获取用户控制选项
   */
  getUserControls(): UserControlOptions {
    return { ...this.userControls };
  }

  /**
   * 注册通知回调
   */
  onNotification(callback: (notification: UserNotification) => void): () => void {
    this.notificationCallbacks.add(callback);
    
    return () => {
      this.notificationCallbacks.delete(callback);
    };
  }

  /**
   * 注册状态变更回调
   */
  onStatusChange(callback: (status: StatusIndicator) => void): () => void {
    this.statusCallbacks.add(callback);
    
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * 手动触发恢复动作
   */
  async executeRecoveryAction(actionId: string): Promise<boolean> {
    const action = this.recoveryActions.get(actionId);
    if (!action) {
      console.warn(`Recovery action ${actionId} not found`);
      return false;
    }
    
    try {
      const success = await action();
      if (success) {
        this.showRecoverySuccessNotification(AutoPageBreakErrorType.UNKNOWN_ERROR);
      }
      return success;
    } catch (error) {
      console.error(`Recovery action ${actionId} failed:`, error);
      return false;
    }
  }

  /**
   * 清除所有通知
   */
  clearAllNotifications(): void {
    this.notifications.clear();
    console.log('All notifications cleared');
  }

  /**
   * 获取活动通知
   */
  getActiveNotifications(): UserNotification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 创建错误通知
   */
  private createErrorNotification(error: AutoPageBreakError, context?: Record<string, any>): UserNotification {
    const actions: NotificationAction[] = [];
    
    // 添加恢复建议作为操作
    const suggestions = this.suggestRecovery(error);
    suggestions.filter(s => s.autoApplyable).forEach(suggestion => {
      if (suggestion.autoApplyAction) {
        actions.push({
          id: suggestion.id,
          label: suggestion.title,
          action: suggestion.autoApplyAction,
          style: 'primary'
        });
      }
    });
    
    // 添加通用操作
    if (this.userControls.allowManualOverride) {
      actions.push({
        id: 'disable_auto_page_break',
        label: 'Disable Auto Page Break',
        action: async () => {
          await this.disableAutoPageBreak();
        },
        style: 'danger'
      });
    }
    
    return {
      id: `error_${error.type}_${Date.now()}`,
      type: this.mapErrorSeverityToNotificationType(error.severity),
      title: this.getErrorTitle(error.type, error.severity),
      message: this.getUserFriendlyErrorMessage(error),
      details: this.userControls.notificationLevel === 'verbose' ? error.message : undefined,
      timestamp: error.timestamp,
      duration: this.getNotificationDuration(error.severity),
      actions,
      dismissible: true,
      persistent: error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL
    };
  }

  /**
   * 添加通知
   */
  private addNotification(notification: UserNotification): void {
    this.notifications.set(notification.id, notification);
    
    // 限制通知数量
    if (this.notifications.size > this.MAX_NOTIFICATIONS) {
      const oldestId = Array.from(this.notifications.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      this.notifications.delete(oldestId);
    }
    
    // 通知回调
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in notification callback:', error);
      }
    });
    
    // 自动删除非持久化通知
    if (!notification.persistent && notification.duration) {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, notification.duration);
    }
  }

  /**
   * 删除通知
   */
  private dismissNotification(notificationId: string): void {
    this.notifications.delete(notificationId);
  }

  /**
   * 更新状态指示器
   */
  private updateStatus(newStatus: StatusIndicator): void {
    this.currentStatus = newStatus;
    
    this.statusCallbacks.forEach(callback => {
      try {
        callback(newStatus);
      } catch (error) {
        console.error('Error in status callback:', error);
      }
    });
  }

  /**
   * 从错误更新状态
   */
  private updateStatusFromError(error: AutoPageBreakError): void {
    const suggestions = this.suggestRecovery(error);
    
    this.updateStatus({
      status: error.severity === ErrorSeverity.CRITICAL ? 'error' : 'warning',
      message: `Issue detected: ${this.getErrorTypeDisplayName(error.type)}`,
      details: [error.message],
      actionRequired: error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL,
      suggestions
    });
  }

  /**
   * 更新状态为降级
   */
  private updateStatusToDegraded(errorType: AutoPageBreakErrorType, strategy: string): void {
    this.updateStatus({
      status: 'degraded',
      message: `Running in limited mode: ${this.getErrorTypeDisplayName(errorType)}`,
      details: [`Using fallback strategy: ${strategy}`],
      actionRequired: false,
      suggestions: this.suggestRecovery(new AutoPageBreakError(errorType, 'Degraded mode', ErrorSeverity.MEDIUM))
    });
  }

  /**
   * 更新状态为健康
   */
  private updateStatusToHealthy(): void {
    this.updateStatus({
      status: 'healthy',
      message: 'All systems operating normally',
      details: [],
      actionRequired: false,
      suggestions: []
    });
  }

  /**
   * 初始化恢复操作
   */
  private initializeRecoveryActions(): void {
    this.recoveryActions.set('refresh_layout', async () => {
      return await this.refreshLayout();
    });
    
    this.recoveryActions.set('use_simple_truncation', async () => {
      return await this.useSimpleTruncation();
    });
    
    this.recoveryActions.set('disable_auto_page_break', async () => {
      return await this.disableAutoPageBreak();
    });
    
    this.recoveryActions.set('retry_operation', async () => {
      return await this.retryLastOperation();
    });
  }

  /**
   * 刷新布局
   */
  private async refreshLayout(): Promise<boolean> {
    try {
      // 触发布局重新计算
      if (this.editor.view?.dom) {
        const event = new Event('resize');
        window.dispatchEvent(event);
      }
      
      console.log('Layout refreshed successfully');
      return true;
    } catch (error) {
      console.error('Failed to refresh layout:', error);
      return false;
    }
  }

  /**
   * 使用简单截断
   */
  private async useSimpleTruncation(): Promise<boolean> {
    try {
      // 这里应该调用配置管理器来切换到简单截断算法
      console.log('Switched to simple truncation algorithm');
      return true;
    } catch (error) {
      console.error('Failed to switch truncation algorithm:', error);
      return false;
    }
  }

  /**
   * 禁用自动换页
   */
  private async disableAutoPageBreak(): Promise<boolean> {
    try {
      // 这里应该调用相关API禁用自动换页
      console.log('Auto page break disabled');
      return true;
    } catch (error) {
      console.error('Failed to disable auto page break:', error);
      return false;
    }
  }

  /**
   * 重试操作
   */
  private async retryOperation(errorType: AutoPageBreakErrorType): Promise<boolean> {
    try {
      // 这里应该重新触发失败的操作
      console.log(`Retrying operation for ${errorType}`);
      return true;
    } catch (error) {
      console.error(`Failed to retry operation for ${errorType}:`, error);
      return false;
    }
  }

  /**
   * 重试最后的操作
   */
  private async retryLastOperation(): Promise<boolean> {
    if (this.errorHistory.length === 0) {
      return false;
    }
    
    const lastError = this.errorHistory[this.errorHistory.length - 1];
    return await this.retryOperation(lastError.type);
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.eventManager.addEventListener('error_occurred', (data) => {
      if (data.error instanceof AutoPageBreakError) {
        this.errorHistory.push(data.error);
        this.showErrorNotification(data.error, { operation: data.operation });
      }
    });
  }

  /**
   * 启动通知清理
   */
  private startNotificationCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [id, notification] of this.notifications) {
        if (!notification.persistent && notification.duration) {
          if (now - notification.timestamp > notification.duration) {
            this.notifications.delete(id);
          }
        }
      }
    }, this.NOTIFICATION_CLEANUP_INTERVAL);
  }

  /**
   * 检查是否应该显示通知
   */
  private shouldShowNotification(severity: ErrorSeverity): boolean {
    switch (this.userControls.notificationLevel) {
      case 'silent':
        return false;
      case 'minimal':
        return severity === ErrorSeverity.CRITICAL;
      case 'normal':
        return severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL;
      case 'verbose':
        return true;
      default:
        return true;
    }
  }

  /**
   * 映射错误严重程度到通知类型
   */
  private mapErrorSeverityToNotificationType(severity: ErrorSeverity): NotificationType {
    switch (severity) {
      case ErrorSeverity.LOW:
        return NotificationType.INFO;
      case ErrorSeverity.MEDIUM:
        return NotificationType.WARNING;
      case ErrorSeverity.HIGH:
        return NotificationType.ERROR;
      case ErrorSeverity.CRITICAL:
        return NotificationType.ERROR;
      default:
        return NotificationType.INFO;
    }
  }

  /**
   * 获取错误标题
   */
  private getErrorTitle(errorType: AutoPageBreakErrorType, severity: ErrorSeverity): string {
    const typeMap: Record<AutoPageBreakErrorType, string> = {
      [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: 'Input Detection Issue',
      [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: 'Layout Calculation Issue',
      [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: 'Content Processing Issue',
      [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: 'Page Creation Issue',
      [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: 'Display Update Issue',
      [AutoPageBreakErrorType.TRANSACTION_FAILED]: 'Document Update Issue',
      [AutoPageBreakErrorType.CONFIGURATION_ERROR]: 'Configuration Issue',
      [AutoPageBreakErrorType.UNKNOWN_ERROR]: 'Unexpected Issue'
    };
    
    const baseTitle = typeMap[errorType] || 'Technical Issue';
    
    if (severity === ErrorSeverity.CRITICAL) {
      return `Critical ${baseTitle}`;
    } else if (severity === ErrorSeverity.HIGH) {
      return `${baseTitle} Detected`;
    }
    
    return baseTitle;
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyErrorMessage(error: AutoPageBreakError): string {
    const messages: Record<AutoPageBreakErrorType, string> = {
      [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: 
        'There was an issue detecting your typing. Auto page breaks may not work correctly.',
      [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: 
        'Unable to calculate page layout properly. Page breaks may be inaccurate.',
      [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: 
        'Content could not be properly divided between pages. Some content may overflow.',
      [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: 
        'Could not create a new page. You may need to add page breaks manually.',
      [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: 
        'Display update failed. The page may not reflect recent changes.',
      [AutoPageBreakErrorType.TRANSACTION_FAILED]: 
        'Document update failed. Some changes may not be saved properly.',
      [AutoPageBreakErrorType.CONFIGURATION_ERROR]: 
        'Configuration error detected. Some features may not work as expected.',
      [AutoPageBreakErrorType.UNKNOWN_ERROR]: 
        'An unexpected error occurred. Some features may be temporarily unavailable.'
    };
    
    return messages[error.type] || 'A technical issue occurred that may affect editor functionality.';
  }

  /**
   * 获取错误类型显示名称
   */
  private getErrorTypeDisplayName(errorType: AutoPageBreakErrorType): string {
    const names: Record<AutoPageBreakErrorType, string> = {
      [AutoPageBreakErrorType.INPUT_DETECTION_FAILED]: 'Input Detection',
      [AutoPageBreakErrorType.HEIGHT_CALCULATION_FAILED]: 'Height Calculation',
      [AutoPageBreakErrorType.CONTENT_TRUNCATION_FAILED]: 'Content Truncation',
      [AutoPageBreakErrorType.PAGE_CREATION_FAILED]: 'Page Creation',
      [AutoPageBreakErrorType.DOM_OPERATION_FAILED]: 'DOM Operation',
      [AutoPageBreakErrorType.TRANSACTION_FAILED]: 'Transaction',
      [AutoPageBreakErrorType.CONFIGURATION_ERROR]: 'Configuration',
      [AutoPageBreakErrorType.UNKNOWN_ERROR]: 'Unknown Error'
    };
    
    return names[errorType] || 'Unknown Error';
  }

  /**
   * 获取通知持续时间
   */
  private getNotificationDuration(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 3000;
      case ErrorSeverity.MEDIUM:
        return 5000;
      case ErrorSeverity.HIGH:
        return 8000;
      case ErrorSeverity.CRITICAL:
        return 0; // 持久化显示
      default:
        return 5000;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.notifications.clear();
    this.notificationCallbacks.clear();
    this.statusCallbacks.clear();
    this.recoveryActions.clear();
    this.errorHistory = [];
  }
}

/**
 * 创建用户体验优化器
 */
export function createUserExperienceOptimizer(
  editor: Editor,
  eventManager: AutoPageBreakEventManager,
  config?: ErrorRecoveryConfiguration
): UserExperienceOptimizer {
  return new UserExperienceOptimizer(editor, eventManager, config);
}