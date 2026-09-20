import { describe, expect, it } from "vitest";

import {
  PX_PER_CM,
  PX_PER_MM,
  PX_PER_PT,
  mmToPx,
  pxToMm,
  resolveCssLength,
  resolveCssLengthOr
} from "../../src/extensions/page/utils/length";

/**
 * Defect 12: the legacy measurer ended in `parseFloat(value)`, so `"2em"` was read as
 * `2` px — a first-line indent of `2em` (30px at a 15px body) displaced every measured
 * wrap point. These tests pin every unit down.
 */
describe("resolveCssLength", () => {
  it("resolves absolute units", () => {
    expect(resolveCssLength("3px")).toBe(3);
    expect(resolveCssLength("12pt")).toBeCloseTo(12 * PX_PER_PT, 6);
    expect(resolveCssLength("20mm")).toBeCloseTo(20 * PX_PER_MM, 6);
    expect(resolveCssLength("1cm")).toBeCloseTo(PX_PER_CM, 6);
    expect(resolveCssLength("1in")).toBe(96);
    expect(resolveCssLength("1pc")).toBe(16);
  });

  it("resolves relative units against the supplied context", () => {
    // The legacy bug: this used to return 2.
    expect(resolveCssLength("2em", { fontSize: 13 })).toBe(26);
    expect(resolveCssLength("1.5rem", { rootFontSize: 20 })).toBe(30);
    expect(resolveCssLength("10%", { percentBase: 200 })).toBe(20);
    expect(resolveCssLength("2em")).toBe(32);
  });

  it("treats a unitless value as pixels and keeps the sign", () => {
    expect(resolveCssLength("0")).toBe(0);
    expect(resolveCssLength("2.5")).toBe(2.5);
    expect(resolveCssLength("-4px")).toBe(-4);
    expect(resolveCssLength(7)).toBe(7);
  });

  it("reports keywords and unknown units instead of guessing", () => {
    for (const value of ["auto", "normal", "", "  ", "calc(1px + 2px)", "10vh", null, undefined]) {
      expect(Number.isNaN(resolveCssLength(value)), `expected NaN for ${String(value)}`).toBe(true);
    }
  });

  it("falls back only when asked to", () => {
    expect(resolveCssLengthOr("2em", 5, { fontSize: 10 })).toBe(20);
    expect(resolveCssLengthOr("auto", 5)).toBe(5);
  });

  it("round-trips millimetres", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 6);
    expect(pxToMm(96)).toBeCloseTo(25.4, 6);
  });
});
