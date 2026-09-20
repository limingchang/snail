/**
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

/** A CSS length, e.g. `"20mm"`. */
export type CssLength = string;

/** The named paper sizes this library ships. */
export const PAPER_SIZES = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 }
} as const;

/** One of the named sizes in {@link PAPER_SIZES}. */
export type NamedPaperFormat = keyof typeof PAPER_SIZES;

/** A named size, or a custom one measured in millimetres. */
export type PaperFormat =
  | NamedPaperFormat
  | {
      /** Used in the UI and in diagnostics. */
      name: string;
      /** Sheet width in millimetres. */
      width: number;
      /** Sheet height in millimetres. */
      height: number;
    };

/** Which way round the sheet is printed. */
export type Orientation = "portrait" | "landscape";

/** Sheet size in millimetres, after orientation has been applied. */
export interface PaperSize {
  /** Millimetres. */
  width: number;
  /** Millimetres. */
  height: number;
}

/**
 * Page margins.
 *
 * A CSS shorthand string (`"20mm"`, `"10mm 20mm"`) is accepted as well as the
 * per-side object, because that is how the value is authored in CSS and how a
 * consumer naturally thinks about it.
 */
export type Margins =
  | {
      top: CssLength;
      right: CssLength;
      bottom: CssLength;
      left: CssLength;
    }
  | CssLength;

/** Every side resolved to a CSS length. */
export interface ResolvedMargins {
  top: CssLength;
  right: CssLength;
  bottom: CssLength;
  left: CssLength;
}

/** The default margins — Word's "normal" preset. */
export const DEFAULT_MARGINS: ResolvedMargins = {
  top: "20mm",
  right: "20mm",
  bottom: "20mm",
  left: "20mm"
};

/**
 * Resolve a paper format and orientation to a millimetre size.
 *
 * A custom `{ name, width, height }` object is honoured. The legacy resolver
 * checked `if (paperFormat.width in defaultPaper)` — testing a *number* for
 * membership in an object of names — so a custom format silently became A4.
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

/** Resolve a {@link Margins} value to four sides. */
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
