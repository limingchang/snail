/**
 * 页眉 / 页脚的契约。
 *
 * `PageHeader` 与 `PageFooter` 是**同一实现按 side 参数化**（`utils/furniture.ts`）；本文件描述公开
 * API 的两半，这样使用方可以只导入自己需要的选项类型，而不必导入工厂。旧版带的 `textFormat` 字符串
 * 已经去掉：那正是「新页面」在默认文档里抛错（`schema.text("")`，缺陷 1）、并在结构编辑后留下过期
 * 页码（缺陷 10）的原因；有了 `pageNumber` **节点**，页眉文本就是用户可以选中、排版和定位的普通
 * 内容。同理也去掉了 `align`：一个栏现在是三个区域（左 / 中 / 右），各自有自己的对齐方式。
 *
 * Header and footer contracts.
 *
 * `PageHeader` and `PageFooter` are **one implementation parametrised by side**
 * (`utils/furniture.ts`); this file describes both halves of the public API so a
 * consumer can import the option type it needs without importing the factory.
 *
 * ## What is deliberately gone
 *
 * The legacy header/footer carried a `textFormat` string — a template like
 * `"第#页，共&页"` that `createPageHeader` materialised into a real text node on every
 * flush. That is exactly what made 「新页面」 throw in a default document
 * (`schema.text("")`, defect 1) and what left the numbers stale after any structural
 * edit (defect 10). With the `pageNumber` **node** the header's text is ordinary content
 * that the user can select, format and position, so `textFormat` has no job left and is
 * not part of this API. See the removal note in the module report.
 *
 * The same reasoning removed `align`: a band is three regions now (left, centre, right), each
 * with its own alignment, so one `text-align` on the box could only ever contradict them. A
 * stored template that still carries the attribute loads unchanged — the attribute is simply no
 * longer declared, so ProseMirror drops it.
 */

/** 页眉 / 页脚在纸张的哪一端。 / Which end of the sheet a furniture node sits on. */
export type FurnitureSide = "top" | "bottom";

/** 页眉 / 页脚容器的文本对齐方式。 / Text alignment for a header/footer box. */
export type TextAlign = "left" | "center" | "right" | "justify";

/** 区域在页眉或页脚的哪三分之一。 / Which third of a header or footer a region occupies. */
export type FurnitureSlot = "left" | "center" | "right";

/** 三个槽位，用于校验。 / The three slots, for validation. */
export const FURNITURE_SLOTS = ["left", "center", "right"] as const;

/**
 * 槽位的布局顺序，也是栏内各区域保持的顺序。
 *
 * The slots in layout order — the order a band's regions are kept in.
 */
export const SLOT_ORDER: readonly FurnitureSlot[] = FURNITURE_SLOTS;

/**
 * 某个槽位自身内容的默认对齐方式。
 *
 * 这就是取代栏级 `align` 属性的东西：左三分之一左对齐、中间三分之一居中、右三分之一右对齐——只有
 * 这样「左 / 中 / 右」才有意义。区域内的块仍然可以覆盖它。
 *
 * The alignment a slot's own content defaults to.
 *
 * This is what replaced the band-level `align` attribute: the left third reads flush left, the
 * centre third centred and the right third flush right, which is the only arrangement in which
 * "left / centre / right" means anything. A block inside a region can still override it.
 */
export const SLOT_ALIGN: Record<FurnitureSlot, TextAlign> = {
  left: "left",
  center: "center",
  right: "right"
};

/** 两个页眉 / 页脚节点共有的属性。 / Attributes shared by both furniture nodes. */
export interface FurnitureAttributes {
  /**
   * 容器高度，单位为 **CSS 像素**。
   *
   * 用像素而不是 CSS 长度，是因为这个值会被布局求解器回代到可用高度的计算里，也因为它原来是数字。
   * 请从 `node.attrs.height` 读取，绝不要读 `extension.options`（缺陷 20：旧的节点视图读
   * `this.options.height`，于是逐节点的高度被忽略）。
   *
   * Box height in **CSS pixels**.
   *
   * Pixels rather than a CSS length because this is the value the layout solver feeds
   * back into the available-height computation, and because both legacy panels authored
   * it as a number. Read it from `node.attrs.height`, never from `extension.options`
   * (defect 20: the legacy node views read `this.options.height`, so a per-node height
   * was ignored).
   */
  height: number;

  /**
   * 在页眉 / 页脚与正文之间画一条线。
   *
   * 只有一种拼写：旧版属性叫 `headerLing` 而选项叫 `headerLine`，所以设置文档里写的选项不会生效
   * （缺陷 20）。
   *
   * Draw a rule between the furniture and the body.
   *
   * One spelling only: the legacy had the attribute `headerLing` but the option
   * `headerLine`, so setting the documented option changed nothing (defect 20).
   */
  showLine: boolean;
}

/** `pageRegion` 节点的属性。 / The `pageRegion` node's attributes. */
export interface RegionAttributes {
  /** 本区域是栏的哪三分之一。 / Which third of the band this region is. */
  slot: FurnitureSlot;
}

/**
 * `PageRegion.configure(...)` 接受的选项。
 *
 * Options accepted by `PageRegion.configure(...)`.
 */
export interface RegionOptions {
  /**
   * 新建区域未指定槽位时的默认槽位；默认 `"center"`。
   *
   * Default slot for a region created without one. Default `"center"`.
   */
  slot?: FurnitureSlot;
  /** 渲染元素的额外 HTML 属性。 / Extra HTML attributes for the rendered element. */
  HTMLAttributes?: Record<string, string>;
}

/** `pageHeader` 节点的属性。 / The `pageHeader` node's attributes. */
export type PageHeaderAttributes = FurnitureAttributes;

/** `pageFooter` 节点的属性。 / The `pageFooter` node's attributes. */
export type PageFooterAttributes = FurnitureAttributes;

/**
 * `PageHeader.configure(...)` 接受的选项。
 *
 * Options accepted by `PageHeader.configure(...)`.
 */
export interface PageHeaderOptions {
  /** 容器高度，单位为 CSS 像素。 / Box height in CSS pixels. */
  height?: number;
  /** 是否在页眉/页脚与正文之间画线。 / Draw a rule between the furniture and the body. */
  showLine?: boolean;
  /** 渲染元素的额外 HTML 属性。 / Extra HTML attributes for the rendered element. */
  HTMLAttributes?: Record<string, string>;
}

/**
 * `PageFooter.configure(...)` 接受的选项。
 *
 * Options accepted by `PageFooter.configure(...)`.
 */
export interface PageFooterOptions {
  /** 容器高度，单位为 CSS 像素。 / Box height in CSS pixels. */
  height?: number;
  /** 是否在页眉/页脚与正文之间画线。 / Draw a rule between the furniture and the body. */
  showLine?: boolean;
  /** 渲染元素的额外 HTML 属性。 / Extra HTML attributes for the rendered element. */
  HTMLAttributes?: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageHeader: {
      /**
       * 给每一个还没有页眉的页面（或指定的某一页）加上页眉。
       *
       * 幂等，而且在页面没有页眉时也不会抛错——旧版 `createPage` 连这种状态都构建不出来
       * （缺陷 9）。
       * 新页眉自带三个空区域，并插在页面正文**之前**，所以文档顺序永远是页眉 → 正文 → 页脚。
       *
       * Give a header to every page that lacks one (or to a single page).
       *
       * Idempotent, and never throws on a page that has no header — the state the legacy
       * `createPage` could not even build (defect 9). A new header arrives with its three empty
       * regions, and is inserted **before** the page's body, so the document order is always
       * header → body → footer.
       */
      addHeader: (pageIndex?: number) => ReturnType;

      /**
       * 从每一个有页眉的页面（或指定的某一页）移除页眉。
       *
       * Remove the header from every page that has one (or from a single page).
       */
      removeHeader: (pageIndex?: number) => ReturnType;

      /**
       * 设置容器高度，单位为像素；没有实际变化时返回 `false`（缺陷 17）。
       *
       * Set the box height in pixels. Returns `false` when nothing changed (defect 17).
       */
      setHeaderHeight: (height: number, pageIndex?: number) => ReturnType;
    };

    pageFooter: {
      /**
       * 给每一个还没有页脚的页面（或指定的某一页）加上页脚。
       *
       * Give a footer to every page that lacks one (or to a single page).
       */
      addFooter: (pageIndex?: number) => ReturnType;

      /**
       * 从每一个有页脚的页面（或指定的某一页）移除页脚。
       *
       * Remove the footer from every page that has one (or from a single page).
       */
      removeFooter: (pageIndex?: number) => ReturnType;

      /**
       * 设置容器高度，单位为像素；没有实际变化时返回 `false`。
       *
       * Set the box height in pixels. Returns `false` when nothing changed.
       */
      setFooterHeight: (height: number, pageIndex?: number) => ReturnType;
    };
  }
}
