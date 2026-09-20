/**
 * Class names and data attributes shared by the page node views, the measurer and the
 * stylesheet.
 *
 * The legacy package styled `.tiptap-page*` while rendering
 * `section.s-editor-page` / `.page-header` / `.page-content` / `.page-footer`, and no
 * stylesheet defined the rendered names at all — so `min-height`, `overflow` and
 * `contain` silently never applied (defect 18). One table, used by every producer.
 */

/** The paper box. */
export const PAGE_CLASS = "s-editor-page";

/** The column inside the paper box that holds the header, content and footer. */
export const PAGE_INNER_CLASS = "s-editor-page-inner";

/** The page body. Its padding is driven by the page's CSS custom properties. */
export const PAGE_CONTENT_CLASS = "s-editor-page-content";

/** The element ProseMirror renders the body's blocks into. */
export const PAGE_CONTENT_INNER_CLASS = "s-editor-page-content-inner";

/** The header box. */
export const PAGE_HEADER_CLASS = "s-editor-page-header";

/** The footer box. */
export const PAGE_FOOTER_CLASS = "s-editor-page-footer";

/** The editable element inside a header or footer. */
export const FURNITURE_CONTENT_CLASS = "s-editor-page-furniture-content";

/** The absolutely-positioned logo overlay, a sibling of the page's contentDOM. */
export const PAGE_LOGO_CLASS = "s-editor-page-logo";

/** The hidden placeholder ProseMirror renders the `pageLogo` node itself as. */
export const PAGE_LOGO_PLACEHOLDER_CLASS = "s-editor-page-logo-placeholder";

/** The rendered page number. */
export const PAGE_NUMBER_CLASS = "s-editor-page-number";

/** Added to a header/footer whose `showLine` attribute is on. */
export const FURNITURE_LINE_CLASS = "has-line";

/**
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

/** `data-type` values, used both to render and to parse. */
export const DATA_TYPE = {
  page: "page",
  pageContent: "page-content",
  pageHeader: "page-header",
  pageFooter: "page-footer",
  pageLogo: "page-logo",
  pageNumber: "page-number"
} as const;
