/**
 * The watermark extension's own contract.
 *
 * The *settings* a consumer configures are `WatermarkOptions` in `typings/editor.ts`,
 * because the same shape is what the top-level component persists into the
 * `TemplateDocument` — two declarations of it would drift. What belongs here is what only
 * the extension knows: the fully-resolved settings it renders from, its storage, and the
 * `z-index` that the QR code has to stay below.
 */

import type { WatermarkOptions } from "../../typings/editor";

/**
 * The watermark's `z-index`.
 *
 * A watermark is a rendering *instruction over the page*, while a QR code is content *on*
 * it, so the watermark must paint on top. `QR_CODE_Z_INDEX` in
 * `../qrcode/geometry.ts` is `1`; the two are asserted against each other in the tests so
 * the ordering cannot rot.
 */
export const WATERMARK_Z_INDEX = 10;

/**
 * {@link WatermarkOptions} with every field resolved.
 *
 * The plugin renders from this, never from the raw options, so the defaults exist in one
 * place and a partially-configured watermark cannot produce `undefined` in an inline
 * style.
 */
export interface WatermarkSettings {
  /** `false` renders nothing at all. */
  enabled: boolean;
  /** The mark's text. Empty for an image watermark. */
  text: string;
  /** An `<img>` source for an image watermark. Wins over {@link text} when both are set. */
  imageSrc: string;
  /** Degrees, handed straight to CSS `rotate()`/SVG `rotate()`. Default `-30`. */
  angle: number;
  /** `0…1`. Default `0.12`. */
  opacity: number;
  /** Render the mark in grey. Default `false`. */
  greyscale: boolean;
  /** Repeat the mark across the sheet instead of drawing one centred mark. */
  tiled: boolean;
  /** Font size for a text mark, as a CSS length. Default `"48px"`. */
  fontSize: string;
  /** Colour for a text mark. Default `"#000000"`. */
  color: string;
}

/**
 * What the extension keeps at runtime.
 *
 * The settings live in `editor.storage.watermark.settings` so a host can read them
 * without knowing how the decoration is built, and the *document* never carries them: a
 * watermark is a rendering instruction, so it belongs in the template's page setup rather
 * than in its content.
 */
export interface WatermarkStorage {
  /** The current settings, kept in step with the extension's options. */
  settings: WatermarkSettings;
}

/**
 * What a caller may configure.
 *
 * Identical to {@link WatermarkOptions}; named here so the extension's own signature reads
 * the same as the other extensions' and so a future extension-only knob has a home.
 */
export type WatermarkExtensionOptions = WatermarkOptions;
