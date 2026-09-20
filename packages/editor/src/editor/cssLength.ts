/**
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

/** The units a caller may pick in the panels. */
export const CSS_UNITS = ["mm", "cm", "in", "pt", "px", "em"] as const;

/** One of {@link CSS_UNITS}. */
export type CssUnit = (typeof CSS_UNITS)[number];

/** A parsed length. */
export interface ParsedLength {
  /** The numeric part. Always finite. */
  value: number;
  /** The unit part. Never empty. */
  unit: CssUnit | string;
}

/** Millimetres per unit. `em` is absent on purpose — see the module comment. */
const MILLIMETRES_PER_UNIT: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  // A CSS point is 1/72 in, and CSS defines the inch as exactly 96 px.
  pt: 25.4 / 72,
  px: 25.4 / 96
};

/** The units whose conversion is exact. */
export function isConvertibleUnit(unit: string): boolean {
  return unit in MILLIMETRES_PER_UNIT;
}

/**
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

/** Format a length the way CSS wants it. A unitless value is written as `px`. */
export function formatCssLength(value: number, unit: CssUnit | string): CssLength {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe}${unit === "" ? "px" : unit}`;
}

/** Convert a length to millimetres, or `undefined` when its unit cannot be converted. */
export function toMillimetres(length: CssLength | undefined): number | undefined {
  const parsed = parseCssLength(length);
  if (!parsed) return undefined;
  const factor = MILLIMETRES_PER_UNIT[parsed.unit];
  if (factor === undefined) return undefined;
  return parsed.value * factor;
}

/** Convert millimetres into `unit`. Rounds to two decimals, which is a whole 0.01 mm. */
export function fromMillimetres(millimetres: number, unit: CssUnit | string): CssLength {
  const factor = MILLIMETRES_PER_UNIT[unit];
  if (factor === undefined) return formatCssLength(millimetres, unit);
  return formatCssLength(Math.round((millimetres / factor) * 100) / 100, unit);
}

/**
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

/** Write a line-height back out. A multiple is unitless, as CSS expects. */
export function writeLineHeight(kind: "multiple" | "fixed", value: number, unit: CssUnit | string): CssLength {
  return kind === "multiple" ? String(value) : formatCssLength(value, unit);
}
