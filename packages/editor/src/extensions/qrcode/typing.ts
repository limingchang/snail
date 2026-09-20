/**
 * The `qrcode` node's own contract.
 *
 * The legacy extension declared three attributes (`src`, `size`, `position`) and left the
 * payload out of the schema entirely, so a saved template lost the text and the raster
 * could only be changed by writing to the DOM (defects 32 and 34). Everything the node
 * renders from is declared here, and every field round-trips through HTML — see the
 * encoding table in `attributes.ts`.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";

/** The length units a QR code's size and position may be written in. */
export const QR_UNITS = ["mm", "px", "cm"] as const;

/** One of {@link QR_UNITS}. */
export type QRUnit = (typeof QR_UNITS)[number];

/** A length with a unit. */
export interface QRLength {
  /** The numeric part. Finite and never negative. */
  value: number;
  /** The unit. */
  unit: QRUnit;
}

/** The QR code's top-left corner, measured from the page's content-box origin. */
export interface QRPosition {
  x: number;
  y: number;
  unit: QRUnit;
}

/** The two colours `qrcode` renders with. */
export interface QRColor {
  /** The module colour. */
  dark: string;
  /** The background colour, which also becomes the quiet zone. */
  light: string;
}

/** Everything besides the payload that a QR code carries. */
export interface QRCodeConfig {
  /** Rendered size. Default `{ value: 30, unit: "mm" }` — the legacy default. */
  size: QRLength;

  /** Offset from the page's content-box origin. Default `{ x: 10, y: 10, unit: "mm" }`. */
  position: QRPosition;

  /** The raster's ink and paper colours. */
  color: QRColor;

  /**
   * The quiet zone, in QR **modules** — the unit `qrcode` itself uses, not a CSS length.
   *
   * Default `4`, the width ISO/IEC 18004 asks for and therefore the safest value for a
   * code that has to be scanned off paper. `qrcode`'s own default is also `4`.
   */
  margin: number;
}

/** The node's complete attribute set: the payload plus {@link QRCodeConfig}. */
export interface QRCodeAttrs extends QRCodeConfig {
  /** The encoded payload. The legacy schema dropped this on every save (defect 34). */
  text: string;

  /** The generated `data:` URL. Empty until a raster has been generated. */
  src: string;

  /**
   * Accessible label, rendered as the `<img>`'s `alt`.
   *
   * A QR code is unreadable to a screen reader and to anyone who cannot scan it, so the
   * label is the only description of what it points at.
   */
  alt: string;
}

/**
 * What a caller may pass to a command.
 *
 * Every field is optional: `updateQRCode({ position: … })` must not have to re-state the
 * payload, and `insertQRCode({ text })` is the common case.
 */
export type QRCodeInput = Partial<QRCodeAttrs>;

/** `qrcode`'s error-correction levels. */
export type QRErrorCorrectionLevel = "L" | "M" | "Q" | "H";

/** What a raster is generated from. */
export interface QRCodeGenerationOptions {
  /** Raster resolution for physical sizes. See `QR_PRINT_DPI`. */
  dpi: number;
  /** `qrcode`'s error-correction level. */
  errorCorrectionLevel: QRErrorCorrectionLevel;
}

/**
 * What a caller may configure on the extension.
 *
 * All fields have defaults, so `QRCode.configure({})` is a complete configuration.
 */
export interface QRCodeOptions {
  /** Merged into every rendered `<img>`. */
  HTMLAttributes: Record<string, unknown>;

  /**
   * `qrcode`'s error-correction level. Default `"M"`.
   *
   * `"M"` recovers ~15% of the code and keeps the module count low, which is what a
   * printed contract wants: `"H"` survives more physical damage but produces a denser code
   * that a phone camera has to work harder on at the same physical size.
   */
  errorCorrectionLevel: QRErrorCorrectionLevel;

  /**
   * Raster resolution in dots per inch, for sizes given in `mm`/`cm`. Default
   * `QR_PRINT_DPI` (300), the usual commercial-print floor.
   */
  dpi: number;

  /**
   * Called when a raster could not be generated, so a failure is never silent.
   *
   * Generation is asynchronous and Tiptap's commands are not, so the failure cannot be
   * reported through the command's return value; a host that wants to show a message must
   * subscribe here.
   */
  onError: (error: unknown) => void;
}

/** What the node view is handed. */
export interface QRCodeNodeViewContext {
  /** The node type's name, used for the `data-type` attribute. */
  name: string;

  /**
   * The node's attributes at the time the view was built.
   *
   * The view keeps its own normalised copy and refreshes it in `update`; nothing else
   * reads the node, so there is no second accessor to fall out of step with it.
   */
  attrs: QRCodeAttrs;
}

/**
 * The surface `index.ts` builds a view to.
 *
 * `NodeView`'s only required member is `dom`; requiring the rest here is what makes
 * `nodeView.ts`'s return value a checkable implementation rather than a bag of
 * maybe-methods. `update` is narrowed to the arguments the view actually uses, which a
 * function with fewer parameters satisfies at `addNodeView()`.
 */
export interface QRCodeNodeView extends NodeView {
  dom: HTMLImageElement;
  update: (node: ProseMirrorNode, decorations: readonly Decoration[]) => boolean;
  selectNode: () => void;
  deselectNode: () => void;
  ignoreMutation: () => boolean;
  destroy: () => void;
}
