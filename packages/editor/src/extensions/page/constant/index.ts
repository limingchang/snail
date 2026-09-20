/**
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
  DEFAULT_FOOTER_ALIGN,
  DEFAULT_HEADER_ALIGN,
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
  PAGE_NUMBER_CLASS
} from "./dom";

export type { Margins, Orientation, PaperFormat, PaperSize, ResolvedMargins } from "../../../typings/paper";

export {
  DEFAULT_MARGINS,
  PAPER_SIZES,
  resolveMargins,
  resolvePaperSize
} from "../../../typings/paper";
