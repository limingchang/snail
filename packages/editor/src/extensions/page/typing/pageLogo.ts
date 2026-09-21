/**
 * 可选的页面 Logo。
 *
 * 它以前是 **`page` 节点的子节点**，由页面自己的节点视图画成绝对定位的浮层。那种模型表达不了产品
 * 要的东西——「页脚左三分之一的 Logo」——因为页面的子节点没有「三分之一」：唯一的杠杆是
 * `position`
 * 属性加毫米偏移，标记浮在纸上而不是活在页眉 / 页脚里。现在 Logo 是 **`pageRegion` 里的一个块**，
 * 和页码完全一样：它所在的区域*就是*它的位置，它在那里时该区域被锁定（不可编辑），打印、保存和加载
 * 都从文档本身得来。
 *
 * 来源以 `data:` URL 存在文档里（模板是一个单一产物：引用一个打开模板时可能不存在的文件就不算
 * 模板）。
 * 这让文件大小变成文档大小，所以扩展会拒绝大于 {@link PageLogoOptions.maxBytes} 的来源，而不是悄悄
 * 产出没人能打开的模板。
 *
 * The optional page logo.
 *
 * ## What the logo is now
 *
 * It used to be a **child of the `page` node**, drawn as an absolutely positioned overlay by the
 * page's own node view. That model cannot express what the product asks for — "a logo in the left
 * third of the footer" — because a page child has no third: the only lever was a `position`
 * attribute plus millimetre offsets, and the mark floated over the paper rather than living in the
 * furniture.
 *
 * The logo is a **block inside a `pageRegion`** now, exactly like the page number: the region it
 * sits in *is* its placement, the region becomes locked (not editable) while it is there, and
 * printing, saving and loading all follow from the document. See `utils/regions.ts`.
 *
 * ## Size limit
 *
 * The source is stored as a `data:` URL inside the document (a template is a single artefact: a
 * reference to a file that may not exist when the template is opened is not a template). That
 * makes the file size a document size, so the extension refuses a source larger than
 * {@link PageLogoOptions.maxBytes} instead of quietly producing a template nobody can load.
 */

import type { CssLength } from "../../../typings/paper";

/**
 * Logo 在页面内容区里水平方向的位置。
 *
 * Where the logo sits horizontally inside the page's content area.
 */
export type LogoPosition = "left" | "center" | "right";

/** `pageLogo` 节点的属性。 / The `pageLogo` node's attributes. */
export interface LogoAttributes {
  /**
   * 图片来源。空字符串表示完全不渲染 Logo（节点仍然有效，所以「删掉文件」和「删掉节点」是两种不同
   * 的、都可恢复的状态）。
   *
   * The image source. An empty string renders no logo at all (the node is still valid, so
   * removing the file and removing the node are different, recoverable states).
   */
  src: string;

  /**
   * 渲染宽度，写成 CSS 长度（`"30mm"`、`"120px"`）。
   *
   * Rendered width, as a CSS length (`"30mm"`, `"120px"`).
   */
  width: CssLength;

  /**
   * 渲染高度，写成 CSS 长度；`"auto"` 保持文件自身的宽高比。
   *
   * Rendered height, as a CSS length. `"auto"` keeps the file's aspect ratio.
   */
  height: CssLength;
}

/**
 * 旧版形状，迁移仍然接受它。
 *
 * 已保存的模板带着 `position` / `offsetX` / `offsetY`；迁移把 `position` 变成 Logo 所在的区域，
 * 并丢弃偏移量（区域没有可偏移的原点）。
 *
 * The former shape, still accepted by the migration.
 *
 * A stored template carries `position`/`offsetX`/`offsetY`; the migration turns `position` into
 * the region the logo is placed in and drops the offsets (a region has no offsets to offset from).
 */
export interface LegacyLogoAttributes {
  /** 旧版的位置：`"left"` / `"center"` / `"right"`。 / The legacy shape's horizontal placement. */
  position?: LogoPosition;
  /** 旧版水平偏移；迁移会丢弃它。 / The legacy horizontal offset. */
  offsetX?: number;
  /** 旧版垂直偏移；迁移会丢弃它。 / The legacy vertical offset. */
  offsetY?: number;
}

/**
 * `PageLogo.configure(...)` 和 `Page.configure({ logo })` 都接受的选项。
 *
 * Options accepted by `PageLogo.configure(...)` and by `Page.configure({ logo })`.
 */
export interface PageLogoOptions {
  /** Logo 图片的来源，通常是 `data:` URL。 / The logo image source, usually a `data:` URL. */
  src?: string;
  /** 渲染宽度，写成 CSS 长度。 / Rendered width, as a CSS length. */
  width?: CssLength;
  /** 渲染高度，写成 CSS 长度。 / Rendered height, as a CSS length. */
  height?: CssLength;

  /**
   * 可接受的最大图片字节数；默认 200 KB。
   *
   * 来源以 `data:` URL 嵌进文档，所以这既是图片上限也是文档大小上限；一张 2 MB 的照片会产出一个加载
   * 慢、保存慢且无法 diff 的模板。
   *
   * Largest accepted image, in bytes. Default 200 KB.
   *
   * The source is embedded in the document as a `data:` URL, so this is a document-size limit as
   * much as an image limit; a 2 MB photograph would produce a template that is slow to load, slow
   * to save and impossible to diff.
   */
  maxBytes?: number;

  /** 渲染元素的额外 HTML 属性。 / Extra HTML attributes for the rendered element. */
  HTMLAttributes?: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageLogo: {
      /**
       * 把 Logo 放到指定区域：`side` 是页眉或页脚，`slot` 是左 / 中 / 右。
       *
       * 中文：同一时刻只有一个区域放 Logo —— 放到新区域时，原来的会被移除；该区域随后不可编辑。
       * `pageIndex` 是 1 起的页码，省略即作用于所有页。
       *
       * Place the logo in a region: `side` is the header or the footer, `slot` is left, centre or
       * right. Only one region holds a logo at a time — placing it in a new one removes the old —
       * and that region is not editable afterwards. `pageIndex` (1-based) narrows the change to
       * one page; omitting it applies to every page. Returns `false` when nothing changed.
       */
      setLogo: (
        placement: LogoPlacement,
        attributes?: Partial<LogoAttributes>,
        pageIndex?: number
      ) => ReturnType;

      /**
       * 从每一个有 Logo 的页面（或指定的某一页）移除它。
       *
       * Remove the logo from every page that has one (or from a single page).
       */
      removeLogo: (pageIndex?: number) => ReturnType;

      /**
       * 调整已经放置的 Logo 的尺寸；没有变化时返回 `false`。
       *
       * Resize the logo that is already placed. Returns `false` when nothing changed.
       */
      setLogoSize: (attributes: Partial<LogoAttributes>, pageIndex?: number) => ReturnType;
    };
  }
}

/**
 * Logo 要去哪里：哪一个栏，以及栏的哪三分之一。
 *
 * Where a logo goes: which band, and which third of it.
 */
export interface LogoPlacement {
  /**
   * `"top"` 表示页眉，`"bottom"` 表示页脚。
   *
   * `"top"` for the header, `"bottom"` for the footer.
   */
  side: "top" | "bottom";
  /** 该栏的哪三分之一。 / Which third of that band. */
  slot: "left" | "center" | "right";
}
