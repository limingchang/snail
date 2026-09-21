/**
 * CSS 长度解析。
 *
 * 旧版测量器的 `parseCssLength` 以裸的 `parseFloat(trimmed)` 兜底，于是 `"2em"` 变成了
 * **2 px**，`2em` 的首行缩进让测量出的换行点偏移了一个多字符（缺陷 12）。这里显式处理
 * 文档中可能出现的每一种单位，无法识别的值报告为 `NaN`，而不是悄悄变成一个错误的数字。
 *
 * 纯函数：不访问 DOM，因此可以直接做单元测试（见 `tests/page/length.spec.ts`）。
 *
 * CSS length resolution.
 *
 * The legacy measurer's `parseCssLength` ended with a bare
 * `parseFloat(trimmed)` fallback, so `"2em"` became **2 px** and a first-line indent of
 * `2em` shifted the measured wrap point by more than a character (defect 12). Every unit
 * that can appear in a document is handled explicitly here, and anything unrecognised is
 * reported as `NaN` instead of silently becoming a wrong number.
 *
 * Pure: no DOM access, so it is unit-tested directly (see `tests/page/length.spec.ts`).
 */

/**
 * 按 CSS 参考密度 96 px/英寸 计算的换算系数。
 *
 * Conversion factors at the CSS reference density of 96 px per inch.
 */
export const PX_PER_INCH = 96;
/** 每毫米的 CSS 像素数。 / CSS pixels per millimetre. */
export const PX_PER_MM = PX_PER_INCH / 25.4;
/** 每厘米的 CSS 像素数。 / CSS pixels per centimetre. */
export const PX_PER_CM = PX_PER_INCH / 2.54;
/** 每点的 CSS 像素数。 / CSS pixels per point. */
export const PX_PER_PT = PX_PER_INCH / 72;
/** 每派卡的 CSS 像素数。 / CSS pixels per pica. */
export const PX_PER_PC = PX_PER_INCH / 6;
/**
 * CSS 初始字号，上下文未提供时使用。
 *
 * The CSS initial font size, used when a context does not supply one.
 */
export const DEFAULT_ROOT_FONT_SIZE = 16;

/** 相对单位换算为像素所需的全部信息。 / Everything a relative unit needs to become pixels. */
export interface LengthContext {
  /**
   * 所属元素的字号（px），即 `em` 的基准。默认 16。
   *
   * The owning element's font size in px, i.e. the base for `em`. Defaults to 16.
   */
  fontSize?: number;
  /**
   * 文档根元素的字号（px），即 `rem` 的基准。默认 16。
   *
   * The document root's font size in px, i.e. the base for `rem`. Defaults to 16.
   */
  rootFontSize?: number;
  /**
   * 包含块的尺寸（px），即 `%` 的基准。默认 0。
   *
   * The containing block's size in px, i.e. the base for `%`. Defaults to 0.
   */
  percentBase?: number;
}

/**
 * 带单位或不带单位的长度：`"2em"`、`"20mm"`、`"0"`、`12.5`。
 *
 * A length, with or without a unit: `"2em"`, `"20mm"`, `"0"`, `12.5`.
 */
export type CssLengthLike = string | number | null | undefined;

const LENGTH_PATTERN = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/;

/**
 * 把 CSS 长度解析为像素。
 *
 * Resolve a CSS length to pixels.
 *
 * @returns 以 px 为单位的长度，无法解析时为 `NaN` /
 *   The length in px, or `NaN` when the value is missing, is a keyword such as
 *   `"auto"` / `"normal"`, or uses a unit this function does not know. `NaN` is
 *   deliberate: a wrong number silently displaces every page break, while `NaN`
 *   propagates to the caller's guard (`resolveCssLengthOr`, or an explicit check).
 */
export function resolveCssLength(value: CssLengthLike, context: LengthContext = {}): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;

  const match = LENGTH_PATTERN.exec(value.trim().toLowerCase());
  if (!match) return Number.NaN;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return Number.NaN;

  const unit = match[2];
  const fontSize = usable(context.fontSize, DEFAULT_ROOT_FONT_SIZE);
  const rootFontSize = usable(context.rootFontSize, DEFAULT_ROOT_FONT_SIZE);

  switch (unit) {
    case "":
    case "px":
      return amount;
    case "em":
      return amount * fontSize;
    case "rem":
      return amount * rootFontSize;
    case "pt":
      return amount * PX_PER_PT;
    case "pc":
      return amount * PX_PER_PC;
    case "in":
      return amount * PX_PER_INCH;
    case "mm":
      return amount * PX_PER_MM;
    case "cm":
      return amount * PX_PER_CM;
    case "q":
      return (amount * PX_PER_CM) / 40;
    case "%":
      return (amount / 100) * usable(context.percentBase, 0);
    default:
      // `vw`, `vh`, `ch`, `vmin`… depend on a viewport the measurer does not own. Report
      // rather than guess.
      return Number.NaN;
  }
}

/**
 * {@link resolveCssLength}，但为无法解析的值提供兜底。
 *
 * {@link resolveCssLength}, with a fallback for unresolvable values.
 */
export function resolveCssLengthOr(
  value: CssLengthLike,
  fallback: number,
  context: LengthContext = {}
): number {
  const resolved = resolveCssLength(value, context);
  return Number.isFinite(resolved) ? resolved : fallback;
}

/**
 * 毫米换算为 CSS 像素——页面几何计算反复需要的那一次换算。
 *
 * Millimetres to CSS pixels — the one conversion the page geometry needs repeatedly.
 */
export function mmToPx(millimetres: number): number {
  return millimetres * PX_PER_MM;
}

/** CSS 像素换算为毫米。 / CSS pixels to millimetres. */
export function pxToMm(pixels: number): number {
  return pixels / PX_PER_MM;
}

function usable(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
