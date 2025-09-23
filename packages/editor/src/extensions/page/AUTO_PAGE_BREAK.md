# PageContent 自动换页功能

## 概述

PageContent自动换页功能为富文本编辑器提供了智能的页面内容管理。当用户输入内容导致页面内容超出页面限制时，系统会自动截断内容并创建新页面，确保文档的专业布局。

## 特性

### 🚀 核心功能
- **智能输入检测**: 区分直接输入、输入法输入和程序化输入
- **精确高度计算**: 考虑纸张尺寸、页眉页脚、边距等因素
- **智能内容截断**: 支持字符级和单词级截断，保持格式完整性
- **自动页面创建**: 无缝创建新页面并迁移溢出内容
- **光标定位**: 自动将光标定位到合适位置

### ⚡ 性能优化
- **防抖机制**: 避免频繁触发换页检查
- **智能缓存**: 缓存高度计算和测量结果
- **虚拟测量**: 离屏DOM测量提升性能
- **批量操作**: 优化DOM操作和事务处理

### 🛡️ 错误处理
- **边界检查**: 全面的状态和环境检查
- **重试机制**: 指数退避重试策略
- **优雅降级**: 错误时的恢复策略
- **详细日志**: 完整的错误追踪和报告

### 📊 事件系统
- **实时通知**: 换页过程中的各种事件
- **历史记录**: 事件和错误历史
- **性能监控**: 实时性能指标
- **统计分析**: 详细的使用统计

## 快速开始

### 基础设置

```typescript
import { Editor } from '@tiptap/core';
import { PageContent, setupAutoPageBreak } from '@snail-js/editor';

// 1. 创建编辑器并包含PageContent扩展
const editor = new Editor({
  extensions: [
    PageContent,
    // ... 其他扩展
  ],
  content: '<page><page-content><p>Hello World!</p></page-content></page>'
});

// 2. 设置自动换页功能
const autoPageBreak = setupAutoPageBreak(editor, {
  enabled: true,
  breakThreshold: 0.95,      // 触发换页的高度阈值
  preserveWords: true,       // 保护单词完整性
  preserveParagraphs: false, // 是否保护段落完整性
  debounceDelay: 100,        // 防抖延迟(ms)
  maxRetries: 3              // 最大重试次数
});
```

### 事件监听

```typescript
// 监听换页相关事件
autoPageBreak.getEventManager().on('page_break_triggered', (data) => {
  console.log('自动换页触发:', {
    oldPageIndex: data.oldPageIndex,
    newPageIndex: data.newPageIndex,
    reason: data.reason
  });
});

autoPageBreak.getEventManager().on('content_truncated', (data) => {
  console.log('内容截断:', {
    pageIndex: data.pageIndex,
    originalSize: data.originalContentSize,
    remainingSize: data.remainingContentSize,
    overflowSize: data.overflowContentSize
  });
});

autoPageBreak.getEventManager().on('error_occurred', (data) => {
  console.error('自动换页错误:', data.error);
});
```

### 便捷监听器

```typescript
import { addAutoPageBreakListeners } from '@snail-js/editor';

// 使用便捷函数添加监听器
const cleanup = addAutoPageBreakListeners(editor, {
  onOverflow: (data) => {
    console.log('内容溢出检测:', data);
  },
  onPageBreak: (data) => {
    console.log('页面分割完成:', data);
    // 可以在这里更新UI，显示新的页码等
  },
  onError: (data) => {
    console.error('处理错误:', data.error);
    // 错误处理逻辑
  }
});

// 在组件卸载时清理监听器
// cleanup();
```

## 高级配置

### 精细化控制

```typescript
// 动态更新配置
autoPageBreak.updateOptions({
  breakThreshold: 0.9,       // 更严格的触发条件
  preserveParagraphs: true   // 启用段落保护
});

// 手动控制
autoPageBreak.disable();              // 禁用自动换页
autoPageBreak.enable();               // 启用自动换页
autoPageBreak.triggerManualCheck();   // 手动触发检查
```

### 使用编辑器命令

```typescript
// 通过编辑器命令控制
editor.commands.enableAutoPageBreak();    // 启用
editor.commands.disableAutoPageBreak();   // 禁用
editor.commands.triggerAutoPageBreak();   // 手动触发

// 配置选项
editor.commands.configureAutoPageBreak({
  breakThreshold: 0.8,
  preserveWords: false
});

// 获取状态
const status = editor.commands.getAutoPageBreakStatus();
console.log('自动换页状态:', status);
```

## 性能监控

### 获取性能报告

```typescript
import { getAutoPageBreakReport } from '@snail-js/editor';

// 获取详细的性能和状态报告
const report = getAutoPageBreakReport(autoPageBreak);
console.log('性能报告:', {
  status: report.status,           // 基本状态
  performance: report.performance, // 性能指标
  events: report.events,          // 事件统计
  errors: report.errors,          // 错误统计
  boundary: report.boundary       // 边界检查结果
});
```

### 调试工具

```typescript
import { createAutoPageBreakDebugger } from '@snail-js/editor';

// 创建调试工具
const debugger = createAutoPageBreakDebugger(autoPageBreak);

// 启用详细日志
debugger.enableVerboseLogging();

// 执行边界检查
const boundaryResult = debugger.checkBoundary();
console.log('边界检查:', boundaryResult);

// 清理缓存和历史
debugger.clearCache();
debugger.clearEventHistory();
debugger.clearErrorHistory();

// 手动触发检查
debugger.triggerCheck();
```

## 错误处理

### 错误类型

自动换页功能定义了多种错误类型：

- `INPUT_DETECTION_FAILED`: 输入检测失败
- `HEIGHT_CALCULATION_FAILED`: 高度计算失败
- `CONTENT_TRUNCATION_FAILED`: 内容截断失败
- `PAGE_CREATION_FAILED`: 页面创建失败
- `DOM_OPERATION_FAILED`: DOM操作失败
- `TRANSACTION_FAILED`: 事务处理失败
- `CONFIGURATION_ERROR`: 配置错误

### 自定义错误处理

```typescript
import { AutoPageBreakError, ErrorSeverity } from '@snail-js/editor';

// 监听错误事件
autoPageBreak.getEventManager().on('error_occurred', (data) => {
  const error = data.error;
  
  if (error instanceof AutoPageBreakError) {
    console.log('错误类型:', error.type);
    console.log('严重程度:', error.severity);
    console.log('是否可重试:', error.retryable);
    console.log('错误上下文:', error.context);
    
    // 根据错误类型和严重程度进行处理
    if (error.severity === ErrorSeverity.CRITICAL) {
      // 关键错误处理
      autoPageBreak.disable();
      alert('自动换页功能遇到严重错误，已自动禁用');
    }
  }
});
```

## 最佳实践

### 1. 性能优化

```typescript
// 推荐配置，平衡性能和用户体验
const optimizedConfig = {
  enabled: true,
  breakThreshold: 0.95,      // 适中的触发阈值
  preserveWords: true,       // 保护单词完整性
  preserveParagraphs: false, // 允许段落截断以获得更好的性能
  debounceDelay: 100,        // 适中的防抖延迟
  maxRetries: 3              // 合理的重试次数
};
```

### 2. 内存管理

```typescript
// 在组件卸载时清理资源
const cleanup = () => {
  autoPageBreak.dispose();
  // 如果使用了事件监听器，也要清理
  eventCleanup?.();
};

// React 示例
useEffect(() => {
  return cleanup;
}, []);

// Vue 示例
onUnmounted(() => {
  cleanup();
});
```

### 3. 错误监控

```typescript
// 设置错误监控和报告
const setupErrorMonitoring = (autoPageBreak) => {
  const errorRecoveryManager = autoPageBreak.getErrorRecoveryManager();
  
  // 定期检查错误统计
  setInterval(() => {
    const errorStats = errorRecoveryManager.getErrorStatistics();
    
    // 如果错误率过高，发出警告
    if (errorStats.total > 0) {
      const recentErrors = errorStats.recentErrors;
      const criticalErrors = recentErrors.filter(e => e.severity === 'critical');
      
      if (criticalErrors.length > 0) {
        console.warn('检测到严重错误，建议检查系统状态');
      }
    }
  }, 60000); // 每分钟检查一次
};
```

## 故障排除

### 常见问题

1. **自动换页不触发**
   - 检查PageContent扩展是否正确加载
   - 确认自动换页功能已启用
   - 检查输入类型是否被正确识别

2. **内容截断不准确**
   - 调整`breakThreshold`参数
   - 检查页面样式是否影响高度计算
   - 确认页眉页脚高度设置正确

3. **性能问题**
   - 增加`debounceDelay`值
   - 启用缓存功能
   - 检查是否有内存泄漏

4. **错误频发**
   - 查看错误日志确定问题类型
   - 检查DOM环境是否正常
   - 确认编辑器配置正确

### 调试步骤

```typescript
// 1. 检查基本状态
const status = autoPageBreak.getStatus();
console.log('状态检查:', status);

// 2. 执行边界检查
const debugger = createAutoPageBreakDebugger(autoPageBreak);
const boundaryCheck = debugger.checkBoundary();
console.log('边界检查:', boundaryCheck);

// 3. 查看错误历史
const errorStats = autoPageBreak.getErrorRecoveryManager().getErrorStatistics();
console.log('错误统计:', errorStats);

// 4. 启用详细日志
debugger.enableVerboseLogging();

// 5. 手动触发测试
debugger.triggerCheck();
```

## API 参考

详细的API文档请参考各个模块的类型定义文件：

- `AutoPageBreakManager`: 核心管理器
- `InputDetector`: 输入检测
- `PageHeightCalculator`: 高度计算
- `ContentTruncator`: 内容截断
- `AutoPageBreakEventManager`: 事件管理
- `PerformanceOptimizer`: 性能优化
- `ErrorRecoveryManager`: 错误恢复

## 贡献

欢迎提交Issue和Pull Request来改进自动换页功能。在提交之前，请确保：

1. 运行所有测试：`npm test`
2. 检查代码格式：`npm run lint`
3. 添加适当的测试用例
4. 更新相关文档

## 许可证

[MIT License](LICENSE)