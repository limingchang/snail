/**
 * `@media print` CSS generation — pure, and the whole of the print extension's logic.
 *
 * ## What the legacy extension got wrong
 *
 * `browserPrint.ts` (defect 35): a `display: none` iframe, **no application CSS at all**,
 * `@page { margin: 0 }` for every page, and `page-break-after: always` on **every** page
 * including the last — which is where the trailing blank sheet came from. It also never set
 * `print-color-adjust: exact`, never waited for fonts or images, and `alert()`ed and
 * refused to print when the pages disagreed about their sheet.
 *
 * ## The design
 *
 * Native `@media print` in the editor's own document — approved decision 5 — so the printed
 * output is the edited document, with the application's stylesheets, fonts and images
 * already in place. The one thing CSS cannot express is a *different sheet per page*: a
 * single `@page` rule applies to the whole document, so {@link buildPrintStyles} renders the
 * first page's size and reports the mismatch instead of failing
 * (see `PrintWarning`).
 *
 * ## Two facts this file depends on
 *
 * - **`@page` margin boxes are Chromium 131+ only.** Every `@top-*`/`@bottom-*` entry in
 *   MDN's browser-compat data is `chrome: 131, firefox: false, safari: false`
 *   (https://developer.chrome.com/blog/print-margins,
 *   https://cdn.jsdelivr.net/gh/mdn/browser-compat-data@main/css/at-rules/page.json). They
 *   are therefore **opt-in**: the document's own `pageNumber` nodes print everywhere, so
 *   page numbers are never lost by leaving `marginBoxes` off.
 * - **`@page { margin: 0 }` suppresses Chrome's margin boxes.** Chromium decides the page
 *   layout from the *first* page and applies it to all of them, so a zero margin both hides
 *   the browser's automatic header/footer and prevents later pages from showing a margin box
 *   even when they have room
 *   (https://developer.chrome.com/blog/print-margins, https://issues.chromium.org/issues/374244475).
 *   {@link resolvePrintMargins} reserves room when margin boxes are asked for and no margin
 *   was configured.
 *
 * ## What is deliberately absent
 *
 * There is no `position: fixed` footer. Fixed elements *are* repeated on every printed page
 * by Chrome and Firefox, but the failure mode is not a missing footer: they clip body
 * content on page 2 and later
 * (https://lists.w3.org/Archives/Public/public-css-archive/2025Jul/0363.html). A real footer
 * is either a `@page` margin box (Chrome) or a node in the page (everywhere).
 */

import { DEFAULT_MARGINS, resolveMargins, resolvePaperSize } from "../../typings/paper";
import type { Margins, PaperSize, ResolvedMargins } from "../../typings/paper";
import type { PrintPageSetup } from "./typing";

/** The `id` of the single injected stylesheet. */
export const PRINT_STYLE_ELEMENT_ID = "s-editor-print-style";

/** Default selector for one page container. */
export const PRINT_PAGE_SELECTOR = ".s-editor-page";

/**
 * Default selector for the wrapper that owns the printed background.
 *
 * Three candidates, in order of preference: an attribute the host sets, the theme's own
 * paper class, and ProseMirror's own element — which is always present and is the direct
 * parent of the page containers.
 */
export const PRINT_PAPER_SELECTOR = "[data-print-root], .s-editor-paper, .ProseMirror";

/** The attribute that hides any element from printing. */
export const PRINT_HIDDEN_ATTRIBUTE = "data-print-hidden";

/** The selector form of {@link PRINT_HIDDEN_ATTRIBUTE}. */
export const PRINT_HIDDEN_SELECTOR = `[${PRINT_HIDDEN_ATTRIBUTE}]`;

/**
 * The room reserved for a margin box, when margin boxes are enabled and no margin is set.
 *
 * Chrome's own automatic header/footer lives in ~10 mm; 16 mm holds either without crowding
 * the text block.
 */
export const PRINT_MARGIN_BOX_RESERVE = "16mm";

/** A sheet with no margin. The page containers carry the document's own margins already. */
export const PRINT_ZERO_MARGINS: ResolvedMargins = {
  top: "0",
  right: "0",
  bottom: "0",
  left: "0"
};

/** What a document with no page setup at all is printed as. */
export const PRINT_DEFAULT_SETUP: Required<PrintPageSetup> = {
  paperFormat: "A4",
  orientation: "portrait"
};

/** What {@link buildPrintStyles} is given. */
export interface PrintStylesInput {
  /** One setup per page container, in document order. Empty for a bare document. */
  pages: PrintPageSetup[];

  /**
   * The `@page` margin.
   *
   * Omitted means `0` — the page containers already apply the document's margins as padding,
   * and adding them again here would double the margin. See
   * {@link resolvePrintMargins} for the one case where a zero margin is not used.
   */
  margins?: Margins;

  /** Emit `@page` margin boxes with `counter(page)` / `counter(pages)`. Default `false`. */
  marginBoxes?: boolean;

  /** Selector matching one page container. Default {@link PRINT_PAGE_SELECTOR}. */
  pageSelector?: string;

  /** Selector of the wrapper carrying the printed background. */
  paperSelector?: string;

  /** Extra selectors hidden while printing. `[data-print-hidden]` is always included. */
  hiddenSelectors?: string[];
}

/** What {@link buildPrintStyles} produced. */
export interface PrintStylesResult {
  /** The complete `@media print { … }` block, ready to be the text of a `<style>`. */
  css: string;
  /** The sheet actually declared in `@page` — the first page's. */
  size: PaperSize;
  /** The `@page` margin actually declared. */
  margins: ResolvedMargins;
  /** `true` when at least one page's sheet differs from the first page's. */
  mixed: boolean;
  /** Every page's resolved sheet, in document order — for diagnostics. */
  pageSizes: PaperSize[];
}

/** `true` for `"0"`, `"0mm"`, `"0px"`, … — a length that reserves nothing. */
export function isZeroLength(value: string): boolean {
  return /^\s*[+-]?0+(\.0+)?\s*(mm|cm|in|pt|px|em|rem|%)?\s*$/i.test(value);
}

/**
 * Resolve the `@page` margin.
 *
 * A configured margin is honoured exactly. Otherwise the margin is zero — *unless* margin
 * boxes were asked for, in which case a zero margin would suppress them (see the module
 * comment) and top/bottom room is reserved instead. Left and right stay zero even then: the
 * margin boxes are centred, and widening the side margins would reflow the whole document
 * for a page number.
 */
export function resolvePrintMargins(
  configured: Margins | undefined,
  marginBoxes: boolean
): ResolvedMargins {
  const resolved = configured === undefined ? { ...PRINT_ZERO_MARGINS } : resolveMargins(configured);
  if (!marginBoxes) return resolved;

  const reservesNothing = isZeroLength(resolved.top) && isZeroLength(resolved.bottom);
  if (!reservesNothing) return resolved;

  return {
    ...resolved,
    top: PRINT_MARGIN_BOX_RESERVE,
    bottom: PRINT_MARGIN_BOX_RESERVE
  };
}

/**
 * Write four sides as CSS's top/right/bottom/left shorthand.
 *
 * Collapsed to a single value when all four agree, so the common cases read as `margin: 0`
 * and `margin: 20mm` rather than as four repetitions of the same length.
 */
export function formatMargins(margins: ResolvedMargins): string {
  const { top, right, bottom, left } = margins;
  if (top === right && right === bottom && bottom === left) return top;
  return `${top} ${right} ${bottom} ${left}`;
}

/** The two margin boxes, and the engines that support them. */
function marginBoxRules(): string {
  // Chromium 131+ draws these with real page counters; Firefox and Safari do not implement
  // margin boxes at all, so they simply ignore the block. That asymmetry is why this is
  // opt-in and why the base mechanism is the document's own `pageNumber` nodes.
  return [
    "    @top-center {",
    "      content: counter(page);",
    "    }",
    "    @bottom-center {",
    '      content: "第 " counter(page) " 页 / 共 " counter(pages) " 页";',
    "    }"
  ].join("\n");
}

/** One `break-after` rule per page, so the last page cannot force a trailing blank sheet. */
function pageBreakRules(pageSelector: string, pageCount: number): string[] {
  const rules: string[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const isLast = index === pageCount - 1;
    // The last page's rule is emitted explicitly as `auto` rather than omitted: the theme or
    // a host stylesheet may well say `.s-editor-page { break-after: page }`, and only a more
    // specific rule (`:nth-of-type(n)` beats a class) can take it back. `break-after` and
    // `page-break-after` are aliases of one property, so this also neutralises a legacy
    // `page-break-after: always`.
    rules.push(
      [
        `  ${pageSelector}:nth-of-type(${index + 1}) {`,
        `    break-after: ${isLast ? "auto" : "page"};`,
        "  }"
      ].join("\n")
    );
  }

  return rules;
}

/**
 * Build the print stylesheet.
 *
 * Pure: no DOM, no editor, no side effects — which is what makes the interesting cases
 * (a single page, several pages, the last page, custom margins, margin boxes on and off)
 * testable in a plain Node environment.
 */
export function buildPrintStyles(input: PrintStylesInput): PrintStylesResult {
  const setups = input.pages.length > 0 ? input.pages : [PRINT_DEFAULT_SETUP];
  const first = setups[0] ?? PRINT_DEFAULT_SETUP;

  const size = resolvePaperSize(
    first.paperFormat ?? PRINT_DEFAULT_SETUP.paperFormat,
    first.orientation ?? PRINT_DEFAULT_SETUP.orientation
  );

  const pageSizes = setups.map((setup) =>
    resolvePaperSize(
      setup.paperFormat ?? PRINT_DEFAULT_SETUP.paperFormat,
      setup.orientation ?? PRINT_DEFAULT_SETUP.orientation
    )
  );

  const mixed = pageSizes.some(
    (candidate) => candidate.width !== size.width || candidate.height !== size.height
  );

  const marginBoxes = input.marginBoxes === true;
  const margins = resolvePrintMargins(input.margins, marginBoxes);
  const pageSelector = input.pageSelector ?? PRINT_PAGE_SELECTOR;
  const paperSelector = input.paperSelector ?? PRINT_PAPER_SELECTOR;

  // `[data-print-hidden]` first, so the attribute is always hidden even when a host passes
  // an empty list; deduplicated, so a host that also lists the attribute does not produce a
  // repeated selector.
  const hiddenSelectors = Array.from(
    new Set([PRINT_HIDDEN_SELECTOR, ...(input.hiddenSelectors ?? [])].filter((entry) => entry.length > 0))
  );

  const pageRules = [
    "  @page {",
    `    size: ${size.width}mm ${size.height}mm;`,
    `    margin: ${formatMargins(margins)};`,
    ...(marginBoxes ? [marginBoxRules()] : []),
    "  }"
  ].join("\n");

  const blocks: string[] = [
    pageRules,
    // The print dialog must not add a scrollbar's worth of body margin to the first sheet.
    ["  html,", "  body {", "    margin: 0 !important;", "    padding: 0 !important;", "  }"].join(
      "\n"
    ),
    // On a *wrapper*, never on `body`: Chrome and Safari are documented as not printing the
    // body element's own background even with `exact`. Note this is a hint only — the user's
    // own print options win — which is why the watermark is real content as well.
    [
      `  ${paperSelector} {`,
      "    print-color-adjust: exact;",
      "    -webkit-print-color-adjust: exact;",
      "  }"
    ].join("\n"),
    ...pageBreakRules(pageSelector, setups.length),
    [`  ${hiddenSelectors.join(", ")} {`, "    display: none !important;", "  }"].join("\n")
  ];

  return {
    css: ["@media print {", ...blocks, "}", ""].join("\n"),
    size,
    margins,
    mixed,
    pageSizes
  };
}

/** The default margins, re-exported so a host can offer them as the "normal" preset. */
export { DEFAULT_MARGINS };
