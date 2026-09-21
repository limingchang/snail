/**
 * 自动页码。
 *
 * 一个**内联原子节点**，标签在渲染时由所在页面的页码算出来。任何内容都不会写进文档——这就是缺陷 1
 * 和缺陷 10 的完整修复。
 *
 * The automatic page number.
 *
 * An **inline atom** whose label is computed at render time from the enclosing page's
 * number. Nothing is ever written into the document — that is the entire fix for defects
 * 1 and 10.
 */

import type { FurnitureSide, FurnitureSlot } from "./headerFooter";

/** `pageNumber` 节点的属性。 / The `pageNumber` node's attributes. */
export interface PageNumberAttributes {
  /**
   * 输出模式。`{page}` 和 `{total}` 会被替换；旧版的 `#` / `&`（以及 `$index` / `$total`）写法也
   * 接受，这样老的模板字符串在升级后仍能渲染。
   *
   * Output pattern. `{page}` and `{total}` are substituted, and the legacy `#` / `&`
   * (plus `$index` / `$total`) spellings are accepted so an old template string keeps
   * rendering after the upgrade.
   */
  format: string;
}

/**
 * `PageNumber.configure(...)` 接受的选项。
 *
 * Options accepted by `PageNumber.configure(...)`.
 */
export interface PageNumberOptions {
  /**
   * 新建节点的默认 {@link PageNumberAttributes.format}。
   *
   * Default {@link PageNumberAttributes.format} for new nodes.
   */
  format?: string;
  /** 渲染元素的额外 HTML 属性。 / Extra HTML attributes for the rendered element. */
  HTMLAttributes?: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageNumber: {
      /**
       * 在选区处插入一个页码，例如插进用户正在编辑的区域里。
       *
       * schema 里没有 `pageNumber` 节点，或选区无法容纳内联节点时返回 `false`——以前正是这种情况
       * 让变量插入器抛出异常（缺陷 29）。
       *
       * Insert a page number at the selection, e.g. into a region the user is editing.
       *
       * Returns `false` when the schema has no `pageNumber` node or the selection cannot
       * hold an inline node — the case that used to throw out of the variable inserter
       * (defect 29).
       */
      insertPageNumber: (format?: string) => ReturnType;

      /**
       * 设置每一页页码的格式；某一页的页眉 / 页脚还没有页码时，就创建它。
       *
       * 这就是 页码格式 控件背后的命令：打开页脚会让它保持为空，于是「把格式写到已有页码上」无处可
       * 写——所以这里直接把页码创建出来，放在默认位置（页脚中间三分之一）。
       * 没有任何页面能容纳页码，
       * 或每个号码已经是该格式时返回 `false`。
       *
       * Set the format on every page's page number, creating the number when a page's
       * furniture has none.
       *
       * This is the command behind the 页码格式 control: turning a footer on leaves it empty,
       * so "write the format onto the existing numbers" would have nothing to write to — the
       * number is created here instead, in the default placement (the footer's centre third).
       * Returns `false` when no page can hold a number, or every number already reads that way.
       */
      applyPageNumberFormat: (format: string) => ReturnType;

      /**
       * 把页码放到页眉或页脚的指定区域（左 / 中 / 右）。
       *
       * 中文：一页只有一个页码，移动到新区域会删除旧的（并保留其格式）；目标页眉 / 页脚或该区域不存在
       * 时会先创建；放置后该区域不可编辑。返回 `false` 表示每一页都已经在那个区域里。
       *
       * Move every page's number into one region of one band. One number per page — moving it
       * removes the old one and keeps its format — and the band or region is created when it does
       * not exist yet. Returns `false` when every page is already there.
       */
      setPageNumberSlot: (side: FurnitureSide, slot: FurnitureSlot) => ReturnType;

      /**
       * 移除所有页码（面板上的「不显示」），被占用的区域随之恢复可编辑。
       *
       * Remove every page number — the panel's 不显示 — which unlocks the region it occupied.
       */
      removePageNumber: () => ReturnType;
    };
  }
}
