/**
 * NodeView实例注册表
 * 用于管理页头页脚NodeView实例，支持动态样式更新
 */

export interface HeaderFooterNodeView {
  /** 销毁状态标志 */
  isDestroyed: boolean;
  /** 更新样式方法 */
  updateStyles(margins: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  }): void;
  /** 销毁方法 - 不应调用unregisterNodeView */
  destroy(): void;
  /** DOM元素引用 */
  dom: HTMLElement;
}

/**
 * NodeView注册表，以编辑器实例为键
 */
const nodeViewRegistries = new WeakMap<any, Map<string, HeaderFooterNodeView>>();

/**
 * 生成节点唯一标识
 * @param nodeType 节点类型 ('pageHeader' | 'pageFooter')
 * @param position 节点在文档中的位置
 * @returns 唯一标识字符串
 */
function generateNodeKey(nodeType: string, position: number): string {
  return `${nodeType}_${position}`;
}

/**
 * 注册NodeView实例
 * @param editor 编辑器实例
 * @param nodeType 节点类型
 * @param position 节点位置
 * @param nodeView NodeView实例
 */
export function registerNodeView(
  editor: any,
  nodeType: string,
  position: number,
  nodeView: HeaderFooterNodeView
): void {
  let registry = nodeViewRegistries.get(editor);
  if (!registry) {
    registry = new Map();
    nodeViewRegistries.set(editor, registry);
  }
  
  const key = generateNodeKey(nodeType, position);
  registry.set(key, nodeView);
}

/**
 * 注销NodeView实例
 * @param editor 编辑器实例
 * @param nodeType 节点类型
 * @param position 节点位置
 */
export function unregisterNodeView(
  editor: any,
  nodeType: string,
  position: number
): void {
  const registry = nodeViewRegistries.get(editor);
  if (!registry) return;
  
  const key = generateNodeKey(nodeType, position);
  // 直接删除，不调用destroy避免循环引用
  registry.delete(key);
}

/**
 * 获取NodeView实例
 * @param editor 编辑器实例
 * @param nodeType 节点类型
 * @param position 节点位置
 * @returns NodeView实例或undefined
 */
export function getNodeView(
  editor: any,
  nodeType: string,
  position: number
): HeaderFooterNodeView | undefined {
  const registry = nodeViewRegistries.get(editor);
  if (!registry) return undefined;
  
  const key = generateNodeKey(nodeType, position);
  return registry.get(key);
}

/**
 * 获取指定页面范围内的所有页头页脚NodeView实例
 * @param editor 编辑器实例
 * @param pagePos 页面节点位置
 * @param pageSize 页面节点大小
 * @returns 页头页脚NodeView实例数组
 */
export function getPageHeaderFooterViews(
  editor: any,
  pagePos: number,
  pageSize: number
): HeaderFooterNodeView[] {
  const registry = nodeViewRegistries.get(editor);
  if (!registry) return [];
  
  const views: HeaderFooterNodeView[] = [];
  
  // 遍历注册表查找在指定页面范围内的页头页脚
  for (const [key, nodeView] of registry.entries()) {
    const [nodeType, positionStr] = key.split('_');
    const position = parseInt(positionStr, 10);
    
    // 检查是否是页头或页脚节点，且在当前页面范围内
    if (
      (nodeType === 'pageHeader' || nodeType === 'pageFooter') &&
      position > pagePos &&
      position < pagePos + pageSize
    ) {
      views.push(nodeView);
    }
  }
  
  return views;
}

/**
 * 清理编辑器相关的所有NodeView实例
 * @param editor 编辑器实例
 */
export function clearEditorNodeViews(editor: any): void {
  const registry = nodeViewRegistries.get(editor);
  if (!registry) return;
  
  // 销毁所有NodeView实例
  for (const nodeView of registry.values()) {
    nodeView.destroy();
  }
  
  // 清理注册表
  registry.clear();
  nodeViewRegistries.delete(editor);
}