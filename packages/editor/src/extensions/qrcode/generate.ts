/**
 * Raster generation — the only DOM-dependent part of the QR code, kept behind one
 * function.
 *
 * Two things are deliberate here:
 *
 * 1. **The import is lazy.** `qrcode`'s browser build draws through a `<canvas>`, so
 *    touching it at module scope would make the whole editor DOM-bound at import time —
 *    fatal for SSR and page weight for the many editors that never insert a code. The
 *    module is loaded on the first generation and cached, and the cache is cleared when
 *    the load fails so a transient failure is not permanent.
 * 2. **The library's shape is not assumed.** `qrcode` is CommonJS with a `browser` field;
 *    depending on the bundler and the interop setting, `toDataURL` is either a named
 *    export or a property of the default export. Both are accepted, because getting this
 *    wrong is a runtime failure that only appears in a consumer's build.
 */

import { QR_PRINT_DPI, toRasterPixels } from "./geometry";
import type { QRCodeAttrs, QRCodeGenerationOptions } from "./typing";

/** The subset of `qrcode`'s options this extension uses. */
interface ToDataURLOptions {
  /** Raster edge, in device pixels. */
  width: number;
  /** Quiet zone, in modules. */
  margin: number;
  /** Error-correction level. */
  errorCorrectionLevel: "L" | "M" | "Q" | "H";
  /** Module and background colours. */
  color: { dark: string; light: string };
}

/** `qrcode`'s `toDataURL`, which resolves to a `data:image/png;base64,…` URL. */
export type ToDataURL = (text: string, options?: ToDataURLOptions) => Promise<string>;

/** The cached module promise. Cleared on failure; never holds a strong reference. */
let loader: Promise<ToDataURL> | undefined;

/** Pull `toDataURL` out of whichever module shape the bundler produced. */
function resolveToDataURL(module: unknown): ToDataURL {
  const candidate = module as { toDataURL?: unknown; default?: { toDataURL?: unknown } };
  const fn = candidate.toDataURL ?? candidate.default?.toDataURL;
  if (typeof fn !== "function") {
    throw new Error("[snail] the `qrcode` package exposes no `toDataURL`");
  }
  return fn as ToDataURL;
}

/**
 * Load `qrcode`'s `toDataURL`, once per session.
 *
 * @returns a promise for the function. A rejected load forgets itself, so a retry after a
 * network hiccup (a lazily-split chunk that failed to fetch) can succeed.
 */
export function loadToDataURL(): Promise<ToDataURL> {
  loader ??= import("qrcode")
    .then(resolveToDataURL)
    .catch((error: unknown) => {
      loader = undefined;
      throw error;
    });
  return loader;
}

/**
 * The options a generation needs, taken from the extension's configuration.
 *
 * A separate shape from `QRCodeOptions` because generation must not care about
 * `HTMLAttributes` or the error sink.
 */
export function generationOptions(options: {
  dpi?: number;
  errorCorrectionLevel?: QRCodeGenerationOptions["errorCorrectionLevel"];
}): QRCodeGenerationOptions {
  return {
    dpi: options.dpi ?? QR_PRINT_DPI,
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M"
  };
}

/**
 * Generate the raster for an attribute set.
 *
 * @param attrs - the node's attributes. Only `text`, `size`, `margin` and `color` matter.
 * @param options - resolution and error correction.
 * @returns the `data:` URL to store in `src`.
 * @throws when the payload is blank (there is nothing to encode) or the canvas is
 * unavailable (a server-side render, where the caller should not have asked).
 */
export async function generateQRCodeDataURL(
  attrs: QRCodeAttrs,
  options: QRCodeGenerationOptions
): Promise<string> {
  // Trimmed only for the emptiness test: the stored payload and the encoded payload must
  // be the same string, so a payload with meaningful surrounding whitespace survives.
  if (attrs.text.trim().length === 0) {
    throw new Error("[snail] a QR code needs a non-empty payload");
  }

  const toDataURL = await loadToDataURL();

  return toDataURL(attrs.text, {
    width: toRasterPixels(attrs.size, options.dpi),
    margin: attrs.margin,
    errorCorrectionLevel: options.errorCorrectionLevel,
    color: { dark: attrs.color.dark, light: attrs.color.light }
  });
}
