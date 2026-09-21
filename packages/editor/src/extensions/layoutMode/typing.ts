/**
 * `layoutMode` 扩展自身的契约。
 *
 * 「布局表格」是用来做分栏定位的无边框表格 —— 合同的签署栏、双栏的条款标题。Tiptap 没有等价物，
 * 而布局表格不是数据表格：它不该得到主题的单元格边框，它的行也必须被标记，好让行级规则能跟着
 * 生效。
 *
 * The `layoutMode` extension's own contract.
 *
 * A "layout table" is a borderless table used for column positioning — a contract's
 * signature block, a two-column clause header. Tiptap has no equivalent, and a layout table
 * is not a data table: it must not get the theme's cell borders, and its rows must be marked
 * too so the row-level rules can follow.
 */

/** 幂等 pass 想要标记的一个位置。 / A position the idempotent pass wants to mark. */
export interface LayoutModeFix {
  /** `tableRow` 节点的绝对位置。 / Absolute position of the `tableRow` node. */
  pos: number;
}

/**
 * 调用方可以配置的内容。
 *
 * 旧接口声明的是 `calssName` —— 一个拼写错误，所以该选项的真实名字（以及它产出的类名）只能
 * 靠读源码才能发现。这里是 `className`。旧的 `HTMLAttributes: Record<string, any>` 被删掉了：
 * 从来没有任何代码读过它。
 *
 * What a caller may configure.
 *
 * The legacy interface declared `calssName` — a typo, so the option's real name (and the
 * class it produced) was only discoverable by reading the source. It is `className` here.
 * The legacy `HTMLAttributes: Record<string, any>` is gone: nothing ever read it.
 */
export interface LayoutModeOptions {
  /**
   * 除 `table` 之外还会携带 `layoutMode` 的节点类型。
   *
   * 默认 `["tableRow"]`。`table` 总是被包含（去重后），因为一行只有在它的表格处于布局模式时
   * 才可能处于布局模式。
   *
   * Node types that carry `layoutMode`, in addition to `table`.
   *
   * Default `["tableRow"]`. `table` is always included (deduplicated), because a row can only
   * be in layout mode because its table is.
   */
  types: string[];

  /**
   * 处于布局模式的元素上添加的类名。默认 `"layout-mode"`。
   *
   * The class added to an element in layout mode. Default `"layout-mode"`.
   */
  className: string;
}
