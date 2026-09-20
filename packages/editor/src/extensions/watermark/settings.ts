/**
 * Watermark settings and the CSS/SVG they produce — all pure.
 *
 * ## Why the mark is real content and not a background
 *
 * MDN is explicit that a browser "might opt to leave out all background images" when
 * printing and that "any options the user agent offers the user to allow them to control
 * the use of color and images will take priority over the value of `print-color-adjust`
 * — in other words, there isn't any guarantee that `print-color-adjust` will do anything"
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust).
 * A watermark applied as a CSS `background-image` therefore silently disappears from a
 * printed contract whenever the user has not ticked Chrome's "Background graphics". Every
 * declaration this module produces is attached to a real element — rotated text, an
 * `<img>`, or an inline `<svg>` — because *content* prints regardless of that checkbox.
 *
 * ## Why the angle is a transform
 *
 * The tempting shortcut is `repeating-linear-gradient(45deg, …)`, but a gradient's angle
 * rotates the *gradient line*, not any glyphs — gradients are `<image>` values with no
 * intrinsic dimensions and no text at all
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/gradient/repeating-linear-gradient).
 * The angle here is a real `rotate()` on the mark (and an SVG `rotate(a cx cy)` for a
 * tile), which is the only way to tilt the letters themselves.
 */

import type { WatermarkOptions } from "../../typings/editor";
import { WATERMARK_Z_INDEX } from "./typing";
import type { WatermarkSettings } from "./typing";

/** The overlay element's class. */
export const WATERMARK_CLASS = "s-editor-watermark";

/** The single centred mark's class. */
export const WATERMARK_MARK_CLASS = "s-editor-watermark__mark";

/** One tile's class, for a tiled watermark. */
export const WATERMARK_TILE_CLASS = "s-editor-watermark__tile";

/** Default tilt, in degrees. Negative is anti-clockwise in CSS, i.e. the classic watermark. */
export const WATERMARK_DEFAULT_ANGLE = -30;

/** Default opacity. Low, because a contract must stay readable through its own watermark. */
export const WATERMARK_DEFAULT_OPACITY = 0.12;

/** Default text size. */
export const WATERMARK_DEFAULT_FONT_SIZE = "48px";

/** Default text colour. */
export const WATERMARK_DEFAULT_COLOR = "#000000";

/**
 * The grey a `greyscale` mark is drawn in.
 *
 * A *light solid* grey rather than a black at 5% opacity: opacity and blend modes are the
 * least predictable things in a print driver, and a solid grey needs neither. (This is
 * engineering judgement, not a documented browser behaviour.)
 */
export const WATERMARK_GREY = "#9aa0a6";

/** Tiles across the sheet, for a tiled watermark. */
export const WATERMARK_TILE_COLUMNS = 3;

/** Tile rows down the sheet, for a tiled watermark. */
export const WATERMARK_TILE_ROWS = 6;

/** Tile viewBox for an image watermark: a fixed landscape box the image is fitted into. */
export const WATERMARK_IMAGE_TILE_VIEW_BOX = "0 0 100 60";

/** Round to two decimals, which is a whole 0.01 user unit. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolve a partial configuration into complete settings.
 *
 * Every value is validated: an `angle` of `NaN` would produce `rotate(NaNdeg)`, which
 * silently invalidates the whole declaration and leaves the mark un-rotated — the exact
 * legacy failure in a different costume.
 */
export function resolveWatermarkSettings(options: WatermarkOptions | undefined): WatermarkSettings {
  const source: WatermarkOptions = options ?? {};

  const opacity = source.opacity;
  const angle = source.angle;

  return {
    enabled: source.enabled === true,
    text: typeof source.text === "string" ? source.text : "",
    imageSrc: typeof source.imageSrc === "string" ? source.imageSrc : "",
    angle: typeof angle === "number" && Number.isFinite(angle) ? angle : WATERMARK_DEFAULT_ANGLE,
    opacity:
      typeof opacity === "number" && Number.isFinite(opacity)
        ? Math.min(1, Math.max(0, opacity))
        : WATERMARK_DEFAULT_OPACITY,
    greyscale: source.greyscale === true,
    tiled: source.tiled === true,
    fontSize:
      typeof source.fontSize === "string" && source.fontSize.length > 0
        ? source.fontSize
        : WATERMARK_DEFAULT_FONT_SIZE,
    color:
      typeof source.color === "string" && source.color.length > 0
        ? source.color
        : WATERMARK_DEFAULT_COLOR
  };
}

/** `true` when two settings would render identically. */
export function watermarkSettingsEqual(a: WatermarkSettings, b: WatermarkSettings): boolean {
  return (
    a.enabled === b.enabled &&
    a.text === b.text &&
    a.imageSrc === b.imageSrc &&
    a.angle === b.angle &&
    a.opacity === b.opacity &&
    a.greyscale === b.greyscale &&
    a.tiled === b.tiled &&
    a.fontSize === b.fontSize &&
    a.color === b.color
  );
}

/**
 * `true` when there is something to draw.
 *
 * `enabled` alone is not enough: an enabled watermark with neither text nor an image would
 * still add an invisible overlay over every page.
 */
export function isWatermarkVisible(settings: WatermarkSettings): boolean {
  if (!settings.enabled) return false;
  return settings.imageSrc.length > 0 || settings.text.length > 0;
}

/**
 * The overlay's own declarations.
 *
 * `inset: 0` makes the overlay exactly the page box, so this element needs the page
 * container to be a positioned ancestor (`position: relative`) — the theme owns that, and
 * it is the one cross-extension requirement of this feature.
 *
 * `pointer-events: none` is what keeps a watermark from swallowing an editing click;
 * `overflow: hidden` is deliberate here (unlike the QR code) because a mark larger than
 * the sheet should be clipped *at the sheet*, exactly as it will be on paper.
 */
export function watermarkContainerDeclarations(
  settings: WatermarkSettings
): Record<string, string> {
  const declarations: Record<string, string> = {
    position: "absolute",
    inset: "0",
    "z-index": String(WATERMARK_Z_INDEX),
    "pointer-events": "none",
    "user-select": "none",
    overflow: "hidden",
    // Belt and braces only. It stops a browser desaturating whatever it *does* paint, but
    // it cannot make a background print — which is why nothing here is a background.
    "print-color-adjust": "exact",
    "-webkit-print-color-adjust": "exact"
  };

  if (settings.tiled) {
    declarations.display = "grid";
    declarations["grid-template-columns"] = `repeat(${WATERMARK_TILE_COLUMNS}, 1fr)`;
    declarations["grid-template-rows"] = `repeat(${WATERMARK_TILE_ROWS}, 1fr)`;
  }

  return declarations;
}

/**
 * The single centred mark's declarations.
 *
 * `translate(-50%, -50%) rotate(θ)`: the translate happens first (so the element is centred
 * on the sheet) and the rotation is about the element's own centre because of
 * `transform-origin: center`. Rotating first and translating second would swing the mark
 * off the page.
 */
export function watermarkMarkDeclarations(settings: WatermarkSettings): Record<string, string> {
  const declarations: Record<string, string> = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) rotate(${settings.angle}deg)`,
    "transform-origin": "center",
    opacity: String(settings.opacity)
  };

  if (settings.imageSrc.length > 0) {
    declarations["max-width"] = "80%";
    declarations["max-height"] = "80%";
    declarations["object-fit"] = "contain";
    if (settings.greyscale) declarations.filter = "grayscale(1)";
    return declarations;
  }

  declarations.color = settings.greyscale ? WATERMARK_GREY : settings.color;
  declarations["font-size"] = settings.fontSize;
  declarations["font-weight"] = "700";
  declarations["line-height"] = "1";
  declarations["white-space"] = "nowrap";
  return declarations;
}

/**
 * The font size in user units for an SVG tile.
 *
 * `font-size` is a CSS length, and SVG attributes need a number in the tile's own
 * coordinate system. Only `px` and a bare number are honoured, with the default for
 * anything else: a tile is a *repeating* decoration where the exact size matters far less
 * than the text fitting, and silently rendering at `NaN` would be worse.
 */
export function watermarkFontSizePx(settings: WatermarkSettings): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(settings.fontSize);
  if (!match) return Number.parseFloat(WATERMARK_DEFAULT_FONT_SIZE);
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) && value > 0 ? value : Number.parseFloat(WATERMARK_DEFAULT_FONT_SIZE);
}

/**
 * Estimate how wide a string is at a given font size.
 *
 * An estimate, not a measurement: it only decides the tile's `viewBox`, and the tile is
 * scaled to its grid cell anyway, so a few percent of error changes nothing. CJK
 * ideographs are full-width (1 em) and Latin letters average roughly 0.58 em in the sans
 * faces a watermark uses.
 */
export function estimateTextWidth(text: string, fontSizePx: number): number {
  const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
  let units = 0;
  // `for…of` walks code points, so an astral character counts once rather than twice.
  for (const character of text) units += CJK.test(character) ? 1 : 0.58;
  return Math.max(fontSizePx, units * fontSizePx);
}

/** One tile's `<svg>` attributes. */
export function watermarkTileSvgAttributes(settings: WatermarkSettings): Record<string, string> {
  if (settings.imageSrc.length > 0) {
    return {
      class: WATERMARK_TILE_CLASS,
      viewBox: WATERMARK_IMAGE_TILE_VIEW_BOX,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false"
    };
  }

  const width = estimateTextWidth(settings.text, watermarkFontSizePx(settings));
  // 0.6 of the text width is enough for the rotated bounding box (which is
  // `0.866 × 0.5` of the text box at 30°) plus a little air, and a shorter box means the
  // text is drawn larger inside its cell.
  const height = width * 0.6;
  return {
    class: WATERMARK_TILE_CLASS,
    viewBox: `0 0 ${round2(width)} ${round2(height)}`,
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
    focusable: "false"
  };
}

/** The `<text>` child of a tiled text watermark. */
export function watermarkTileTextAttributes(settings: WatermarkSettings): Record<string, string> {
  const fontSize = watermarkFontSizePx(settings);
  const width = estimateTextWidth(settings.text, fontSize);
  const height = width * 0.6;
  const centerX = round2(width / 2);
  const centerY = round2(height / 2);

  return {
    x: String(centerX),
    y: String(centerY),
    "text-anchor": "middle",
    "dominant-baseline": "central",
    // A real glyph rotation about the text's own centre — see the module comment for why
    // a gradient is not an option.
    transform: `rotate(${settings.angle} ${centerX} ${centerY})`,
    "font-size": String(fontSize),
    "font-weight": "700",
    fill: settings.greyscale ? WATERMARK_GREY : settings.color,
    "fill-opacity": String(settings.opacity)
  };
}

/** The `<image>` child of a tiled image watermark. */
export function watermarkTileImageAttributes(settings: WatermarkSettings): Record<string, string> {
  const attributes: Record<string, string> = {
    href: settings.imageSrc,
    x: "15%",
    y: "15%",
    width: "70%",
    height: "70%",
    preserveAspectRatio: "xMidYMid meet",
    // `rotate(angle cx cy)` about the middle of the fixed 100×60 image tile viewBox.
    transform: `rotate(${settings.angle} 50 30)`
  };
  if (settings.greyscale) attributes.filter = "grayscale(1)";
  return attributes;
}
