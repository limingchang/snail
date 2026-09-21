/**
 * 页面各节点视图、测量器与样式表共用的类名和数据属性。
 *
 * Class names and data attributes shared by the page node views, the measurer and the
 * stylesheet.
 *
 * The legacy package styled `.tiptap-page*` while rendering
 * `section.s-editor-page` / `.page-header` / `.page-content` / `.page-footer`, and no
 * stylesheet defined the rendered names at all — so `min-height`, `overflow` and
 * `contain` silently never applied (defect 18). One table, used by every producer.
 */

/** 纸张容器。 / The paper box. */
export const PAGE_CLASS = "s-editor-page";

/**
 * 纸张内部承载页眉、正文与页脚的列。
 *
 * The column inside the paper box that holds the header, content and footer.
 */
export const PAGE_INNER_CLASS = "s-editor-page-inner";

/**
 * 页面正文；它的内边距由页面的 CSS 自定义属性驱动。
 *
 * The page body. Its padding is driven by the page's CSS custom properties.
 */
export const PAGE_CONTENT_CLASS = "s-editor-page-content";

/** ProseMirror 渲染正文各块的元素。 / The element ProseMirror renders the body's blocks into. */
export const PAGE_CONTENT_INNER_CLASS = "s-editor-page-content-inner";

/** 页眉容器。 / The header box. */
export const PAGE_HEADER_CLASS = "s-editor-page-header";

/** 页脚容器。 / The footer box. */
export const PAGE_FOOTER_CLASS = "s-editor-page-footer";

/** 页眉或页脚内部可编辑的元素。 / The editable element inside a header or footer. */
export const FURNITURE_CONTENT_CLASS = "s-editor-page-furniture-content";

/** 页眉或页脚的三分之一。 / One third of a header or footer (a `pageRegion`). */
export const PAGE_REGION_CLASS = "s-editor-page-region";

/** 区域的块渲染进其中的元素。 / The element a region's blocks are rendered into. */
export const PAGE_REGION_CONTENT_CLASS = "s-editor-page-region-content";

/**
 * 加在用户正在编辑的区域上（以及它所在的页眉 / 页脚）。
 *
 * Added to the region the user is editing (and to its band).
 */
export const REGION_EDITING_CLASS = "is-editing";

/**
 * 加在放着页码或 Logo 的区域上。
 *
 * 这样的区域完全不可编辑：页码是原子节点，Logo 是图片，没有可输入的内容；让光标进入只会给用户
 * 一个误删该放置的机会。
 *
 * Added to a region that holds the page number or the logo.
 *
 * Such a region is not editable at all: the page number is an atom and the logo is an image, so
 * there is nothing to type, and letting the caret in would only offer the user a way to delete
 * the placement by accident.
 */
export const REGION_LOCKED_CLASS = "is-locked";

/**
 * `pageLogo` 节点视图渲染的 `<img>` 元素的类名。
 *
 * The absolutely-positioned logo overlay, a sibling of the page's contentDOM.
 */
export const PAGE_LOGO_CLASS = "s-editor-page-logo";

/**
 * 旧版 `pageLogo` 占位元素的类名；本包渲染 Logo 用的是 `PAGE_LOGO_CLASS`。
 *
 * The hidden placeholder ProseMirror renders the `pageLogo` node itself as.
 */
export const PAGE_LOGO_PLACEHOLDER_CLASS = "s-editor-page-logo-placeholder";

/** 渲染后的页码。 / The rendered page number. */
export const PAGE_NUMBER_CLASS = "s-editor-page-number";

/**
 * 加在 `showLine` 属性为开的页眉 / 页脚上。
 *
 * Added to a header/footer whose `showLine` attribute is on.
 */
export const FURNITURE_LINE_CLASS = "has-line";

/**
 * 页面节点视图写入外边距所用的 CSS 自定义属性。
 *
 * CSS custom properties the page node view writes its margins into.
 *
 * Margins belong to the `page` node, but the padding that consumes them is on
 * `.snail-page-content`, which ProseMirror does *not* update when only the page's
 * attributes change (a node view's `update` is only called for its own node). Passing
 * them down as inherited custom properties means the body restyles itself with no
 * JavaScript at all — and the measurer still reads the resolved padding off the DOM.
 */
export const CSS_VARIABLE = {
  marginTop: "--snail-page-margin-top",
  marginRight: "--snail-page-margin-right",
  marginBottom: "--snail-page-margin-bottom",
  marginLeft: "--snail-page-margin-left"
} as const;

/** `data-type` 的取值，渲染与解析共用。 / `data-type` values, used both to render and to parse. */
export const DATA_TYPE = {
  page: "page",
  pageContent: "page-content",
  pageHeader: "page-header",
  pageFooter: "page-footer",
  pageRegion: "page-region",
  pageLogo: "page-logo",
  pageNumber: "page-number"
} as const;
