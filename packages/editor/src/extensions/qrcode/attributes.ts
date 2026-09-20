/**
 * The `qrcode` node's attributes and their HTML encoding.
 *
 * ## The encoding
 *
 * | attribute | HTML | why |
 * | --- | --- | --- |
 * | `text` | `data-qrcode-text` | the payload is a plain string, and a consumer (or a `grep`) should be able to read it without a JSON parse |
 * | `alt` | `alt` | it is already the accessible attribute, so it needs no second spelling |
 * | `src` | `src` | so an exported document still *shows* the code with no JavaScript |
 * | `size`, `position`, `color`, `margin` | `data-qrcode-config`, JSON | they are only ever written and read together, and one blob cannot disagree with itself about which fields exist |
 * | — | `data-type="qrcode"` | the marker `parseHTML` matches on |
 *
 * The four structured attributes share one `data-*` attribute, which is why each of their
 * per-attribute `renderHTML` returns `{}`: Tiptap merges every attribute's contribution
 * into a single object, so four writers would overwrite each other. The node's own
 * `renderHTML` in `index.ts` writes the blob once from `node.attrs`, and each attribute's
 * `parseHTML` below reads its own field back out of it.
 *
 * This is the fix for legacy defect 34: the legacy node declared only `src`, `size` and
 * `position`, rendered no `data-*` at all, and dropped `text` on every save.
 */

import {
  decodeQRCodeConfig,
  encodeQRCodeConfig,
  normalizeAttrs,
  QR_DEFAULT_ALT,
  QR_DEFAULT_COLOR,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_POSITION,
  QR_DEFAULT_SIZE,
  QR_DEFAULT_TEXT
} from "./geometry";
import type { QRCodeAttrs, QRCodeConfig, QRColor, QRLength, QRPosition } from "./typing";

/** The marker attribute `parseHTML` matches on. */
export const QR_CODE_TYPE_ATTRIBUTE = "data-type";

/** The value {@link QR_CODE_TYPE_ATTRIBUTE} must hold. */
export const QR_CODE_TYPE_VALUE = "qrcode";

/** The payload, as a plain attribute so it is readable without a JSON parse. */
export const QR_CODE_TEXT_ATTRIBUTE = "data-qrcode-text";

/** The structured attributes, as one JSON blob. */
export const QR_CODE_CONFIG_ATTRIBUTE = "data-qrcode-config";

/** The accessible label. */
export const QR_CODE_ALT_ATTRIBUTE = "alt";

/** The generated raster. */
export const QR_CODE_SRC_ATTRIBUTE = "src";

/** Read the JSON blob off an element. */
function readConfig(element: HTMLElement): Partial<QRCodeConfig> {
  return decodeQRCodeConfig(element.getAttribute(QR_CODE_CONFIG_ATTRIBUTE));
}

/** Narrow an unknown attribute value to a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The attribute set, written by the node's `renderHTML` and read by its `parseHTML`. */
export function qrCodeAttributes() {
  return {
    /** The payload. */
    text: {
      default: QR_DEFAULT_TEXT,
      parseHTML: (element: HTMLElement): string =>
        element.getAttribute(QR_CODE_TEXT_ATTRIBUTE) ?? QR_DEFAULT_TEXT,
      renderHTML: (attributes: Record<string, unknown>) => ({
        [QR_CODE_TEXT_ATTRIBUTE]: asString(attributes.text)
      })
    },

    /** The generated raster. */
    src: {
      default: "",
      // Read from `src` rather than a `data-*` twin: a document exported from the editor
      // carries a real `<img src="data:…">`, and a paste of that HTML must keep working.
      parseHTML: (element: HTMLElement): string =>
        element.getAttribute(QR_CODE_SRC_ATTRIBUTE) ?? "",
      renderHTML: (attributes: Record<string, unknown>) => ({
        [QR_CODE_SRC_ATTRIBUTE]: asString(attributes.src)
      })
    },

    /** The accessible label. */
    alt: {
      default: QR_DEFAULT_ALT,
      // An absent `alt` means "no label was given", so the default applies.
      parseHTML: (element: HTMLElement): string | undefined =>
        element.getAttribute(QR_CODE_ALT_ATTRIBUTE) ?? undefined,
      renderHTML: (attributes: Record<string, unknown>) => ({
        [QR_CODE_ALT_ATTRIBUTE]: asString(attributes.alt)
      })
    },

    /** Rendered size. The default is the legacy extension's. */
    size: {
      default: { ...QR_DEFAULT_SIZE } satisfies QRLength,
      parseHTML: (element: HTMLElement): QRLength | undefined => readConfig(element).size,
      // Written once, by the node's own `renderHTML`. See the module comment.
      renderHTML: () => ({})
    },

    /** Offset from the page's content-box origin. */
    position: {
      default: { ...QR_DEFAULT_POSITION } satisfies QRPosition,
      parseHTML: (element: HTMLElement): QRPosition | undefined => readConfig(element).position,
      renderHTML: () => ({})
    },

    /** The raster's two colours. */
    color: {
      default: { ...QR_DEFAULT_COLOR } satisfies QRColor,
      parseHTML: (element: HTMLElement): QRColor | undefined => readConfig(element).color,
      renderHTML: () => ({})
    },

    /** The quiet zone, in modules. */
    margin: {
      default: QR_DEFAULT_MARGIN,
      parseHTML: (element: HTMLElement): number | undefined => readConfig(element).margin,
      renderHTML: () => ({})
    }
  };
}

/**
 * Read every attribute off an element, the way ProseMirror's parser will.
 *
 * The reader half of the round-trip, exported so the tests can drive it without a live
 * editor: `getAttribute` is the only DOM method any of the readers use. Written out per
 * attribute rather than looped over `qrCodeAttributes()`, because the result is a typed
 * `Partial<QRCodeAttrs>` and an interface has no index signature to assign through.
 */
export function parseQRCodeAttributes(element: HTMLElement): Partial<QRCodeAttrs> {
  const config = readConfig(element);
  const parsed: Partial<QRCodeAttrs> = {};

  const text = element.getAttribute(QR_CODE_TEXT_ATTRIBUTE);
  if (text !== null) parsed.text = text;

  const src = element.getAttribute(QR_CODE_SRC_ATTRIBUTE);
  if (src !== null) parsed.src = src;

  const alt = element.getAttribute(QR_CODE_ALT_ATTRIBUTE);
  if (alt !== null) parsed.alt = alt;

  if (config.size !== undefined) parsed.size = config.size;
  if (config.position !== undefined) parsed.position = config.position;
  if (config.color !== undefined) parsed.color = config.color;
  if (config.margin !== undefined) parsed.margin = config.margin;

  return parsed;
}

/**
 * Apply an attribute patch to a base set, normalising the result.
 *
 * This merge *is* `updateQRCode`'s semantics, so it lives here where it can be tested
 * without an editor.
 */
export function mergeQRCodeAttrs(
  base: Partial<QRCodeAttrs>,
  patch: Partial<QRCodeAttrs>
): QRCodeAttrs {
  return normalizeAttrs({ ...base, ...patch });
}

/** Write the four structured attributes as the single JSON blob. */
export function renderQRCodeConfig(attrs: QRCodeAttrs): Record<string, string> {
  return { [QR_CODE_CONFIG_ATTRIBUTE]: encodeQRCodeConfig(attrs) };
}
