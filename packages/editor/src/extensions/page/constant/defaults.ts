/**
 * Attribute defaults for the page model.
 *
 * Paper, orientation and margins are **not** redeclared here: `typings/paper.ts` owns
 * them so the page extension and the top-level component cannot disagree about what
 * `"A4"` means or which side of the sheet `top` is on. Only page-specific defaults live
 * in this file.
 */

import { DEFAULT_MARGINS } from "../../../typings/paper";
import type { Margins, Orientation, PaperFormat } from "../../../typings/paper";
import type { PageLogoAttributes } from "../typing/pageLogo";
import type { PageNumberAttributes } from "../typing/pageNumber";
import type { TextAlign } from "../typing/headerFooter";

/** A page always starts as page 1; the renumbering pass keeps it honest afterwards. */
export const DEFAULT_PAGE_INDEX = 1;

/** A4 portrait is the product default, and the same default the old package documented. */
export const DEFAULT_PAPER_FORMAT: PaperFormat = "A4";
export const DEFAULT_ORIENTATION: Orientation = "portrait";
export const DEFAULT_PAGE_MARGINS: Margins = DEFAULT_MARGINS;

/**
 * `auto` marks the pages the pagination engine created itself.
 *
 * These are the pages that may disappear again when content shrinks, unlike a page the
 * user asked for with `insertPageBreak`/`addNewPage`. Pages restored from a stored
 * template default to `false`, i.e. they are never removed behind the user's back.
 */
export const DEFAULT_PAGE_AUTO = false;

/** Header/footer box height in CSS pixels. */
export const DEFAULT_FURNITURE_HEIGHT = 50;

/** The header's default alignment (the legacy header defaulted to right). */
export const DEFAULT_HEADER_ALIGN: TextAlign = "right";

/** The footer's default alignment (the legacy footer defaulted to center). */
export const DEFAULT_FOOTER_ALIGN: TextAlign = "center";

/** No rule between the furniture and the body unless asked for. */
export const DEFAULT_FURNITURE_LINE = false;

/** The default logo box; `height: "auto"` keeps the file's aspect ratio. */
export const DEFAULT_LOGO_ATTRIBUTES: PageLogoAttributes = {
  src: "",
  width: "30mm",
  height: "auto",
  position: "left",
  offsetX: 0,
  offsetY: 0
};

/**
 * The default page-number text.
 *
 * `{page}`/`{total}` are substituted at render time — never written into the document,
 * which is what keeps defect 1 (`schema.text("")` throwing) and defect 10 (numbers that
 * go stale after a structural edit) from coming back.
 */
export const DEFAULT_PAGE_NUMBER_ATTRIBUTES: PageNumberAttributes = {
  format: "第{page}页，共{total}页"
};
