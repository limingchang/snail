/**
 * The print extension's own contract.
 *
 * The user-facing options are `PrintOptions` in `typings/editor.ts`, because the same shape
 * is what the top-level component passes through. Everything {@link PrintExtensionOptions}
 * adds is a knob of the *pipeline* — which selectors to hide, which element is the paper —
 * rather than something a caller of the component configures.
 */

import type { PrintOptions } from "../../typings/editor";
import type { Margins, Orientation, PaperFormat, PaperSize } from "../../typings/paper";

/**
 * A page setup, as read off one `page` node.
 *
 * Both fields are optional because a document may have been written before the page
 * extension recorded them, and {@link resolvePaperSize} already has an answer for "no
 * format given" (A4).
 */
export interface PrintPageSetup {
  paperFormat?: PaperFormat;
  orientation?: Orientation;
}

/**
 * Why printing could not reproduce the document exactly.
 *
 * The legacy extension `alert()`ed and *refused to print* when the pages disagreed about
 * size (defect 35). Refusing is the worst possible answer for a contract: the user asked
 * for paper and got nothing. The document prints with the first page's sheet and the
 * situation is reported here so a host can show a warning *after* the paper exists.
 */
export interface PrintWarning {
  /** Machine-readable kind. Currently only one. */
  code: "mixed-page-setup";
  /** A message a host may show verbatim. */
  message: string;
  /** The setup that was actually used — the first page's. */
  used: { paperFormat: PaperFormat; orientation: Orientation; size: PaperSize };
  /** Every page whose sheet differs from {@link used}, with its resolved size. */
  differingPages: Array<{ index: number; size: PaperSize }>;
}

/** What a caller may configure on the extension. */
export interface PrintExtensionOptions extends PrintOptions {
  /**
   * Extra selectors hidden while printing, on top of `[data-print-hidden]`.
   *
   * The attribute is always hidden, so the cheapest wiring for a host is to put
   * `data-print-hidden` on its toolbar; this list exists for chrome the host cannot
   * annotate — a third-party widget, a portal rendered into `document.body`.
   *
   * @example [".s-editor-toolbar", ".el-message-box", ".v-modal"]
   */
  hiddenSelectors?: string[];

  /**
   * Selector matching **one** page container.
   *
   * Default `.s-editor-page`. The rule that gives a page its `break-after` is emitted per
   * page index (`:nth-of-type(n)`), so this must match the page elements themselves and
   * those elements must be siblings of the same type.
   */
  pageSelector?: string;

  /**
   * Selector of the wrapper that carries the printed background.
   *
   * Default `[data-print-root], .s-editor-paper, .ProseMirror`. `print-color-adjust: exact`
   * must sit on a *wrapper*: Chrome and Safari are documented as not printing the `<body>`
   * element's own background even with `exact`
   * (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust).
   * The default list covers a host that marks its own wrapper, the theme's paper class, and
   * ProseMirror's own element, in that order of preference.
   */
  paperSelector?: string;

  /** Called when the document could not be reproduced exactly. See {@link PrintWarning}. */
  onWarning?: (warning: PrintWarning) => void;

  /**
   * Called when the print pipeline itself failed — a stylesheet that could not be injected,
   * a promise that rejected. A failure here cannot be reported through the command's return
   * value, because the work outlives the (synchronous) command.
   */
  onError: (error: unknown) => void;
}

/** Re-exported so a host has one import for the whole contract. */
export type { Margins, Orientation, PaperFormat, PaperSize } from "../../typings/paper";
