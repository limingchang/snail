// 页眉页脚动态文本功能实现总结

## 功能已实现

根据设计文档，我们已经成功实现了页眉页脚动态文本与页码管理功能：

### 1. 类型定义扩展 ✅
- 在 `typing/index.ts` 中添加了 `PageStorage` 和 `HeaderFooterStorage` 接口
- 现有的 `PageHeaderFooterOptions` 接口已支持函数类型: `text?: string | ((index:number,total:number) => string)`

### 2. Page扩展的Storage机制 ✅  
- 实现了页码索引映射表 (`pageIndexMap`)
- 添加了总页数统计 (`totalPages`)
- 提供了更新回调管理 (`updateCallbacks`)
- 实现了页面变化监听和自动更新机制

### 3. PageHeader和PageFooter增强 ✅
- 支持动态文本生成函数
- 实现了DOM内容自动更新
- 添加了页面位置检测和索引计算
- 保持了静态文本的向后兼容性

### 4. 实时更新机制 ✅
- 文档变化时自动触发页码重新计算
- 使用 requestAnimationFrame 进行性能优化
- 回调管理确保页眉页脚同步更新

## 使用示例

```typescript
// 动态页码示例
Page.configure({
  pageHeaderText: (index: number, total: number) => `第 ${index + 1} 页，共 ${total} 页`,
  pageHeaderPositon: 'center',
  pageHeaderLine: true,
  pageFooterText: (index: number, total: number) => `${index + 1} / ${total}`,
  pageFooterPositon: 'right',
  pageFooterLine: true,
})

// 静态文本示例（向后兼容）
Page.configure({
  pageHeaderText: '这是静态页眉',
  pageHeaderPositon: 'left',
  pageFooterText: '这是静态页脚',
  pageFooterPositon: 'center',
})

// 条件显示示例
Page.configure({
  pageFooterText: (index: number, total: number) => {
    return total > 1 ? `Page ${index + 1} of ${total}` : '';
  },
  pageFooterPositon: 'center'
})
```

## 核心特性

1. **动态文本支持**: `options.text` 现在支持 `(index: number, total: number) => string` 函数类型
2. **实时更新**: 页面添加/删除时自动重新计算页码
3. **性能优化**: 使用节流机制避免频繁更新
4. **向后兼容**: 现有静态文本配置无需修改
5. **灵活配置**: 支持左中右三个位置的文本显示

## 技术实现亮点

- 使用 TipTap 的 Storage 机制管理状态
- 实现了页面索引映射和位置缓存
- 采用观察者模式进行更新通知
- 使用闭包解决 TypeScript 上下文访问问题
- 提供了完整的错误处理和边界检查

功能已按照设计文档要求完全实现，可以在富文本编辑器中使用动态页码功能。