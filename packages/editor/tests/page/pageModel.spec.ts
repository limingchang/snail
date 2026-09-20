import { describe, expect, it } from "vitest";

import {
  readMargins,
  readNumber,
  readOrientation,
  readPaperFormat,
  readTextAlign
} from "../../src/extensions/page/utils/attributes";
import { formatPageNumberLabel } from "../../src/extensions/page/utils/pageNumberLabel";

/**
 * The page model's pure edges: the readers that stand between a stored/parsed attribute
 * and the layout code, and the page-number label.
 *
 * Both matter for defects that are invisible until a real document is opened: an
 * unresolved attribute silently becomes `undefined` and every measurement is then based on
 * a wrong margin or a wrong sheet size (defect 12/17), and a stale number is the whole of
 * defect 10.
 */
describe("attribute readers", () => {
  it("honours a custom paper format instead of falling back to A4 (defect 17)", () => {
    // The legacy resolver tested `paperFormat.width in defaultPaper` — a number looked up
    // in a table of names — so this returned A4.
    expect(readPaperFormat({ name: "contract", width: 200, height: 300 })).toEqual({
      name: "contract",
      width: 200,
      height: 300
    });
    expect(readPaperFormat("A3")).toBe("A3");
  });

  it("rejects a format it does not know, and anything of the wrong shape", () => {
    expect(readPaperFormat("B5")).toBe("A4");
    expect(readPaperFormat({ width: "200", height: 300 })).toBe("A4");
    expect(readPaperFormat(null)).toBe("A4");
  });

  it("reads orientation and alignment without ever returning the wrong union member", () => {
    expect(readOrientation("landscape")).toBe("landscape");
    expect(readOrientation("LANDSCAPE")).toBe("portrait");
    expect(readOrientation(undefined)).toBe("portrait");

    expect(readTextAlign("justify", "left")).toBe("justify");
    expect(readTextAlign("centre", "left")).toBe("left");
    expect(readTextAlign(4, "right")).toBe("right");
  });

  it("accepts margins as a shorthand string or as four sides", () => {
    expect(readMargins("10mm 20mm")).toBe("10mm 20mm");
    expect(readMargins({ top: "1mm", right: "2mm", bottom: "3mm", left: "4mm" })).toEqual({
      top: "1mm",
      right: "2mm",
      bottom: "3mm",
      left: "4mm"
    });
    // A partial object is not margins; the caller falls back to the defaults.
    expect(readMargins({ top: "1mm" })).toBeUndefined();
    expect(readMargins(null)).toBeUndefined();
  });

  it("reads numbers only when they are finite", () => {
    expect(readNumber(2.5, 0)).toBe(2.5);
    expect(readNumber(Number.NaN, 7)).toBe(7);
    expect(readNumber("3", 7)).toBe(7);
  });
});

describe("formatPageNumberLabel", () => {
  const fallback = "第{page}页，共{total}页";

  it("substitutes the modern placeholders", () => {
    expect(formatPageNumberLabel("{page}/{total}", 3, 12, fallback)).toBe("3/12");
  });

  it("keeps the legacy spellings working so an old template still renders", () => {
    expect(formatPageNumberLabel("第#页，共&页", 3, 12, fallback)).toBe("第3页，共12页");
    expect(formatPageNumberLabel("$index of $total", 3, 12, fallback)).toBe("3 of 12");
  });

  it("substitutes a repeated placeholder everywhere", () => {
    expect(formatPageNumberLabel("{page}-{page}", 2, 9, fallback)).toBe("2-2");
  });

  it("falls back for an empty or missing format instead of rendering nothing (defect 1)", () => {
    // The legacy default was `""`, which reached `schema.text("")` and threw
    // `RangeError: Empty text nodes are not allowed`.
    expect(formatPageNumberLabel("", 4, 10, fallback)).toBe("第4页，共10页");
    expect(formatPageNumberLabel("   ", 4, 10, fallback)).toBe("第4页，共10页");
    expect(formatPageNumberLabel(undefined, 4, 10, fallback)).toBe("第4页，共10页");
  });
});
