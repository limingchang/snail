/**
 * The generated print stylesheet.
 *
 * Legacy defect 35 in one assertion: `page-break-after: always` was on **every** page including
 * the last, which is where the trailing blank sheet came from. The last page must not carry a
 * break — and it must carry an explicit `auto`, because the theme is likely to set one on the
 * class.
 *
 * `styles.ts` is deliberately free of DOM and of Tiptap, so all of this is verified as a plain
 * string transformation.
 */

import { describe, expect, it } from "vitest";

import { mixedPageSetupWarning, readPageSetup, usedSetup, withOptionOverrides } from "../../src/extensions/print/printDocument";
import {
  buildPrintStyles,
  formatMargins,
  isZeroLength,
  PRINT_HIDDEN_SELECTOR,
  PRINT_MARGIN_BOX_RESERVE,
  PRINT_ZERO_MARGINS,
  resolvePrintMargins
} from "../../src/extensions/print/styles";
import type { PrintPageSetup } from "../../src/extensions/print/typing";

/** One A4 portrait sheet. */
const A4: PrintPageSetup = { paperFormat: "A4", orientation: "portrait" };

describe("the sheet", () => {
  it("declares the first page's paper size in millimetres", () => {
    const result = buildPrintStyles({ pages: [A4] });
    expect(result.size).toStrictEqual({ width: 210, height: 297 });
    expect(result.css).toMatch(/size:\s*210mm 297mm;/);
  });

  it("applies orientation through resolvePaperSize", () => {
    const result = buildPrintStyles({ pages: [{ paperFormat: "A4", orientation: "landscape" }] });
    expect(result.size).toStrictEqual({ width: 297, height: 210 });
  });

  it("honours a custom format instead of falling back to A4", () => {
    const result = buildPrintStyles({
      pages: [{ paperFormat: { name: "receipt", width: 80, height: 200 }, orientation: "portrait" }]
    });
    expect(result.size).toStrictEqual({ width: 80, height: 200 });
    expect(result.css).toMatch(/size:\s*80mm 200mm;/);
  });

  it("defaults to A4 portrait for a document with no pages at all", () => {
    const result = buildPrintStyles({ pages: [] });
    expect(result.size).toStrictEqual({ width: 210, height: 297 });
    expect(result.mixed).toBe(false);
  });

  it("wraps everything in a print media query, with @page inside it", () => {
    const { css } = buildPrintStyles({ pages: [A4] });
    expect(css.trimStart().startsWith("@media print {")).toBe(true);
    expect(css.indexOf("@media print")).toBeLessThan(css.indexOf("@page"));
  });
});

describe("page breaks", () => {
  it("does not put a break after the only page, which is the trailing blank sheet", () => {
    const { css } = buildPrintStyles({ pages: [A4] });
    expect(css).not.toContain("break-after: page");
    expect(css).toMatch(/\.s-editor-page:nth-of-type\(1\)\s*\{\s*break-after:\s*auto;/);
  });

  it("breaks after every page except the last", () => {
    const { css } = buildPrintStyles({ pages: [A4, A4, A4] });
    expect(css).toMatch(/\.s-editor-page:nth-of-type\(1\)\s*\{\s*break-after:\s*page;/);
    expect(css).toMatch(/\.s-editor-page:nth-of-type\(2\)\s*\{\s*break-after:\s*page;/);
    expect(css).toMatch(/\.s-editor-page:nth-of-type\(3\)\s*\{\s*break-after:\s*auto;/);
  });

  it("emits exactly one break rule per page", () => {
    const { css } = buildPrintStyles({ pages: [A4, A4] });
    expect(css.match(/\.s-editor-page:nth-of-type\(/g)).toHaveLength(2);
  });

  it("follows a configured page selector", () => {
    const { css } = buildPrintStyles({ pages: [A4, A4], pageSelector: "[data-page]" });
    expect(css).toContain("[data-page]:nth-of-type(1)");
    expect(css).toContain("[data-page]:nth-of-type(2)");
    expect(css).not.toContain(".s-editor-page:nth-of-type");
  });

  it("never emits a fixed footer, which clips content on page 2", () => {
    const { css } = buildPrintStyles({ pages: [A4, A4] });
    expect(css).not.toContain("position: fixed");
  });
});

describe("margins", () => {
  it("uses a zero @page margin by default, because the page containers carry their own", () => {
    const { margins, css } = buildPrintStyles({ pages: [A4] });
    expect(margins).toStrictEqual(PRINT_ZERO_MARGINS);
    expect(css).toMatch(/margin:\s*0;/);
  });

  it("honours configured margins, including the CSS shorthand form", () => {
    const { margins, css } = buildPrintStyles({ pages: [A4], margins: "10mm 20mm" });
    expect(margins).toStrictEqual({
      top: "10mm",
      right: "20mm",
      bottom: "10mm",
      left: "20mm"
    });
    expect(css).toMatch(/margin:\s*10mm 20mm 10mm 20mm;/);
  });

  it("collapses four equal sides into one value", () => {
    expect(formatMargins({ top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" })).toBe("20mm");
    expect(formatMargins({ top: "10mm", right: "20mm", bottom: "10mm", left: "20mm" })).toBe(
      "10mm 20mm 10mm 20mm"
    );
  });

  it("recognises a length that reserves nothing", () => {
    expect(isZeroLength("0")).toBe(true);
    expect(isZeroLength("0mm")).toBe(true);
    expect(isZeroLength("0.0px")).toBe(true);
    expect(isZeroLength("0%")).toBe(true);
    expect(isZeroLength("20mm")).toBe(false);
    expect(isZeroLength("0.5mm")).toBe(false);
    expect(isZeroLength("")).toBe(false);
  });

  it("reserves room for margin boxes when no margin was configured", () => {
    // Chromium decides the whole document's page layout from the first page, so a zero margin
    // suppresses the margin boxes on every page.
    expect(resolvePrintMargins(undefined, true).top).toBe(PRINT_MARGIN_BOX_RESERVE);
    expect(resolvePrintMargins(undefined, true).bottom).toBe(PRINT_MARGIN_BOX_RESERVE);
    expect(resolvePrintMargins(undefined, true).left).toBe("0");
  });

  it("does not second-guess a configured margin just because margin boxes are on", () => {
    expect(resolvePrintMargins("20mm", true).top).toBe("20mm");
  });
});

describe("margin boxes", () => {
  it("emits no margin box by default", () => {
    const { css } = buildPrintStyles({ pages: [A4] });
    expect(css).not.toContain("@top-center");
    expect(css).not.toContain("counter(page)");
  });

  it("emits the page counter and the page-of-total footer when asked", () => {
    const { css } = buildPrintStyles({ pages: [A4], marginBoxes: true });
    expect(css).toContain("@top-center");
    expect(css).toContain("@bottom-center");
    expect(css).toMatch(/content:\s*counter\(page\);/);
    expect(css).toMatch(/content:\s*"第 "\s*counter\(page\)\s*" 页 \/ 共 "\s*counter\(pages\)\s*" 页";/);
  });
});

describe("colour and chrome", () => {
  it("marks the paper wrapper exact, and not the body element", () => {
    const { css } = buildPrintStyles({ pages: [A4] });
    expect(css).toContain("print-color-adjust: exact;");
    // The prefixed form is for older WebKit.
    expect(css).toContain("-webkit-print-color-adjust: exact;");

    // Chrome and Safari do not print the body element's own background even with `exact`, so
    // the rule has to sit on a wrapper — asserted as "it is not in the body block".
    const bodyBlock = /html,\s*body\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(bodyBlock).not.toContain("print-color-adjust");
    expect(css).toContain("[data-print-root], .s-editor-paper, .ProseMirror {");
  });

  it("always hides the attribute, and follows configured selectors", () => {
    const { css } = buildPrintStyles({
      pages: [A4],
      hiddenSelectors: [".s-editor-toolbar", ".el-overlay"]
    });
    expect(css).toContain(`${PRINT_HIDDEN_SELECTOR}, .s-editor-toolbar, .el-overlay {`);
    expect(css).toMatch(/display:\s*none !important;/);
  });

  it("hides the attribute even with no configured selectors", () => {
    const { css } = buildPrintStyles({ pages: [A4] });
    expect(css).toContain(`${PRINT_HIDDEN_SELECTOR} {`);
  });

  it("does not repeat a selector a host listed explicitly", () => {
    const { css } = buildPrintStyles({ pages: [A4], hiddenSelectors: [PRINT_HIDDEN_SELECTOR] });
    expect(css.match(/\[data-print-hidden\]/g)).toHaveLength(1);
  });

  it("follows a configured paper selector", () => {
    const { css } = buildPrintStyles({ pages: [A4], paperSelector: "#paper" });
    expect(css).toContain("#paper {");
    expect(css).not.toContain(".ProseMirror {");
  });
});

describe("mixed page setups", () => {
  it("is false when every page agrees", () => {
    const result = buildPrintStyles({ pages: [A4, { paperFormat: "A4" }] });
    expect(result.mixed).toBe(false);
  });

  it("is true for a differing size, and the first page's wins", () => {
    const result = buildPrintStyles({ pages: [A4, { paperFormat: "A3" }] });
    expect(result.mixed).toBe(true);
    expect(result.size).toStrictEqual({ width: 210, height: 297 });
    expect(result.pageSizes).toStrictEqual([
      { width: 210, height: 297 },
      { width: 297, height: 420 }
    ]);
  });

  it("is true for a differing orientation", () => {
    const result = buildPrintStyles({
      pages: [A4, { paperFormat: "A4", orientation: "landscape" }]
    });
    expect(result.mixed).toBe(true);
    expect(result.size).toStrictEqual({ width: 210, height: 297 });
  });

  it("reports the differing pages without refusing to print", () => {
    const pages: PrintPageSetup[] = [A4, { paperFormat: "A3" }, A4];
    const styles = buildPrintStyles({ pages });
    const warning = mixedPageSetupWarning(pages, styles);

    expect(warning.code).toBe("mixed-page-setup");
    expect(warning.used.paperFormat).toBe("A4");
    expect(warning.used.size).toStrictEqual({ width: 210, height: 297 });
    expect(warning.differingPages).toStrictEqual([
      { index: 2, size: { width: 297, height: 420 } }
    ]);
    // Nothing about this is fatal: the stylesheet is still complete.
    expect(styles.css).toContain("@media print");
  });
});

describe("reading a page node", () => {
  it("reads the contract's attribute names", () => {
    expect(readPageSetup({ paperFormat: "A3", orientation: "landscape" })).toStrictEqual({
      paperFormat: "A3",
      orientation: "landscape"
    });
  });

  it("leaves an unknown named format undefined rather than pretending it is A4", () => {
    // Otherwise a typo would look like a real setup and the mixed-sheet detection would report
    // a phantom difference.
    expect(readPageSetup({ paperFormat: "A4x" }).paperFormat).toBeUndefined();
    expect(readPageSetup({ paperFormat: { width: 100, height: 200, name: "x" } }).paperFormat).toStrictEqual(
      { width: 100, height: 200, name: "x" }
    );
  });

  it("ignores an orientation it does not know", () => {
    expect(readPageSetup({ orientation: "sideways" }).orientation).toBeUndefined();
  });

  it("defaults a bare setup to A4 portrait", () => {
    expect(usedSetup([])).toStrictEqual({ paperFormat: "A4", orientation: "portrait" });
    expect(usedSetup([{}])).toStrictEqual({ paperFormat: "A4", orientation: "portrait" });
  });

  it("lets an explicit option override every page", () => {
    const overridden = withOptionOverrides([A4, { paperFormat: "A3" }], {
      paperFormat: "A5",
      onError: () => undefined
    });
    expect(overridden.every((page) => page.paperFormat === "A5")).toBe(true);
  });

  it("leaves the document alone when no option was given", () => {
    const pages: PrintPageSetup[] = [A4, { paperFormat: "A3" }];
    expect(withOptionOverrides(pages, { onError: () => undefined })).toBe(pages);
  });
});
