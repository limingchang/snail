/**
 * 各面板的下拉选项。
 *
 * 中文名称沿用旧版原样：起草合同的人选的是「小四」，而不是 `12pt`。带 `_GB2312` 后缀的是
 * 公文用字体，既是本领域的真实需求，也本来就在旧版清单里 —— 为了「清理」而删掉它们会让
 * 已有模板失效。
 *
 * 这里没有任何一项是 *默认值*：默认值属于扩展或 `typings/paper.ts`，这样面板与模型才不会
 * 各说各话。这里只是面板提供的候选项。
 *
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

/**
 * 一个下拉选项：`label` 用于显示，`value` 用于存储。
 *
 * A pick-list entry whose label is shown and whose value is stored.
 */
export interface Choice<T> {
  /** 展示给用户的名称。 / The label shown to the user. */
  label: string;
  /** 实际存储的值。 / The value that is stored. */
  value: T;
}

/**
 * 合同用到的十二种中文字体族，来自旧版的 `FontFamilyList`。
 *
 * The twelve Chinese families a contract uses, from the legacy `FontFamilyList`.
 */
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

/**
 * 十种中文字号名称，以及每种字号代表的磅值。
 *
 * The ten Chinese size names, with the point size each stands for.
 */
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
 * 样式下拉提供的大纲级别。
 *
 * `0` 表示正文，而这个清单存在的理由正在于此：旧版处理函数先跑 `setNode("paragraph")`，
 * 随后**无条件**跑 `setHeading({ level: 0 })`，于是选择「正文」会产出一个 `level: 0` 的
 * 标题 —— 即 `<h0>`，它既不是真实元素，也没有任何样式表能匹配（缺陷 41）。这里 `0` 只映射
 * 到 `setParagraph()`，别无其他；见 `ToolParagraph.vue`。
 *
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

/**
 * 段落间距控件提供的单位，来自旧版的 `Units` 表。
 *
 * The units a paragraph spacing control offers, from the legacy `Units` table.
 */
export const PARAGRAPH_UNITS: readonly Choice<string>[] = [
  { label: "磅", value: "pt" },
  { label: "英寸", value: "in" },
  { label: "厘米", value: "cm" },
  { label: "毫米", value: "mm" },
  { label: "像素", value: "px" },
  { label: "行", value: "em" }
];

/**
 * 面板提供的行距选项；`fixed` 表示改用磅值。
 *
 * The line-height choices the panel offers. `fixed` switches to a point value.
 */
export const LINE_HEIGHT_PRESETS: readonly Choice<"single" | "oneAndHalf" | "double" | "fixed">[] = [
  { label: "单倍行距", value: "single" },
  { label: "1.5 倍行距", value: "oneAndHalf" },
  { label: "多倍行距", value: "double" },
  { label: "固定值", value: "fixed" }
];

/** 每个非固定行距预设代表的倍数。 / The multiple each non-fixed line-height preset stands for. */
export const LINE_HEIGHT_MULTIPLES: Readonly<Record<"single" | "oneAndHalf" | "double", string>> = {
  single: "1",
  oneAndHalf: "1.5",
  double: "2"
};

/**
 * 页边距预设，使用模型自己的前缀。
 *
 * **只用毫米**，且每个值都是完整的 CSS 长度。旧版面板存的是厘米，却交给默认值为 `"20mm"`
 * 的模型（缺陷 42），这就是对比页把 2 cm 的页面显示成 2.54 cm 的原因。
 *
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
 * 页面扩展支持的全部纸张尺寸。
 *
 * `PAPER_SIZES` 是模型自己的表，因此面板不可能提供解析器不认识的尺寸。旧版面板把五个中的
 * 三个写死（缺陷 17 的同类问题），Letter 与 Legal 因此在界面上根本无法选择。
 *
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

/** 两种方向。 / The two orientations. */
export const ORIENTATION_OPTIONS: readonly Choice<"portrait" | "landscape">[] = [
  { label: "纵向", value: "portrait" },
  { label: "横向", value: "landscape" }
];

/**
 * 页码格式串。
 *
 * `#` 与 `&` 是最初三个预设使用的旧版别名，`{page}` 与 `{total}` 是有文档的记号。格式串以
 * 单个字符串存在 `pageNumber` 节点上，所以预设与手写格式串是同一类东西 —— 这正是自定义
 * 格式串得以可能的原因。
 *
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

/**
 * 文本对齐方式，段落面板与文本对齐控件共用。
 *
 * Text alignment, shared by the paragraph panel and the text-alignment controls.
 */
export const ALIGN_OPTIONS: readonly Choice<"left" | "center" | "right" | "justify">[] = [
  { label: "左对齐", value: "left" },
  { label: "居中", value: "center" },
  { label: "右对齐", value: "right" },
  { label: "两端对齐", value: "justify" }
];

/**
 * 二维码的单位：毫米与厘米。
 *
 * `px` 刻意不在清单里：二维码是要印在纸上的，屏幕像素不是一个能拿去印刷的尺寸，而模型与
 * `qrcode` 扩展都仍然认识它（旧模板里存下来的 `px` 尺寸照样能打开）。这里只决定面板提供
 * 什么。
 *
 * The QR code units: millimetres and centimetres.
 *
 * `px` is deliberately absent: a QR code is printed on paper, and screen pixels are not a
 * printable size — while both the model and the `qrcode` extension still understand it (a `px`
 * size stored in an old template opens fine). This list only decides what the panel offers.
 */
export const QRCODE_UNITS: readonly Choice<"mm" | "cm">[] = [
  { label: "mm", value: "mm" },
  { label: "cm", value: "cm" }
];
