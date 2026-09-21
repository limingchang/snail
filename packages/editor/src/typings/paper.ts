/**
 * 纸张、方向与页边距。
 *
 * 由 page 扩展与顶层组件共用，因此两者不会对 `"A4"` 的含义、也不会对纸张的哪一边
 * 算 `top` 产生分歧。
 *
 * ## 单位
 *
 * 距离是**带单位的字符串**，与 CSS 中的写法完全一致（`"20mm"`、`"1.5cm"`、
 * `"12pt"`）。裸数字就必须替调用方选定一个单位，而旧包反复选错：它的页边距面板以
 * 厘米工作，模型却默认 20 毫米，于是面板对一个实际使用 2 厘米的页面显示出 2.54 厘米。
 *
 * Paper, orientation and margins.
 *
 * Shared by the page extension and the top-level component, so the two cannot
 * disagree about what `"A4"` means or which side of the sheet `top` is on.
 *
 * ## Units
 *
 * Distances are **strings with a unit**, exactly as they appear in CSS
 * (`"20mm"`, `"1.5cm"`, `"12pt"`). A bare number would have to pick a unit for the
 * caller, and the legacy package picked the wrong one repeatedly: its margin panel
 * worked in centimetres while the model defaulted to 20 mm, so the panel displayed
 * 2.54 cm for a page that was really using 2 cm.
 */

/** 一条 CSS 长度，例如 `"20mm"`。 / A CSS length, e.g. `"20mm"`. */
export type CssLength = string;

/** 本库内置的具名纸张尺寸。 / The named paper sizes this library ships. */
export const PAPER_SIZES = {
  /** A3 尺寸，单位毫米。 / The A3 size, in millimetres. */
  A3: { width: 297, height: 420 },
  /** A4 尺寸，单位毫米。 / The A4 size, in millimetres. */
  A4: { width: 210, height: 297 },
  /** A5 尺寸，单位毫米。 / The A5 size, in millimetres. */
  A5: { width: 148, height: 210 },
  /** Letter 尺寸，单位毫米。 / The Letter size, in millimetres. */
  Letter: { width: 216, height: 279 },
  /** Legal 尺寸，单位毫米。 / The Legal size, in millimetres. */
  Legal: { width: 216, height: 356 }
} as const;

/** {@link PAPER_SIZES} 中的一个具名尺寸。 / One of the named sizes in {@link PAPER_SIZES}. */
export type NamedPaperFormat = keyof typeof PAPER_SIZES;

/** 具名尺寸，或按毫米自定义的尺寸。 / A named size, or a custom one measured in millimetres. */
export type PaperFormat =
  | NamedPaperFormat
  | {
      /** 用于界面展示与诊断信息。 / Used in the UI and in diagnostics. */
      name: string;
      /** 纸张宽度，单位毫米。 / Sheet width in millimetres. */
      width: number;
      /** 纸张高度，单位毫米。 / Sheet height in millimetres. */
      height: number;
    };

/** 纸张的打印方向。 / Which way round the sheet is printed. */
export type Orientation = "portrait" | "landscape";

/**
 * 应用方向之后的纸张尺寸，单位毫米。
 *
 * Sheet size in millimetres, after orientation has been applied.
 */
export interface PaperSize {
  /** 单位毫米。 / Millimetres. */
  width: number;
  /** 单位毫米。 / Millimetres. */
  height: number;
}

/**
 * 页边距。
 *
 * 既接受 CSS 简写字符串（`"20mm"`、`"10mm 20mm"`），也接受逐边的对象，因为值在
 * CSS 里就是这样书写的，使用者也天然这样理解它。
 *
 * Page margins.
 *
 * A CSS shorthand string (`"20mm"`, `"10mm 20mm"`) is accepted as well as the
 * per-side object, because that is how the value is authored in CSS and how a
 * consumer naturally thinks about it.
 */
export type Margins =
  | {
      /** 上边距。 / The top margin. */
      top: CssLength;
      /** 右边距。 / The right margin. */
      right: CssLength;
      /** 下边距。 / The bottom margin. */
      bottom: CssLength;
      /** 左边距。 / The left margin. */
      left: CssLength;
    }
  | CssLength;

/** 每一边都解析成 CSS 长度。 / Every side resolved to a CSS length. */
export interface ResolvedMargins {
  /** 上边距。 / The top margin. */
  top: CssLength;
  /** 右边距。 / The right margin. */
  right: CssLength;
  /** 下边距。 / The bottom margin. */
  bottom: CssLength;
  /** 左边距。 / The left margin. */
  left: CssLength;
}

/** 默认页边距——Word 的「常规」预设。 / The default margins — Word's "normal" preset. */
export const DEFAULT_MARGINS: ResolvedMargins = {
  /** 上边距。 / The top margin. */
  top: "20mm",
  /** 右边距。 / The right margin. */
  right: "20mm",
  /** 下边距。 / The bottom margin. */
  bottom: "20mm",
  /** 左边距。 / The left margin. */
  left: "20mm"
};

/**
 * 把纸张格式与方向解析成毫米尺寸。
 *
 * 自定义的 `{ name, width, height }` 对象会被采用。旧解析器写的是
 * `if (paperFormat.width in defaultPaper)`——拿一个*数字*去测试它是否属于一个由名字
 * 组成的对象——于是自定义格式会静默地变成 A4。
 *
 * Resolve a paper format and orientation to a millimetre size.
 *
 * A custom `{ name, width, height }` object is honoured. The legacy resolver
 * checked `if (paperFormat.width in defaultPaper)` — testing a *number* for
 * membership in an object of names — so a custom format silently became A4.
 *
 * @param format 纸张格式 / The paper format.
 * @param orientation 纸张方向 / The sheet orientation.
 * @returns 应用方向后的毫米尺寸 / The millimetre size after orientation.
 */
export function resolvePaperSize(format: PaperFormat, orientation: Orientation): PaperSize {
  const size =
    typeof format === "string"
      ? PAPER_SIZES[format] ?? PAPER_SIZES.A4
      : { width: format.width, height: format.height };

  return orientation === "landscape"
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/**
 * 把 {@link Margins} 值解析成四条边。
 *
 * Resolve a {@link Margins} value to four sides.
 *
 * @param margins 页边距 / The margins; `undefined` uses the defaults.
 * @returns 四条边各自的 CSS 长度 / The four sides, each a CSS length.
 */
export function resolveMargins(margins: Margins | undefined): ResolvedMargins {
  if (margins === undefined) return { ...DEFAULT_MARGINS };
  if (typeof margins === "string") {
    const [vertical, horizontal = vertical, bottom = vertical, left = horizontal] = margins
      .trim()
      .split(/\s+/);
    return {
      top: vertical ?? DEFAULT_MARGINS.top,
      right: horizontal,
      bottom,
      left
    };
  }
  return { ...margins };
}
