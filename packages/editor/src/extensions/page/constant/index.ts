/**
 * 页面模块的常量以及纸张 / 几何相关的再导出。
 *
 * `PAPER_SIZES`、`PaperFormat`、`Orientation` 和 `Margins` 都来自 `typings/paper.ts`；在
 * `import { DEFAULT_MARGINS } from "@snail-js/editor/page"` 处再导出，使使用方拿到的是顶层组件
 * 用的*同一批*对象，而不是一份可能漂移的副本。
 *
 * The page module's constants and its paper/geometry re-exports.
 *
 * `PAPER_SIZES`, `PaperFormat`, `Orientation` and `Margins` come from
 * `typings/paper.ts`; re-exporting them here means a consumer writing
 * `import { DEFAULT_MARGINS } from "@snail-js/editor/page"` gets the *same* objects the
 * top-level component uses, rather than a second copy that can drift.
 */

export {
  DEFAULT_FURNITURE_HEIGHT,
  DEFAULT_FURNITURE_LINE,
  DEFAULT_LOGO_ATTRIBUTES,
  DEFAULT_ORIENTATION,
  DEFAULT_PAGE_AUTO,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAGE_NUMBER_ATTRIBUTES,
  DEFAULT_PAPER_FORMAT
} from "./defaults";

export {
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
  PAGE_NUMBER_CLASS,
  PAGE_REGION_CLASS,
  PAGE_REGION_CONTENT_CLASS,
  REGION_EDITING_CLASS,
  REGION_LOCKED_CLASS
} from "./dom";

export type { Margins, Orientation, PaperFormat, PaperSize, ResolvedMargins } from "../../../typings/paper";

export {
  DEFAULT_MARGINS,
  PAPER_SIZES,
  resolveMargins,
  resolvePaperSize
} from "../../../typings/paper";
