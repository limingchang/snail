/**
 * Attribute readers.
 *
 * A Tiptap node's attributes are typed `Record<string, any>` and can arrive from parsed
 * HTML, from stored JSON, or from a consumer that wrote something unexpected. Every
 * reader here takes `unknown` and returns a usable value, so no node view has to trust an
 * attribute — and no `any` leaks into the page module's own types.
 *
 * Pure: no DOM, no editor.
 */

import { PAPER_SIZES } from "../../../typings/paper";
import type { Margins, NamedPaperFormat, Orientation, PaperFormat } from "../../../typings/paper";
import { DEFAULT_ORIENTATION, DEFAULT_PAPER_FORMAT } from "../constant/defaults";
import type { LogoPosition } from "../typing/pageLogo";
import type { TextAlign } from "../typing/headerFooter";

/** A string attribute, with a fallback for anything else. */
export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** A CSS length attribute (`"30mm"`, `"auto"`). Empty strings fall back. */
export function readCss(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/** A finite number attribute. */
export function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A boolean attribute. */
export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * A paper format, honouring a custom `{ name, width, height }` object.
 *
 * An unknown string is *not* passed through: `resolvePaperSize` would fall back to A4
 * anyway, and doing it here keeps the fallback in one place. (The legacy resolver tested
 * `paperFormat.width in defaultPaper` — a number checked for membership in a table of
 * names — so a custom format silently became A4.)
 */
export function readPaperFormat(value: unknown): PaperFormat {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(PAPER_SIZES, value)) {
    return value as NamedPaperFormat;
  }
  if (value && typeof value === "object") {
    const candidate = value as { name?: unknown; width?: unknown; height?: unknown };
    if (typeof candidate.width === "number" && typeof candidate.height === "number") {
      return {
        name: typeof candidate.name === "string" ? candidate.name : "custom",
        width: candidate.width,
        height: candidate.height
      };
    }
  }
  return DEFAULT_PAPER_FORMAT;
}

/** An orientation; anything that is not `"landscape"` is portrait. */
export function readOrientation(value: unknown): Orientation {
  return value === "landscape" ? "landscape" : DEFAULT_ORIENTATION;
}

/**
 * Margins as authored: a CSS shorthand string, or a per-side object of CSS lengths.
 *
 * `undefined` means "use the defaults", which `resolveMargins` applies.
 */
export function readMargins(value: unknown): Margins | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.top === "string" &&
      typeof candidate.right === "string" &&
      typeof candidate.bottom === "string" &&
      typeof candidate.left === "string"
    ) {
      return {
        top: candidate.top,
        right: candidate.right,
        bottom: candidate.bottom,
        left: candidate.left
      };
    }
  }
  return undefined;
}

/** A text alignment. */
export function readTextAlign(value: unknown, fallback: TextAlign): TextAlign {
  return isTextAlign(value) ? value : fallback;
}

/** Type guard for {@link TextAlign}. */
export function isTextAlign(value: unknown): value is TextAlign {
  return value === "left" || value === "center" || value === "right" || value === "justify";
}

/** A logo anchor; anything unknown is anchored left. */
export function readLogoPosition(value: unknown): LogoPosition {
  return value === "right" || value === "center" ? value : "left";
}
