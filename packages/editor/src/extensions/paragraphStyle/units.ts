/**
 * Paragraph style values and their units — all pure.
 *
 * ## The bug this closes
 *
 * The legacy measurer did `parseFloat(value)` on a computed style
 * (`measuror.ts:232`): `"2em"` became `2`, `"12pt"` became `12`, and both were then treated
 * as pixels. A first-line indent of 2 em was measured as 2 px, so every height the pagination
 * engine computed for an indented paragraph was wrong. Nothing here ever produces a bare
 * number from a string with a unit: a length is parsed into `{ value, unit }`, and a pixel
 * conversion has to be told which font it is relative to.
 *
 * ## Why not reuse `src/editor/cssLength.ts`
 *
 * That module is the *toolbar panels'* helper and lives in the component layer. An extension
 * has to work in a host that never mounts a toolbar (the extensions are individually
 * opt-in), so the paragraph model owns its own reader. The two overlap only on
 * `px`/`pt` conversion; the interesting cases here (`em`/`rem` needing a font size, and a
 * `null` that is not `"0"`) are paragraph-specific.
 */

import type {
  ParagraphStyleAttrs,
  ParagraphStyleValue,
  ParsedParagraphLength,
  PixelsContext
} from "./typing";

/** A CSS point is 1/72 in and CSS defines the inch as exactly 96 px. */
const PIXELS_PER_POINT = 96 / 72;

/** What `em`/`rem` are relative to when nothing is known. Matches every browser's default. */
const DEFAULT_FONT_SIZE = 16;

/**
 * Parse a CSS length.
 *
 * A bare number is read as `px`, which is what CSS does, and what
 * `src/editor/cssLength.ts` does for the panels. Anything unrecognised returns `undefined`
 * rather than `NaN`: a toolbar that renders `NaNmm` is worse than one that keeps the model's
 * own value, and `NaN` in a style attribute silently invalidates the whole declaration.
 */
export function parseParagraphLength(
  input: string | null | undefined
): ParsedParagraphLength | undefined {
  if (typeof input !== "string") return undefined;

  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|pt|em|rem|%)?\s*$/i.exec(input);
  if (!match) return undefined;

  const raw = match[1];
  const unit = match[2];
  if (raw === undefined) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;

  return { value, unit: (unit === undefined ? "px" : unit.toLowerCase()) as ParsedParagraphLength["unit"] };
}

/** Write a length back out, e.g. `{ value: 2, unit: "em" }` → `"2em"`. */
export function formatParagraphLength(length: ParsedParagraphLength): string {
  const value = Number.isFinite(length.value) ? length.value : 0;
  return `${value}${length.unit}`;
}

/**
 * Convert a length to pixels.
 *
 * `em`/`%` use the element's own font size and `rem` the root's, both defaulting to 16 px
 * because that is what a browser does when no font is set. A caller that has the element in
 * hand should pass its real `fontSize` — this is the conversion the legacy code skipped
 * entirely.
 */
export function toPixels(length: ParsedParagraphLength, context: PixelsContext = {}): number {
  const fontSize = context.fontSize ?? DEFAULT_FONT_SIZE;
  const rootFontSize = context.rootFontSize ?? DEFAULT_FONT_SIZE;

  switch (length.unit) {
    case "px":
      return length.value;
    case "pt":
      return length.value * PIXELS_PER_POINT;
    case "em":
      return length.value * fontSize;
    case "rem":
      return length.value * rootFontSize;
    case "%":
      return (length.value / 100) * fontSize;
    default:
      return length.value;
  }
}

/**
 * Read a computed style value into pixels.
 *
 * For a toolbar panel that has just called `getComputedStyle(element).textIndent` and needs a
 * number: the unit is honoured, and the caller supplies the font context. Returns `undefined`
 * for anything unparseable (`"auto"`, `"normal"`, a `calc()`), so the panel can fall back to
 * the model instead of writing `NaNpx`.
 */
export function readComputedLengthPixels(
  computed: string | null | undefined,
  context: PixelsContext = {}
): number | undefined {
  const parsed = parseParagraphLength(computed);
  return parsed === undefined ? undefined : toPixels(parsed, context);
}

/**
 * Normalise one style value.
 *
 * - `null` stays `null` (the value that *removes* a style);
 * - an empty or whitespace-only string becomes `null`, because a UI that cleared its input
 *   means "no indent", not "an indent of nothing";
 * - anything that is not a string or `null` is `undefined`, i.e. "not a value at all", which
 *   the command treats as "leave this attribute alone".
 */
export function normalizeParagraphStyleValue(value: unknown): ParagraphStyleValue | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** `true` when a value means "no style" — either `null` or the empty string. */
export function isEmptyParagraphStyleValue(value: unknown): boolean {
  return normalizeParagraphStyleValue(value) === null;
}
/**
 * The subset of `patch` that would actually change `current`.
 *
 * `undefined` when nothing would change. That is the whole of "return `false` when nothing
 * changed" — the legacy command logged a message and returned `false`, which a host could
 * neither see nor act on (and which made the command useless in a chain).
 */
export function changedParagraphStyleAttrs(
  current: ParagraphStyleAttrs,
  patch: ParagraphStyleAttrs
): ParagraphStyleAttrs | undefined {
  const changed: ParagraphStyleAttrs = {};
  let any = false;

  const names = ["textIndent", "paragraphStart", "paragraphEnd"] as const;
  for (const name of names) {
    if (!(name in patch)) continue;

    const next = normalizeParagraphStyleValue(patch[name]);
    if (next === undefined) continue;

    const existing = normalizeParagraphStyleValue(current[name]) ?? null;
    if (existing === next) continue;

    changed[name] = next;
    any = true;
  }

  return any ? changed : undefined;
}

/**
 * The CSS declarations an attribute set renders to.
 *
 * Only set values are written. The legacy `textIndent` default of `"0"` meant this map was
 * never empty, so every paragraph in every document carried `text-indent: 0;` — noise in the
 * HTML, a diff on every save, and a false "the user set this" signal for the toolbar.
 */
export function paragraphStyleDeclarations(attrs: ParagraphStyleAttrs): Record<string, string> {
  const declarations: Record<string, string> = {};

  const textIndent = normalizeParagraphStyleValue(attrs.textIndent);
  if (textIndent !== null && textIndent !== undefined) declarations["text-indent"] = textIndent;

  const paragraphStart = normalizeParagraphStyleValue(attrs.paragraphStart);
  if (paragraphStart !== null && paragraphStart !== undefined) {
    declarations["margin-block-start"] = paragraphStart;
  }

  const paragraphEnd = normalizeParagraphStyleValue(attrs.paragraphEnd);
  if (paragraphEnd !== null && paragraphEnd !== undefined) {
    declarations["margin-block-end"] = paragraphEnd;
  }

  return declarations;
}

/** The `style` attribute value for an attribute set, or `undefined` when there is nothing. */
export function paragraphStyleString(attrs: ParagraphStyleAttrs): string | undefined {
  const entries = Object.entries(paragraphStyleDeclarations(attrs));
  if (entries.length === 0) return undefined;
  return `${entries.map(([property, value]) => `${property}: ${value}`).join("; ")};`;
}
