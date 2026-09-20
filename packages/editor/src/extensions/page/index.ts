/**
 * The page module's public surface.
 *
 * This is what `SEditor`/`useEditorRuntime` imports: the six extensions, the page/paper
 * types, and the small pure helpers a UI panel needs (paper resolution, the page-number
 * label formatter).
 *
 * Everything is re-exported explicitly — including `export type` for the type-only entries —
 * because the package builds with `isolatedModules` and `verbatimModuleSyntax`, where a
 * bare `export *` from a module that only declares types is not safe to emit.
 */

/** The six extensions. Node names: `page`, `pageContent`, `pageHeader`, `pageFooter`, `pageLogo`, `pageNumber`. */
export { Page } from "./page";
export { PageContent } from "./pageContent/pageContent";
export { PageFooter } from "./pageFooter/pageFooter";
export { PageHeader } from "./pageHeader/pageHeader";
export { PageLogo } from "./pageLogo/pageLogo";
export { PageNumber } from "./pageNumber/pageNumber";

/** The pagination plugin, for a consumer that wants to identify or remove it. */
export { PAGINATION_META, paginationPluginKey } from "./pageContent/paginator";

/** The pure engine: exported so a host can plan a layout without an editor. */
export { DEFAULT_PAGINATION_TOLERANCE, planPagination, planPullback } from "./utils/pagination";

/**
 * Page counting, for the "第 X 页 / 共 Y 页" status bar.
 *
 * `getPageCount()` is a command and therefore returns `boolean` (Tiptap's command contract);
 * the *number* is maintained on `editor.storage.page.total` and can also be read directly
 * as `countPages(editor.state.doc)`.
 */
export { collectPages, countPages, resolvePageNumber } from "./utils/nodes";

/** The page-number label formatter (pure, so a status bar can reuse it). */
export { formatPageNumberLabel } from "./utils/pageNumberLabel";

/** The CSS length resolver, shared with the measurer (defect 12's fix). */
export {
  DEFAULT_ROOT_FONT_SIZE,
  mmToPx,
  pxToMm,
  resolveCssLength,
  resolveCssLengthOr
} from "./utils/length";

/** Node/attribute readers. Pure, so a settings panel can normalise a stored template. */
export {
  readBoolean,
  readCss,
  readLogoPosition,
  readMargins,
  readNumber,
  readOrientation,
  readPaperFormat,
  readString,
  readTextAlign
} from "./utils/attributes";

/** Attribute defaults and DOM class names. */
export {
  DEFAULT_FOOTER_ALIGN,
  DEFAULT_FURNITURE_HEIGHT,
  DEFAULT_FURNITURE_LINE,
  DEFAULT_HEADER_ALIGN,
  DEFAULT_LOGO_ATTRIBUTES,
  DEFAULT_ORIENTATION,
  DEFAULT_PAGE_AUTO,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAGE_NUMBER_ATTRIBUTES,
  DEFAULT_PAPER_FORMAT,
  CSS_VARIABLE,
  DATA_TYPE,
  FURNITURE_CONTENT_CLASS,
  FURNITURE_LINE_CLASS,
  PAGE_CLASS,
  PAGE_CONTENT_CLASS,
  PAGE_CONTENT_INNER_CLASS,
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS,
  PAGE_INNER_CLASS,
  PAGE_LOGO_CLASS,
  PAGE_LOGO_PLACEHOLDER_CLASS,
  PAGE_NUMBER_CLASS
} from "./constant";

/** The paper model, re-exported from `typings/paper.ts` (one definition, two consumers). */
export { DEFAULT_MARGINS, PAPER_SIZES, resolveMargins, resolvePaperSize } from "../../typings/paper";

export type { CssLength, Margins, NamedPaperFormat, Orientation, PaperFormat, PaperSize, ResolvedMargins } from "../../typings/paper";

export type {
  FurnitureAttributes,
  FurnitureSide,
  LogoPosition,
  PageAttributes,
  PageContentOptions,
  PageContentStorage,
  PageFooterAttributes,
  PageFooterOptions,
  PageHeaderAttributes,
  PageHeaderOptions,
  PageLogoAttributes,
  PageLogoOptions,
  PageNumberAttributes,
  PageNumberOptions,
  PageOptions,
  PageStorage,
  PaginationController,
  PaginationDiagnostics,
  TextAlign
} from "./typing";
