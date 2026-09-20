/**
 * Display formatting.
 *
 * The Chinese uppercase money rendering is the reason this file exists: it is the one
 * piece of formatting with enough edge cases to be wrong in a way nobody notices until
 * a contract is printed. Every case the brief lists is here, plus the ones the
 * implementation's zero-collapsing rule makes easy to get wrong.
 */

import { describe, expect, it } from "vitest";

import {
  applyDatePattern,
  dateTokens,
  DEFAULT_DATE_FORMAT,
  formatMoney,
  formatNumber,
  pad2,
  renderChineseMoney
} from "../../src/extensions/variable/format";

/** The whole-number cases, each with the reading a Chinese contract requires. */
const uppercaseCases: Array<[number, string]> = [
  [0, "零元整"],
  [10, "壹拾元整"],
  [100, "壹佰元整"],
  [1000, "壹仟元整"],
  [10000, "壹万元整"],
  [100000000, "壹亿元整"],
  [1000000000, "壹拾亿元整"],
  [100.05, "壹佰元零伍分"],
  [20000000.06, "贰仟万元零陆分"],
  [1000001, "壹佰万零壹元整"]
];

describe("renderChineseMoney", () => {
  it("renders every required case", () => {
    for (const [value, expected] of uppercaseCases) {
      expect(renderChineseMoney(value), String(value)).toBe(expected);
    }
  });

  it("collapses a run of zeros inside a group to one 零", () => {
    expect(renderChineseMoney(1001)).toBe("壹仟零壹元整");
    expect(renderChineseMoney(1000001)).toBe("壹佰万零壹元整");
    expect(renderChineseMoney(10000001)).toBe("壹仟万零壹元整");
  });

  it("does not append a stray 零 after a trailing empty group", () => {
    // 壹佰万, not 壹佰万零.
    expect(renderChineseMoney(1000000)).toBe("壹佰万元整");
  });

  it("keeps the 拾 of a round ten or hundred", () => {
    // 壹拾元 is the financial form; 拾元 would read as an unsigned placeholder.
    expect(renderChineseMoney(10)).toBe("壹拾元整");
    expect(renderChineseMoney(20)).toBe("贰拾元整");
    expect(renderChineseMoney(110)).toBe("壹佰壹拾元整");
  });

  it("renders a full fraction", () => {
    expect(renderChineseMoney(123.45)).toBe("壹佰贰拾叁元肆角伍分");
  });

  it("renders 角 without 分", () => {
    expect(renderChineseMoney(1.5)).toBe("壹元伍角");
  });

  it("introduces 分 with 零 when there is no 角", () => {
    expect(renderChineseMoney(1.05)).toBe("壹元零伍分");
    expect(renderChineseMoney(0.05)).toBe("零伍分");
  });

  it("renders a fraction with no whole part", () => {
    expect(renderChineseMoney(0.5)).toBe("伍角");
  });

  it("uses 整 for a whole amount", () => {
    expect(renderChineseMoney(123)).toBe("壹佰贰拾叁元整");
  });

  it("uses the financial digits rather than the everyday ones", () => {
    // 一 and 二 are trivially altered on paper; 壹 and 贰 are not.
    const rendered = renderChineseMoney(123456789.12);
    expect(rendered).not.toMatch(/[一二三四五六七八九]/);
    expect(rendered).toContain("壹");
    expect(rendered).toContain("贰");
  });

  it("rounds to the nearest 分 rather than truncating", () => {
    expect(renderChineseMoney(1.005)).toBe("壹元零壹分");
  });

  it("ignores the sign, which the caller renders separately", () => {
    expect(renderChineseMoney(-123.45)).toBe(renderChineseMoney(123.45));
  });

  it("returns an empty string for a value that is not a finite number", () => {
    expect(renderChineseMoney(Number.NaN)).toBe("");
    expect(renderChineseMoney(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("handles 亿 and 万 together", () => {
    expect(renderChineseMoney(123456789)).toBe("壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元整");
  });
});

describe("formatNumber", () => {
  it("renders as supplied when no precision is given", () => {
    expect(formatNumber(3.5)).toBe("3.5");
    expect(formatNumber(3)).toBe("3");
    expect(formatNumber(3.5, undefined, false)).toBe("3.5");
  });

  it("applies a fixed precision, trailing zeros included", () => {
    expect(formatNumber(3.5, 2)).toBe("3.50");
    expect(formatNumber(3.567, 2)).toBe("3.57");
    expect(formatNumber(3.4, 0)).toBe("3");
  });

  it("groups thousands only when asked", () => {
    expect(formatNumber(1234567.891, 2, true)).toBe("1,234,567.89");
    expect(formatNumber(1234567.891, 2, false)).toBe("1234567.89");
    expect(formatNumber(1234567)).toBe("1234567");
  });

  it("renders a negative value with its sign", () => {
    expect(formatNumber(-1234.5, 1, true)).toBe("-1,234.5");
  });

  it("returns an empty string for a non-finite value", () => {
    expect(formatNumber(Number.NaN)).toBe("");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("formatMoney", () => {
  it("defaults to two decimals and grouping", () => {
    expect(formatMoney(12345.6, { type: "money" })).toBe("12,345.60");
  });

  it("honours an explicit precision and disabled grouping", () => {
    expect(formatMoney(12345.6, { type: "money", precision: 0, thousands: false })).toBe("12346");
    expect(formatMoney(12345.6, { type: "money", precision: 3 })).toBe("12,345.600");
  });
});

describe("applyDatePattern", () => {
  const now = new Date(2024, 4, 6, 8, 9, 10); // 2024-05-06 08:09:10 local

  it("substitutes every token, zero-padded", () => {
    expect(applyDatePattern("YYYY-MM-DD HH:mm:ss", dateTokens(now))).toBe("2024-05-06 08:09:10");
  });

  it("uses the default Chinese pattern", () => {
    expect(applyDatePattern(DEFAULT_DATE_FORMAT, dateTokens(now))).toBe("2024年05月06日");
  });

  it("does not confuse MM with mm", () => {
    // The overlapping two-digit tokens are why the scanner matches longest-first
    // instead of running a chain of `replace` calls.
    expect(applyDatePattern("MM mm", dateTokens(now))).toBe("05 09");
  });

  it("never reads YYYY as YY plus a stray Y", () => {
    expect(applyDatePattern("YYYY", dateTokens(new Date(2024, 0, 1)))).toBe("2024");
  });

  it("leaves text that looks like a token but is not one alone", () => {
    expect(applyDatePattern("YY", dateTokens(now))).toBe("YY");
    expect(applyDatePattern("Y", dateTokens(now))).toBe("Y");
    expect(applyDatePattern("M", dateTokens(now))).toBe("M");
    expect(applyDatePattern("HHH", dateTokens(now))).toBe("08H");
  });

  it("keeps literal text around the tokens", () => {
    expect(applyDatePattern("签订于 YYYY 年", dateTokens(now))).toBe("签订于 2024 年");
    expect(applyDatePattern("YYYY年MM月DD日", dateTokens(now))).toBe("2024年05月06日");
  });

  it("passes an empty pattern through", () => {
    expect(applyDatePattern("", dateTokens(now))).toBe("");
  });

  it("substitutes a repeated token every time", () => {
    expect(applyDatePattern("YYYY/YYYY", dateTokens(now))).toBe("2024/2024");
  });

  it("does not re-scan substituted output", () => {
    // A pattern that renders to something containing "YYYY" must not be rewritten
    // again; the scanner advances past what it produced.
    expect(applyDatePattern("YYYY", [{ token: "YYYY", value: "YYYY" }])).toBe("YYYY");
  });
});

describe("pad2", () => {
  it("pads a single digit and leaves two alone", () => {
    expect(pad2(0)).toBe("00");
    expect(pad2(9)).toBe("09");
    expect(pad2(10)).toBe("10");
  });
});

describe("dateTokens", () => {
  it("reads local time, not UTC", () => {
    // A contract is signed at a wall-clock time, not at UTC midnight.
    const tokens = dateTokens(new Date(2024, 11, 31, 23, 58, 59));
    expect(Object.fromEntries(tokens.map(({ token, value }) => [token, value]))).toEqual({
      YYYY: "2024",
      MM: "12",
      DD: "31",
      HH: "23",
      mm: "58",
      ss: "59"
    });
  });
});
