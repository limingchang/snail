/**
 * CSS 长度辅助函数，由工具栏面板共用。
 *
 * 旧版页边距面板是那个反面教材（缺陷 42）：它把数字按厘米存储，又交给一个默认值是 `"20mm"`
 * 的模型，于是一个使用 20 mm 的页面显示成 2.54 cm。这里不存储裸数字：长度被解析成
 * `{ value, unit }`，再格式化回 CSS 字符串，正是 `typings/paper.ts` 对模型的要求。每一次
 * 换算都经由毫米，因为纸张尺寸与默认页边距都只用这一个单位表达。
 *
 * `em`/`rem` 刻意**不可**换算：它们取决于元素自身的字体，而本模块无从得知。
 * {@link toMillimetres} 对它们返回 `undefined`，让调用方自行决定（段落间距控件就原样保留
 * 它们）。
 *
 * CSS length helpers, shared by the toolbar panels.
 *
 * The legacy margin panel is the cautionary tale (defect 42): it stored numbers in
 * centimetres and handed them to a model whose default was `"20mm"`, so a page using
 * 20 mm displayed as 2.54 cm. Nothing here stores a bare number: a length is parsed into
 * `{ value, unit }` and formatted back into a CSS string, exactly as `typings/paper.ts`
 * requires of the model. Every conversion goes through millimetres, which is the one
 * unit both the paper sizes and the default margins are expressed in.
 *
 * `em`/`rem` are deliberately **not** convertible: they depend on the element's own font,
 * which this module cannot know. {@link toMillimetres} returns `undefined` for them so a
 * caller can decide (the paragraph spacing controls keep them as-is).
 */

import type { CssLength } from "../typings/paper";

/** 调用方可以在面板里挑选的单位。 / The units a caller may pick in the panels. */
export const CSS_UNITS = ["mm", "cm", "in", "pt", "px", "em"] as const;

/** {@link CSS_UNITS} 中的一个。 / One of {@link CSS_UNITS}. */
export type CssUnit = (typeof CSS_UNITS)[number];

/** 解析后的长度。 / A parsed length. */
export interface ParsedLength {
  /** 数值部分。始终是有限数。 / The numeric part. Always finite. */
  value: number;
  /** 单位部分。永不为空。 / The unit part. Never empty. */
  unit: CssUnit | string;
}

/**
 * 每个单位对应的毫米数。`em` 是故意缺席的 —— 见模块注释。
 *
 * Millimetres per unit. `em` is absent on purpose — see the module comment.
 */
const MILLIMETRES_PER_UNIT: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  // A CSS point is 1/72 in, and CSS defines the inch as exactly 96 px.
  pt: 25.4 / 72,
  px: 25.4 / 96
};

/** 换算结果是精确的那些单位。 / The units whose conversion is exact. */
export function isConvertibleUnit(unit: string): boolean {
  return unit in MILLIMETRES_PER_UNIT;
}

/**
 * 解析一个 CSS 长度。
 *
 * 裸数字按 `px` 读，这正是 CSS 的做法。任何解析不出来的输入都返回 `undefined` 而不是
 * `NaN`：一个渲染出 `NaNmm` 的工具栏，比一个回退到模型自身值的工具栏更糟。
 *
 * Parse a CSS length.
 *
 * A bare number is read as `px`, which is what CSS does. Anything unparseable returns
 * `undefined` rather than `NaN`: a toolbar that renders `NaNmm` is worse than one that
 * falls back to the model's own value.
 */
export function parseCssLength(input: CssLength | undefined): ParsedLength | undefined {
  if (input === undefined) return undefined;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*([a-z%]*)\s*$/i.exec(input);
  if (!match) return undefined;

  const raw = match[1];
  const unit = match[2];
  if (raw === undefined || unit === undefined) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;

  return { value, unit: unit === "" ? "px" : unit.toLowerCase() };
}

/**
 * 按 CSS 想要的样子格式化一个长度。无单位的值写成 `px`。
 *
 * Format a length the way CSS wants it. A unitless value is written as `px`.
 */
export function formatCssLength(value: number, unit: CssUnit | string): CssLength {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe}${unit === "" ? "px" : unit}`;
}

/**
 * 把长度换算成毫米；单位无法换算时返回 `undefined`。
 *
 * Convert a length to millimetres, or `undefined` when its unit cannot be converted.
 */
export function toMillimetres(length: CssLength | undefined): number | undefined {
  const parsed = parseCssLength(length);
  if (!parsed) return undefined;
  const factor = MILLIMETRES_PER_UNIT[parsed.unit];
  if (factor === undefined) return undefined;
  return parsed.value * factor;
}

/**
 * 把毫米换算成 `unit`。四舍五入到两位小数，即整整 0.01 mm。
 *
 * Convert millimetres into `unit`. Rounds to two decimals, which is a whole 0.01 mm.
 */
export function fromMillimetres(millimetres: number, unit: CssUnit | string): CssLength {
  const factor = MILLIMETRES_PER_UNIT[unit];
  if (factor === undefined) return formatCssLength(millimetres, unit);
  return formatCssLength(Math.round((millimetres / factor) * 100) / 100, unit);
}

/**
 * 面板应该为某个模型值显示的单位，保留模型自己的单位。
 *
 * 一个写成 `"2cm"` 的页边距，在用户只改了无关字段时必须原样回到 `2cm`，所以这里问的是
 * 「这是用什么单位写的？」，而不是强加一个单位。
 *
 * The unit a panel should show for a model value, keeping the model's own unit.
 *
 * A margin authored as `"2cm"` must come back as `2cm` when the user only changes an
 * unrelated field, so this asks "what unit is this in?" instead of imposing one.
 */
export function preferredUnit(length: CssLength | undefined, fallback: CssUnit = "mm"): CssUnit {
  const parsed = parseCssLength(length);
  if (!parsed) return fallback;
  return (CSS_UNITS as readonly string[]).includes(parsed.unit) ? (parsed.unit as CssUnit) : fallback;
}

/**
 * 把行距值拆成工具栏的两种情况。
 *
 * `"1.5"`、`"2em"` 与 `"28pt"` 是模型存储的三种形态。无单位的值是倍数；任何带单位的值是
 * 固定长度。旧面板靠数字本身猜（`value > 1.5` 就算「倍数」），于是它把 `2` 报成倍数，
 * 也把 `16pt` 报成倍数。
 *
 * Split a line-height value into the toolbar's two cases.
 *
 * `"1.5"`, `"2em"` and `"28pt"` are the three shapes the model stores. A unitless value
 * is a multiple; anything with a unit is a fixed length. The legacy panel guessed from
 * the number itself (`value > 1.5` meant "multiple"), which reported `2` as multiple and
 * `16pt` as multiple too.
 */
export function readLineHeight(input: CssLength | undefined): {
  kind: "multiple" | "fixed";
  value: number;
  unit: CssUnit | string;
} {
  if (input === undefined) return { kind: "multiple", value: 1, unit: "" };
  // `parseCssLength` reads a bare number as `px`, which is right for CSS lengths and
  // wrong here: this model spells a multiple as a bare number. The unit has to be read
  // off the raw string before that default is applied.
  if (/^\s*-?\d+(?:\.\d+)?\s*$/.test(input)) {
    return { kind: "multiple", value: Number(input), unit: "" };
  }
  const parsed = parseCssLength(input);
  if (!parsed) return { kind: "multiple", value: 1, unit: "" };
  return { kind: "fixed", value: parsed.value, unit: parsed.unit };
}

/**
 * 把行距写回去。倍数按 CSS 的期望不带单位。
 *
 * Write a line-height back out. A multiple is unitless, as CSS expects.
 */
export function writeLineHeight(kind: "multiple" | "fixed", value: number, unit: CssUnit | string): CssLength {
  return kind === "multiple" ? String(value) : formatCssLength(value, unit);
}
