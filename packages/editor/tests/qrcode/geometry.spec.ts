/**
 * The QR code's geometry and serialisation.
 *
 * Legacy defect 34: the raster was always 200 px, whatever size was asked for, so a code
 * enlarged for print was printed from a source too small for the paper. The first half of this
 * file pins the resolution derivation; the second half pins the attribute serialisation and
 * the "does this change the pixels?" decision that keeps a move from costing a canvas.
 */

import { describe, expect, it } from "vitest";

import {
  decodeQRCodeConfig,
  encodeQRCodeConfig,
  isQRUnit,
  lengthToCss,
  normalizeAttrs,
  normalizeColor,
  normalizeConfig,
  normalizeLength,
  normalizeMargin,
  normalizePage,
  normalizePosition,
  QR_CODE_Z_INDEX,
  QR_DEFAULT_COLOR,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_PAGE,
  QR_DEFAULT_POSITION,
  QR_DEFAULT_SIZE,
  QR_MAX_RASTER_PIXELS,
  QR_MIN_RASTER_PIXELS,
  QR_PRINT_DPI,
  qrCodeStyle,
  rasterInputsChanged,
  resolvePageIndex,
  sameQRCodeAttrs,
  sameLength,
  styleString,
  toCssPixels,
  toRasterPixels
} from "../../src/extensions/qrcode/geometry";
import type { QRCodeAttrs } from "../../src/extensions/qrcode/typing";
import { WATERMARK_Z_INDEX } from "../../src/extensions/watermark/typing";

describe("units", () => {
  it("knows exactly the three units the model allows", () => {
    expect(isQRUnit("mm")).toBe(true);
    expect(isQRUnit("px")).toBe(true);
    expect(isQRUnit("cm")).toBe(true);
    expect(isQRUnit("pt")).toBe(false);
    expect(isQRUnit(30)).toBe(false);
  });

  it("converts physical units through the CSS definition of the inch", () => {
    expect(toCssPixels({ value: 25.4, unit: "mm" })).toBe(96);
    expect(toCssPixels({ value: 1, unit: "cm" })).toBeCloseTo(37.795, 3);
    expect(toCssPixels({ value: 200, unit: "px" })).toBe(200);
  });

  it("writes a length the way CSS wants it", () => {
    expect(lengthToCss({ value: 30, unit: "mm" })).toBe("30mm");
    expect(lengthToCss({ value: 1.5, unit: "cm" })).toBe("1.5cm");
  });
});

describe("raster resolution", () => {
  it("derives the raster from the requested size at the print resolution", () => {
    // 30 mm at 300 dpi ≈ 354 px — not the legacy 200.
    expect(toRasterPixels({ value: 30, unit: "mm" })).toBe(354);
    // 200 CSS px are 200/96 in, so 625 px at 300 dpi.
    expect(toRasterPixels({ value: 200, unit: "px" })).toBe(625);
    expect(toRasterPixels({ value: 25.4, unit: "mm" })).toBe(300);
  });

  it("is strictly monotonic, which is the whole point of the fix", () => {
    const small = toRasterPixels({ value: 20, unit: "mm" });
    const medium = toRasterPixels({ value: 40, unit: "mm" });
    const large = toRasterPixels({ value: 80, unit: "mm" });
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });

  it("floors a tiny code so it stays scannable", () => {
    expect(toRasterPixels({ value: 0, unit: "mm" })).toBe(QR_MIN_RASTER_PIXELS);
    expect(toRasterPixels({ value: 1, unit: "mm" })).toBe(QR_MIN_RASTER_PIXELS);
  });

  it("caps a huge code so it cannot produce a multi-megabyte data URL", () => {
    expect(toRasterPixels({ value: 1000, unit: "mm" })).toBe(QR_MAX_RASTER_PIXELS);
  });

  it("always returns a whole number of pixels", () => {
    expect(Number.isInteger(toRasterPixels({ value: 37.5, unit: "mm" }))).toBe(true);
  });

  it("falls back to the documented DPI for a nonsense resolution", () => {
    expect(toRasterPixels({ value: 25.4, unit: "mm" }, Number.NaN)).toBe(
      toRasterPixels({ value: 25.4, unit: "mm" }, QR_PRINT_DPI)
    );
    expect(toRasterPixels({ value: 25.4, unit: "mm" }, 0)).toBe(300);
  });
});

describe("attribute normalisation", () => {
  it("keeps a good length", () => {
    expect(normalizeLength({ value: 30, unit: "mm" })).toStrictEqual({ value: 30, unit: "mm" });
  });

  it("clamps a negative offset instead of resetting it to the default", () => {
    // `moveQRCode(-100, 0)` legitimately means "as far left as possible"; resetting to 10mm
    // would look as if the move had been ignored.
    expect(normalizeLength({ value: -5, unit: "mm" })).toStrictEqual({ value: 0, unit: "mm" });
    expect(normalizePosition({ x: -3, y: 4, unit: "cm" })).toStrictEqual({ x: 0, y: 4, unit: "cm" });
  });

  it("falls back for anything that cannot be read as the value it claims to be", () => {
    expect(normalizeLength("30mm")).toStrictEqual(QR_DEFAULT_SIZE);
    expect(normalizeLength({ value: 30, unit: "pt" })).toStrictEqual(QR_DEFAULT_SIZE);
    expect(normalizeLength({ value: Number.POSITIVE_INFINITY, unit: "mm" })).toStrictEqual(
      QR_DEFAULT_SIZE
    );
    expect(normalizePosition(undefined)).toStrictEqual(QR_DEFAULT_POSITION);
    expect(normalizeLength(null)).toStrictEqual(QR_DEFAULT_SIZE);
  });

  it("rejects a colour pair with an empty member", () => {
    expect(normalizeColor({ dark: "", light: "#fff" })).toStrictEqual(QR_DEFAULT_COLOR);
    expect(normalizeColor({ dark: "#123", light: "" })).toStrictEqual(QR_DEFAULT_COLOR);
  });

  it("treats the quiet zone as a whole number of modules", () => {
    expect(normalizeMargin(2.6)).toBe(3);
    expect(normalizeMargin(-4)).toBe(0);
    expect(normalizeMargin("2")).toBe(QR_DEFAULT_MARGIN);
    expect(normalizeMargin(undefined)).toBe(QR_DEFAULT_MARGIN);
  });

  it("normalises a whole configuration at once", () => {
    expect(normalizeConfig(undefined)).toStrictEqual({
      size: QR_DEFAULT_SIZE,
      position: QR_DEFAULT_POSITION,
      color: QR_DEFAULT_COLOR,
      margin: QR_DEFAULT_MARGIN,
      page: QR_DEFAULT_PAGE
    });
  });

  it("reads a page anchor as a keyword, a page number, or nothing", () => {
    expect(normalizePage("first")).toBe("first");
    expect(normalizePage("last")).toBe("last");
    expect(normalizePage(3)).toBe(3);
    // Page 0 and page 0.5 do not exist; clamping keeps the select and the move in agreement.
    expect(normalizePage(2.7)).toBe(2);
    expect(normalizePage(0)).toBe(1);
    // Anything else — including the default itself — means "never specified".
    expect(normalizePage(null)).toBeNull();
    expect(normalizePage(undefined)).toBeNull();
    expect(normalizePage("third")).toBeNull();
    expect(normalizePage(Number.NaN)).toBeNull();
  });

  it("resolves a relative anchor against the page count", () => {
    expect(resolvePageIndex("first", 4)).toBe(1);
    expect(resolvePageIndex("last", 4)).toBe(4);
    // A one-page document has no other answer, and no pages at all is treated as one page.
    expect(resolvePageIndex("last", 1)).toBe(1);
    expect(resolvePageIndex("last", 0)).toBe(1);
    // An absolute page is clamped into the document.
    expect(resolvePageIndex(3, 4)).toBe(3);
    expect(resolvePageIndex(9, 4)).toBe(4);
    expect(resolvePageIndex(0, 4)).toBe(1);
    // Unspecified: the first page is the only answer available without the document.
    expect(resolvePageIndex(null, 4)).toBe(1);
  });

  it("gives an absent label the accessible default rather than an empty `alt`", () => {
    // An empty `alt` says "decorative", and a QR code is never decorative.
    expect(normalizeAttrs({ alt: "" }).alt).toBe("二维码");
    expect(normalizeAttrs({}).src).toBe("");
    expect(normalizeAttrs(undefined).text).toBe("");
  });
});

describe("the JSON encoding", () => {
  const attrs = normalizeAttrs({
    size: { value: 42, unit: "mm" },
    position: { x: 15, y: 25, unit: "mm" },
    color: { dark: "#112233", light: "#fefefe" },
    margin: 2
  });

  it("round-trips the four structured attributes", () => {
    expect(decodeQRCodeConfig(encodeQRCodeConfig(attrs))).toStrictEqual({
      size: attrs.size,
      position: attrs.position,
      color: attrs.color,
      margin: attrs.margin
    });
  });

  it("returns nothing for a missing or malformed blob", () => {
    expect(decodeQRCodeConfig(null)).toStrictEqual({});
    expect(decodeQRCodeConfig("")).toStrictEqual({});
    expect(decodeQRCodeConfig("{")).toStrictEqual({});
    expect(decodeQRCodeConfig('"a string"')).toStrictEqual({});
    expect(decodeQRCodeConfig("42")).toStrictEqual({});
  });

  it("drops only the fields that are invalid", () => {
    const decoded = decodeQRCodeConfig(
      JSON.stringify({
        size: { value: 30, unit: "furlong" },
        position: { x: 1, y: 2, unit: "px" },
        color: "red",
        margin: "2"
      })
    );

    expect(decoded.size).toBeUndefined();
    expect(decoded.color).toBeUndefined();
    expect(decoded.margin).toBeUndefined();
    expect(decoded.position).toStrictEqual({ x: 1, y: 2, unit: "px" });
  });
});

describe("the inline styles", () => {
  it("positions and sizes the code from the attributes", () => {
    const style = qrCodeStyle(
      normalizeAttrs({
        size: { value: 42, unit: "mm" },
        position: { x: 15, y: 25, unit: "mm" }
      })
    );

    expect(style.position).toBe("absolute");
    expect(style.left).toBe("15mm");
    expect(style.top).toBe("25mm");
    expect(style.width).toBe("42mm");
    expect(style.height).toBe("42mm");
    expect(style.overflow).toBe("visible");
  });

  it("keeps the code below the watermark", () => {
    const style = qrCodeStyle(normalizeAttrs({}));
    expect(style["z-index"]).toBe(String(QR_CODE_Z_INDEX));
    // The pair is asserted here so the two constants cannot drift apart silently.
    expect(QR_CODE_Z_INDEX).toBeLessThan(WATERMARK_Z_INDEX);
  });

  it("joins a declaration map into a style attribute", () => {
    expect(styleString({ position: "absolute", left: "1mm" })).toBe("position: absolute; left: 1mm");
    expect(styleString({})).toBe("");
  });
});

describe("change detection", () => {
  const base: QRCodeAttrs = normalizeAttrs({ text: "https://a.example", src: "data:image/png;base64,A" });

  it("sees a move as a change of attributes but not of the raster", () => {
    const moved = normalizeAttrs({ ...base, position: { ...base.position, x: base.position.x + 5 } });
    expect(sameQRCodeAttrs(base, moved)).toBe(false);
    // A move must never cost a canvas — this is what makes `moveQRCode` synchronous.
    expect(rasterInputsChanged(base, moved)).toBe(false);
  });

  it("sees an identical attribute set", () => {
    expect(sameQRCodeAttrs(base, normalizeAttrs({ ...base }))).toBe(true);
    expect(rasterInputsChanged(base, normalizeAttrs({ ...base }))).toBe(false);
  });

  it("regenerates for the payload, the size, the quiet zone and both colours", () => {
    expect(rasterInputsChanged(base, normalizeAttrs({ ...base, text: "https://b.example" }))).toBe(true);
    expect(
      rasterInputsChanged(base, normalizeAttrs({ ...base, size: { value: 60, unit: "mm" } }))
    ).toBe(true);
    expect(rasterInputsChanged(base, normalizeAttrs({ ...base, margin: 0 }))).toBe(true);
    expect(
      rasterInputsChanged(base, normalizeAttrs({ ...base, color: { dark: "#000", light: "#eee" } }))
    ).toBe(true);
  });

  it("does not regenerate for a label, which is not part of the bitmap", () => {
    const relabelled = normalizeAttrs({ ...base, alt: "另一个标签" });
    expect(sameQRCodeAttrs(base, relabelled)).toBe(false);
    expect(rasterInputsChanged(base, relabelled)).toBe(false);
  });

  it("compares lengths by value and unit together", () => {
    expect(sameLength({ value: 30, unit: "mm" }, { value: 30, unit: "mm" })).toBe(true);
    expect(sameLength({ value: 30, unit: "mm" }, { value: 30, unit: "px" })).toBe(false);
  });
});
