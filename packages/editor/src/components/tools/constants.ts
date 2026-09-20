/**
 * The panels' pick-lists.
 *
 * The Chinese names are the legacy ones, kept verbatim: a contract drafter picks 「小四」,
 * not `12pt`. The `_GB2312` variants are the 公文 (official document) faces, which are a
 * real requirement in this domain and were already in the legacy list — dropping them to
 * "clean up" would break existing templates.
 *
 * Nothing here is a *default*: a default belongs to the extension or to
 * `typings/paper.ts`, so that the panel and the model cannot disagree. These are only the
 * choices a panel offers.
 */

import { PAPER_SIZES } from "../../typings/paper";
import type { NamedPaperFormat, ResolvedMargins } from "../../typings/paper";

/** A pick-list entry whose label is shown and whose value is stored. */
export interface Choice<T> {
  label: string;
  value: T;
}

/** The twelve Chinese families a contract uses, from the legacy `FontFamilyList`. */
export const FONT_FAMILIES: readonly Choice<string>[] = [
  { label: "宋体", value: "SimSun, serif" },
  { label: "黑体", value: "SimHei, sans-serif" },
  { label: "微软雅黑", value: "Microsoft YaHei, sans-serif" },
  { label: "微软正黑", value: "Microsoft JhengHei, sans-serif" },
  { label: "楷体", value: "KaiTi, serif" },
  { label: "仿宋", value: "FangSong, serif" },
  { label: "隶书", value: "LiSu, serif" },
  { label: "幼圆", value: "YouYuan, sans-serif" },
  // The 公文 faces. The `_GB2312` name comes first in each stack so a machine that has it
  // uses it, with the modern equivalent as the fallback.
  { label: "仿宋_GB2312", value: "FangSong_GB2312, FangSong, serif" },
  { label: "楷体_GB2312", value: "KaiTi_GB2312, KaiTi, serif" },
  { label: "黑体_GB2312", value: "Heiti_GB2312, SimHei, sans-serif" },
  { label: "宋体_GB2312", value: "SimSun_GB2312, SimSun, serif" }
];

/** The ten Chinese size names, with the point size each stands for. */
export const FONT_SIZES: readonly Choice<string>[] = [
  { label: "一号", value: "26pt" },
  { label: "小一", value: "24pt" },
  { label: "二号", value: "22pt" },
  { label: "小二", value: "18pt" },
  { label: "三号", value: "16pt" },
  { label: "小三", value: "15pt" },
  { label: "四号", value: "14pt" },
  { label: "小四", value: "12pt" },
  { label: "五号", value: "10.5pt" },
  { label: "小五", value: "9pt" }
];

/**
 * The outline levels the style select offers.
 *
 * `0` means 正文 and is the reason this list exists: the legacy handler ran
 * `setNode("paragraph")` and then **unconditionally** `setHeading({ level: 0 })`, so
 * choosing 正文 produced a heading with `level: 0` — an `<h0>`, which is not a real
 * element and which no stylesheet matches (defect 41). Here `0` maps to
 * `setParagraph()` and nothing else; see `ToolParagraph.vue`.
 */
export const HEADING_OPTIONS: readonly Choice<number>[] = [
  { label: "正文", value: 0 },
  { label: "标题1", value: 1 },
  { label: "标题2", value: 2 },
  { label: "标题3", value: 3 },
  { label: "标题4", value: 4 },
  { label: "标题5", value: 5 },
  { label: "标题6", value: 6 }
];

/** The units a paragraph spacing control offers, from the legacy `Units` table. */
export const PARAGRAPH_UNITS: readonly Choice<string>[] = [
  { label: "磅", value: "pt" },
  { label: "英寸", value: "in" },
  { label: "厘米", value: "cm" },
  { label: "毫米", value: "mm" },
  { label: "像素", value: "px" },
  { label: "行", value: "em" }
];

/** The line-height choices the panel offers. `fixed` switches to a point value. */
export const LINE_HEIGHT_PRESETS: readonly Choice<"single" | "oneAndHalf" | "double" | "fixed">[] = [
  { label: "单倍行距", value: "single" },
  { label: "1.5 倍行距", value: "oneAndHalf" },
  { label: "多倍行距", value: "double" },
  { label: "固定值", value: "fixed" }
];

/** The multiple each non-fixed line-height preset stands for. */
export const LINE_HEIGHT_MULTIPLES: Readonly<Record<"single" | "oneAndHalf" | "double", string>> = {
  single: "1",
  oneAndHalf: "1.5",
  double: "2"
};

/**
 * Margin presets, in the model's own prefixes.
 *
 * Millimetres **only**, and each value is a complete CSS length. The legacy panel stored
 * centimetres and handed them to a model defaulting to `"20mm"` (defect 42), which is why
 * the comparison page showed 2.54 cm for a 2 cm page.
 */
export const MARGIN_PRESETS: readonly Choice<ResolvedMargins>[] = [
  {
    label: "普通",
    value: { top: "25.4mm", right: "31.8mm", bottom: "25.4mm", left: "31.8mm" }
  },
  {
    label: "窄",
    value: { top: "12.7mm", right: "12.7mm", bottom: "12.7mm", left: "12.7mm" }
  },
  {
    label: "适中",
    value: { top: "25.4mm", right: "19.1mm", bottom: "25.4mm", left: "19.1mm" }
  },
  {
    label: "宽",
    value: { top: "25.4mm", right: "50.8mm", bottom: "25.4mm", left: "50.8mm" }
  }
];

/**
 * Every paper size the page extension supports.
 *
 * `PAPER_SIZES` is the model's own table, so the panel cannot offer a size the resolver
 * does not know about. The legacy panel hard-coded three of the five (defect 17's
 * sibling), so Letter and Legal were unreachable from the UI.
 */
export const PAPER_FORMAT_OPTIONS: readonly Choice<NamedPaperFormat>[] = (
  Object.keys(PAPER_SIZES) as NamedPaperFormat[]
).map((name) => ({
  label: `${name} (${PAPER_SIZES[name].width}×${PAPER_SIZES[name].height} mm)`,
  value: name
}));

/** The two orientations. */
export const ORIENTATION_OPTIONS: readonly Choice<"portrait" | "landscape">[] = [
  { label: "纵向", value: "portrait" },
  { label: "横向", value: "landscape" }
];

/**
 * Page-number patterns.
 *
 * `#` and `&` are the legacy aliases the three original presets used; `{page}` and
 * `{total}` are the documented tokens. A pattern is stored as one string on the
 * `pageNumber` node, so a preset and a hand-written pattern are the same kind of thing —
 * which is what makes a custom pattern possible at all.
 */
export const PAGE_NUMBER_PRESETS: readonly Choice<string>[] = [
  { label: "- 1 -", value: "- # -" },
  { label: "1/1", value: "#/&" },
  { label: "第 1 页，共 1 页", value: "第#页，共&页" },
  { label: "第 1 页 / 共 1 页", value: "第 {page} 页 / 共 {total} 页" },
  { label: "1 of 1", value: "{page} of {total}" }
];

/** Where a page logo may sit. `center` is the model's own third anchor. */
export const LOGO_POSITIONS: readonly Choice<"left" | "center" | "right">[] = [
  { label: "左", value: "left" },
  { label: "中", value: "center" },
  { label: "右", value: "right" }
];

/** Text alignment, shared by the paragraph panel and the header/footer controls. */
export const ALIGN_OPTIONS: readonly Choice<"left" | "center" | "right" | "justify">[] = [
  { label: "左对齐", value: "left" },
  { label: "居中", value: "center" },
  { label: "右对齐", value: "right" },
  { label: "两端对齐", value: "justify" }
];

/** The QR code units. */
export const QRCODE_UNITS: readonly Choice<"mm" | "cm" | "px">[] = [
  { label: "mm", value: "mm" },
  { label: "cm", value: "cm" },
  { label: "px", value: "px" }
];
