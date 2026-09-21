/**
 * 页面模型的属性默认值。
 *
 * 纸张、方向与页边距**不**在这里重新声明：它们由 `typings/paper.ts` 统一持有，这样页面扩展与顶层
 * 组件就不会对 `"A4"` 的含义或 `top` 是哪一边产生分歧。这里只放页面特有的默认值。
 *
 * Attribute defaults for the page model.
 *
 * Paper, orientation and margins are **not** redeclared here: `typings/paper.ts` owns
 * them so the page extension and the top-level component cannot disagree about what
 * `"A4"` means or which side of the sheet `top` is on. Only page-specific defaults live
 * in this file.
 */

import { DEFAULT_MARGINS } from "../../../typings/paper";
import type { Margins, Orientation, PaperFormat } from "../../../typings/paper";
import type { LogoAttributes } from "../typing/pageLogo";
import type { PageNumberAttributes } from "../typing/pageNumber";

/**
 * 页面总是从第 1 页开始；其后的重编号过程会保持它正确。
 *
 * A page always starts as page 1; the renumbering pass keeps it honest afterwards.
 */
export const DEFAULT_PAGE_INDEX = 1;

/**
 * A4 纵向是产品默认值，也是旧包文档记录的同一个默认值。
 *
 * A4 portrait is the product default, and the same default the old package documented.
 */
export const DEFAULT_PAPER_FORMAT: PaperFormat = "A4";
/** 默认纸张方向为纵向。 / The default orientation is portrait. */
export const DEFAULT_ORIENTATION: Orientation = "portrait";
/** 默认页边距取共享纸张模型中的 `DEFAULT_MARGINS`。 / Defaults to the shared `DEFAULT_MARGINS`. */
export const DEFAULT_PAGE_MARGINS: Margins = DEFAULT_MARGINS;

/**
 * `auto` 标记分页引擎自己创建的页面。
 *
 * 这些页在内容变少时可能再次消失，而用户用 `insertPageBreak` / `addNewPage` 要来的页面不会；
 * 从已保存模板恢复的页面默认为 `false`，也就是绝不会在用户背后被删除。
 *
 * `auto` marks the pages the pagination engine created itself.
 *
 * These are the pages that may disappear again when content shrinks, unlike a page the
 * user asked for with `insertPageBreak`/`addNewPage`. Pages restored from a stored
 * template default to `false`, i.e. they are never removed behind the user's back.
 */
export const DEFAULT_PAGE_AUTO = false;

/** 页眉 / 页脚容器的高度，单位为 CSS 像素。 / Header/footer box height in CSS pixels. */
export const DEFAULT_FURNITURE_HEIGHT = 50;

/**
 * 除非显式要求，页眉 / 页脚与正文之间不画分隔线。
 *
 * No rule between the furniture and the body unless asked for.
 */
export const DEFAULT_FURNITURE_LINE = false;

/**
 * 默认的 Logo 盒子；`height: "auto"` 保持图片自身的宽高比。
 *
 * 现在没有 `position` 了：Logo 的位置就是它所在的**区域**（页眉或页脚的左 / 中 / 右），这是文档的
 * 属性而不是图片的属性；旧的 `position` / `offsetX` / `offsetY` 属性由
 * `utils/migrateFurniture.ts` 迁移成区域。
 *
 * The default logo box; `height: "auto"` keeps the file's aspect ratio.
 *
 * There is no `position` any more: the logo's place is the **region** it sits in (left, centre or
 * right of the header or the footer), which is a property of the document rather than of the
 * image. The legacy `position`/`offsetX`/`offsetY` attributes are migrated into a region by
 * `utils/migrateFurniture.ts`.
 */
export const DEFAULT_LOGO_ATTRIBUTES: LogoAttributes = {
  src: "",
  width: "30mm",
  height: "auto"
};

/**
 * 默认的页码文本。
 *
 * `{page}` / `{total}` 在渲染时替换——它们从不写入文档，这正是缺陷 1（`schema.text("")` 抛错）和
 * 缺陷 10（结构编辑后页码过期）不会卷土重来的原因。
 *
 * The default page-number text.
 *
 * `{page}`/`{total}` are substituted at render time — never written into the document,
 * which is what keeps defect 1 (`schema.text("")` throwing) and defect 10 (numbers that
 * go stale after a structural edit) from coming back.
 */
export const DEFAULT_PAGE_NUMBER_ATTRIBUTES: PageNumberAttributes = {
  format: "第{page}页，共{total}页"
};
