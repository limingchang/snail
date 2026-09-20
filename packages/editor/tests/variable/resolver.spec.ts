/**
 * The pure resolution engine.
 *
 * These tests are the contract the fill dialog and the node view both depend on:
 * "what does this variable paint, and is the fill data usable?" — answered without an
 * editor, a DOM or a framework. The two behaviours worth calling out are that nothing
 * throws (a corrupt template must still open) and that a cycle is *reported*, not
 * followed.
 */

import { describe, expect, it } from "vitest";

import type { SystemContext } from "../../src/extensions/variable/resolver";
import {
  DEFAULT_VARIABLE_LOCALE,
  flattenInnerVariables,
  formulaDependencies,
  resolveDocumentVariables,
  resolveVariable,
  validateFill
} from "../../src/extensions/variable/resolver";
import type {
  ResolvedVariable,
  VariableAttrs,
  VariableData,
  VariableFillData,
  VariableIssue,
  VariableValue
} from "../../src/typings/variable";

/** A fixed "now", so a date assertion cannot depend on when the suite runs. */
const NOW = new Date(2024, 4, 6, 8, 9, 10); // 2024-05-06 08:09:10 local time

const system = (overrides: Partial<SystemContext> = {}): SystemContext => ({
  page: 2,
  total: 7,
  now: NOW,
  ...overrides
});

/** Build attributes with only the fields a test cares about. */
function attrs(partial: Partial<VariableAttrs> & { data: VariableData }): VariableAttrs {
  return { label: "变量", key: "k", ...partial };
}

/** Resolve one variable with no fill data. */
function resolve(variable: VariableAttrs, fill: Record<string, VariableValue> = {}, overrides: Partial<SystemContext> = {}): ResolvedVariable {
  return resolveVariable(variable, fill, system(overrides));
}

describe("value precedence", () => {
  it("prefers the fill value over the default", () => {
    const variable = attrs({ label: "名称", key: "name", defaultValue: "默认", data: { type: "text" } });
    expect(resolve(variable, { name: "实际" })).toMatchObject({ value: "实际", display: "实际" });
  });

  it("falls back to the default when the fill data has no entry", () => {
    const variable = attrs({ label: "名称", key: "name", defaultValue: "默认", data: { type: "text" } });
    expect(resolve(variable)).toMatchObject({ value: "默认", display: "默认" });
  });

  it("falls back to a type-appropriate empty when there is no default", () => {
    expect(resolve(attrs({ key: "t", data: { type: "text" } })).display).toBe("");
    expect(resolve(attrs({ key: "n", data: { type: "number" } })).value).toBe(0);
    expect(resolve(attrs({ key: "m", data: { type: "money" } })).display).toBe("0.00");
    expect(resolve(attrs({ key: "b", data: { type: "boolean" } })).display).toBe("否");
  });

  it("distinguishes an empty string from a missing value", () => {
    // `""` is a value the user typed, so it must not be replaced by the default.
    const variable = attrs({ key: "name", defaultValue: "默认", data: { type: "text" } });
    expect(resolve(variable, { name: "" }).display).toBe("");
  });

  it("ignores an unrelated key in the fill data", () => {
    const variable = attrs({ key: "name", data: { type: "text" } });
    expect(resolve(variable, { other: "x" }).display).toBe("");
  });

  it("looks a dotted key up literally, without walking a path", () => {
    const variable = attrs({ key: "company.name", defaultValue: "甲方", data: { type: "text" } });
    expect(resolve(variable, { "company.name": "某某公司" }).display).toBe("某某公司");
  });
});

describe("text", () => {
  it("renders the value as-is", () => {
    expect(resolve(attrs({ key: "t", data: { type: "text" } }), { t: "合同" }).display).toBe("合同");
  });

  it("renders a number value without inventing formatting", () => {
    expect(resolve(attrs({ key: "t", data: { type: "text" } }), { t: 42 }).display).toBe("42");
  });

  it("truncates at maxLength, with the ellipsis inside the limit", () => {
    const variable = attrs({ key: "t", data: { type: "text", maxLength: 5 } });
    const display = resolve(variable, { t: "一二三四五六七八九十" }).display;
    // The ellipsis replaces the last character rather than extending the string, so
    // `maxLength` stays a hard bound on what the document paints.
    expect(display).toBe("一二三四…");
    expect(display.length).toBe(5);
  });

  it("leaves text exactly at the limit alone", () => {
    const variable = attrs({ key: "t", data: { type: "text", maxLength: 5 } });
    expect(resolve(variable, { t: "一二三四五" }).display).toBe("一二三四五");
  });
});

describe("number", () => {
  it("renders as supplied when no precision is configured", () => {
    // The point of `undefined` precision: a value typed as 3.50 must not become 3.5,
    // and one typed as 3 must not gain decimals.
    expect(resolve(attrs({ key: "n", data: { type: "number" } }), { n: 3.5 }).display).toBe("3.5");
    expect(resolve(attrs({ key: "n", data: { type: "number" } }), { n: 3 }).display).toBe("3");
  });

  it("applies a configured precision, trailing zeros included", () => {
    expect(resolve(attrs({ key: "n", data: { type: "number", precision: 2 } }), { n: 3.5 }).display).toBe("3.50");
    expect(resolve(attrs({ key: "n", data: { type: "number", precision: 0 } }), { n: 3.6 }).display).toBe("4");
  });

  it("groups thousands only when asked", () => {
    expect(resolve(attrs({ key: "n", data: { type: "number", thousands: true } }), { n: 1234567 }).display).toBe("1,234,567");
    expect(resolve(attrs({ key: "n", data: { type: "number" } }), { n: 1234567 }).display).toBe("1234567");
  });

  it("reads a numeric string", () => {
    expect(resolve(attrs({ key: "n", data: { type: "number", precision: 1 } }), { n: "12.34" }).display).toBe("12.3");
  });
});

describe("money", () => {
  it("defaults to two decimals and thousands grouping", () => {
    const variable = attrs({ key: "m", data: { type: "money" } });
    expect(resolve(variable, { m: 12345.6 }).display).toBe("12,345.60");
  });

  it("accepts a currency prefix", () => {
    const variable = attrs({ key: "m", data: { type: "money", currency: "￥" } });
    expect(resolve(variable, { m: 120.5 }).display).toBe("￥120.50");
  });

  it("honours an explicit precision and disabled grouping", () => {
    const variable = attrs({ key: "m", data: { type: "money", precision: 0, thousands: false } });
    expect(resolve(variable, { m: 12345.6 }).display).toBe("12346");
  });

  it("renders the Chinese financial uppercase when asked", () => {
    const variable = attrs({ key: "m", data: { type: "money", chineseUppercase: true } });
    expect(resolve(variable, { m: 123.45 }).display).toBe("壹佰贰拾叁元肆角伍分");
  });

  it("prefixes the uppercase with the currency too", () => {
    const variable = attrs({ key: "m", data: { type: "money", chineseUppercase: true, currency: "人民币" } });
    expect(resolve(variable, { m: 123.45 }).display).toBe("人民币壹佰贰拾叁元肆角伍分");
  });

  it("rounds before converting, so the words and the digits agree", () => {
    const variable = attrs({ key: "m", data: { type: "money", chineseUppercase: true, precision: 2 } });
    // 0.005 rounds up to 0.01, so the 大写 reads 零壹分 rather than the 零元整 a
    // conversion-before-rounding would have produced.
    expect(resolve(variable, { m: 0.005 }).display).toBe("零壹分");
  });

  it("keeps the digits and the uppercase in step for a fractional amount", () => {
    // Two renderings of the same value: `precision` has to apply to both, or the words
    // would describe a different figure from the digits beside them.
    const digits = attrs({ key: "m", data: { type: "money", precision: 2, currency: "￥" } });
    const words = attrs({ key: "m", data: { type: "money", precision: 2, chineseUppercase: true } });
    expect(resolve(digits, { m: 1.005 }).display).toBe("￥1.01");
    expect(resolve(words, { m: 1.005 }).display).toBe("壹元零壹分");
  });
});

describe("boolean", () => {
  it("uses 是 and 否 by default — what the legacy parser stored but never used", () => {
    const variable = attrs({ key: "b", data: { type: "boolean" } });
    expect(resolve(variable, { b: true }).display).toBe("是");
    expect(resolve(variable, { b: false }).display).toBe("否");
  });

  it("uses the configured words", () => {
    const variable = attrs({ key: "b", data: { type: "boolean", trueText: "同意", falseText: "不同意" } });
    expect(resolve(variable, { b: true }).display).toBe("同意");
    expect(resolve(variable, { b: 0 }).display).toBe("不同意");
  });

  it("reads a string form control value", () => {
    const variable = attrs({ key: "b", data: { type: "boolean" } });
    expect(resolve(variable, { b: "true" }).display).toBe("是");
    expect(resolve(variable, { b: "false" }).display).toBe("否");
  });
});

describe("date", () => {
  it("uses the default pattern", () => {
    const variable = attrs({ key: "d", data: { type: "date" } });
    expect(resolve(variable, { d: "2024-05-06" }).display).toBe("2024年05月06日");
  });

  it("substitutes a custom pattern, including the time tokens", () => {
    const variable = attrs({ key: "d", data: { type: "date", format: "YYYY-MM-DD HH:mm:ss" } });
    expect(resolve(variable, { d: "2024-05-06T08:09:10" }).display).toBe("2024-05-06 08:09:10");
  });

  it("treats the literal \"today\" as the injected clock when resolveToday is on", () => {
    const variable = attrs({ key: "d", data: { type: "date", resolveToday: true } });
    // Nothing captured "today" at design time: the year comes from `system.now`, so a
    // template authored in 2024 prints the year it is filled in.
    expect(resolve(variable, { d: "today" }).display).toBe("2024年05月06日");
  });

  it("leaves the literal alone when resolveToday is off", () => {
    const variable = attrs({ key: "d", data: { type: "date" } });
    expect(resolve(variable, { d: "today" }).display).toBe("today");
  });

  it("prints a value that is not a date as its own text", () => {
    // 「长期」 is a normal contract term; guessing at it would be worse than printing it.
    const variable = attrs({ key: "d", data: { type: "date" } });
    expect(resolve(variable, { d: "长期" }).display).toBe("长期");
  });

  it("accepts a timestamp number", () => {
    const variable = attrs({ key: "d", data: { type: "date" } });
    expect(resolve(variable, { d: NOW.getTime() }).display).toBe("2024年05月06日");
  });
});

describe("select", () => {
  const options = [
    { label: "固定期限", value: "fixed" },
    { label: "无固定期限", value: "open" },
    { label: "以完成一定工作为期限", value: 3 }
  ];

  it("maps a value to its label", () => {
    const variable = attrs({ key: "s", data: { type: "select", options } });
    expect(resolve(variable, { s: "open" }).display).toBe("无固定期限");
  });

  it("matches a numeric option through its stored string form", () => {
    const variable = attrs({ key: "s", data: { type: "select", options } });
    expect(resolve(variable, { s: "3" }).display).toBe("以完成一定工作为期限");
  });

  it("prints an unmatched value rather than dropping it", () => {
    const variable = attrs({ key: "s", data: { type: "select", options } });
    expect(resolve(variable, { s: "removed" }).display).toBe("removed");
  });

  it("joins multiple labels with the configured separator", () => {
    const variable = attrs({ key: "s", data: { type: "select", options, multiple: true, joinWith: "/" } });
    // The model's `VariableValue` is scalar on purpose, but a multiple-select control
    // sends its selection back as an array — the resolver reads that shape defensively,
    // so the test has to hand it one.
    const fill = { s: ["fixed", "open"] } as unknown as VariableFillData;
    expect(resolve(variable, fill).display).toBe("固定期限/无固定期限");
  });

  it("uses 、 by default when joining", () => {
    const variable = attrs({ key: "s", data: { type: "select", options, multiple: true } });
    const fill = { s: ["fixed", "open"] } as unknown as VariableFillData;
    expect(resolve(variable, fill).display).toBe("固定期限、无固定期限");
  });

  it("renders nothing for an empty list", () => {
    const variable = attrs({ key: "s", data: { type: "select", options } });
    expect(resolve(variable).display).toBe("");
  });
});

describe("image", () => {
  it("uses the source as the display, and the width is configuration not text", () => {
    const variable = attrs({ key: "img", data: { type: "image", width: "40mm" } });
    const resolved = resolve(variable, { img: "data:image/png;base64,AAAA" });
    expect(resolved.display).toBe("data:image/png;base64,AAAA");
    // The width never leaks into the painted text; the node view reads it from `data`.
    expect(resolved.display).not.toContain("40mm");
  });

  it("renders nothing when there is no source", () => {
    const variable = attrs({ key: "img", data: { type: "image" } });
    expect(resolve(variable).display).toBe("");
  });
});

describe("formula", () => {
  it("computes from other variables' fill values", () => {
    const variable = attrs({
      key: "total",
      data: { type: "formula", expression: "SUM(item1.price, item2.price) * 1.06", precision: 2 }
    });
    const resolved = resolve(variable, { "item1.price": 100, "item2.price": 200 });
    expect(resolved.value).toBeCloseTo(318, 10);
    // `precision: 2` is authoritative, trailing zeros included — the author asked for a
    // money-like figure, and 318 and 318.00 are different contract amounts to a reader.
    expect(resolved.display).toBe("318.00");
  });

  it("renders the result as supplied when no precision is configured", () => {
    const variable = attrs({ key: "total", data: { type: "formula", expression: "1 + 1" } });
    expect(resolve(variable).display).toBe("2");
  });

  it("falls back to a variable's default when the fill data has no entry", () => {
    const price = attrs({ key: "price", defaultValue: 50, data: { type: "number" } });
    const total = attrs({ key: "total", data: { type: "formula", expression: "price * 2" } });
    const resolved = resolveDocumentVariables(
      [
        { pos: 0, attrs: price },
        { pos: 3, attrs: total }
      ],
      {},
      system()
    );
    expect(resolved[1]?.display).toBe("100");
  });

  it("applies precision, prefix and suffix", () => {
    const variable = attrs({
      key: "total",
      data: { type: "formula", expression: "a / 3", precision: 2, prefix: "￥", suffix: " 元" }
    });
    expect(resolve(variable, { a: 10 }).display).toBe("￥3.33 元");
  });

  it("resolves a formula that references another formula", () => {
    const sub1 = attrs({ key: "sub1", data: { type: "formula", expression: "1 + 1" } });
    const sub2 = attrs({ key: "sub2", data: { type: "formula", expression: "2 + 2" } });
    const total = attrs({ key: "total", data: { type: "formula", expression: "SUM(sub1, sub2)" } });

    const resolved = resolveDocumentVariables(
      [
        { pos: 0, attrs: sub1 },
        { pos: 2, attrs: sub2 },
        { pos: 4, attrs: total }
      ],
      {},
      system()
    );

    expect(resolved.map((item) => item.display)).toEqual(["2", "4", "6"]);
  });

  it("resolves a formula referencing a formula handed in through the system context", () => {
    // This is the single-variable entry point: it cannot see the document, so the caller
    // supplies the already-resolved siblings. Without them, the referenced key would fall
    // back to the fill data — where a formula's own key is deliberately absent — and the
    // formula would report an unresolvable operand.
    const total = attrs({ key: "total", data: { type: "formula", expression: "sub + 1" } });
    const variables = new Map<string, ResolvedVariable>([
      ["sub", { key: "sub", value: 9, display: "9", type: "formula" }]
    ]);

    expect(resolveVariable(total, {}, system({ variables })).display).toBe("10");
    expect(resolveVariable(total, {}, system()).display).toBe("0");
  });

  it("reports a syntax error as an issue instead of throwing", () => {
    const errors: VariableIssue[] = [];
    const variable = attrs({ key: "bad", data: { type: "formula", expression: "1 +" } });

    expect(() => resolve(variable, {}, { errors })).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: "bad", severity: "error" });
    expect(errors[0]?.message).toContain(DEFAULT_VARIABLE_LOCALE.formulaSyntax);
  });

  it("reports a cycle as an issue instead of recursing forever", () => {
    const self = attrs({ key: "a", data: { type: "formula", expression: "a + 1" } });
    const errors: VariableIssue[] = [];

    const resolved = resolveDocumentVariables([{ pos: 0, attrs: self }], {}, system({ errors }));

    expect(resolved[0]?.value).toBe(0);
    expect(errors.some((issue) => issue.message.includes(DEFAULT_VARIABLE_LOCALE.formulaCycle))).toBe(true);
  });

  it("reports a two-formula cycle once, and resolves neither to a partial figure", () => {
    const a = attrs({ key: "a", data: { type: "formula", expression: "b + 1" } });
    const b = attrs({ key: "b", data: { type: "formula", expression: "a + 1" } });
    const price = attrs({ key: "price", defaultValue: 5, data: { type: "number" } });
    const errors: VariableIssue[] = [];

    const resolved = resolveDocumentVariables(
      [
        { pos: 0, attrs: a },
        { pos: 2, attrs: b },
        { pos: 4, attrs: price }
      ],
      {},
      system({ errors })
    );

    // `a = b + 1`, `b = a + 1` has no solution, so neither may print a number that
    // looks like an answer. A partial evaluation would have produced 2 and 1.
    expect(resolved.map((item) => item.value)).toEqual([0, 0, 5]);
    expect(resolved[2]?.display).toBe("5");
    // One issue names the cycle; a second may name the operand that could not be
    // resolved as a consequence. Neither may be absent.
    expect(errors.some((issue) => issue.message.includes(DEFAULT_VARIABLE_LOCALE.formulaCycle))).toBe(true);
    expect(errors.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("reports an unresolvable operand rather than silently using zero", () => {
    const errors: VariableIssue[] = [];
    const variable = attrs({ key: "total", data: { type: "formula", expression: "missing * 2" } });

    const resolved = resolve(variable, {}, { errors });

    expect(resolved.display).toBe("0");
    expect(errors[0]?.message).toContain(DEFAULT_VARIABLE_LOCALE.formulaUnknown);
  });
});

describe("system", () => {
  it("renders the page number, the total, and both labels", () => {
    expect(resolve(attrs({ key: "p", data: { type: "system", systemKey: "page" } })).display).toBe("2");
    expect(resolve(attrs({ key: "t", data: { type: "system", systemKey: "total" } })).display).toBe("7");
    expect(resolve(attrs({ key: "l", data: { type: "system", systemKey: "pageLabel" } })).display).toBe("第 2 页");
    expect(resolve(attrs({ key: "o", data: { type: "system", systemKey: "pageOfTotal" } })).display).toBe("第 2 页，共 7 页");
  });

  it("ignores the fill data entirely", () => {
    // A page number is not a user value, so a fill entry for its key must not win.
    const variable = attrs({ key: "p", data: { type: "system", systemKey: "page" } });
    expect(resolve(variable, { p: "999" }).display).toBe("2");
  });

  it("renders the injected clock for date and time", () => {
    expect(resolve(attrs({ key: "d", data: { type: "system", systemKey: "date" } })).display).toBe("2024年05月06日");
    expect(resolve(attrs({ key: "t", data: { type: "system", systemKey: "time" } })).display).toBe("08:09:10");
    expect(
      resolve(attrs({ key: "t", data: { type: "system", systemKey: "time", format: "HH:mm" } })).display
    ).toBe("08:09");
  });
});

describe("resolveDocumentVariables", () => {
  it("returns one result per input, in the same order", () => {
    const variables = [
      attrs({ label: "甲", key: "a", data: { type: "text" } }),
      attrs({ label: "乙", key: "b", data: { type: "text" } })
    ];
    const resolved = resolveDocumentVariables(
      variables.map((variable, index) => ({ pos: index * 2, attrs: variable })),
      { a: "A" },
      system()
    );

    expect(resolved.map((item) => item.key)).toEqual(["a", "b"]);
    expect(resolved.map((item) => item.display)).toEqual(["A", ""]);
  });

  it("reports the type alongside the value", () => {
    const resolved = resolveDocumentVariables(
      [{ pos: 0, attrs: attrs({ key: "n", data: { type: "number", precision: 1 } }) }],
      { n: 2 },
      system()
    );
    expect(resolved[0]).toMatchObject({ type: "number", value: 2, display: "2.0" });
  });
});

describe("validateFill", () => {
  /** Shorthand: one variable at position 0. */
  const one = (variable: VariableAttrs, fill: Record<string, VariableValue> = {}): VariableIssue[] =>
    validateFill([{ pos: 0, attrs: variable }], fill);

  it("blocks a required text value that is missing", () => {
    const issues = one(attrs({ key: "name", data: { type: "text" } }));
    expect(issues).toEqual([{ key: "name", message: DEFAULT_VARIABLE_LOCALE.required, severity: "error" }]);
  });

  it("accepts a required value supplied by the default", () => {
    expect(one(attrs({ key: "name", defaultValue: "默认", data: { type: "text" } }))).toEqual([]);
  });

  it("accepts a required value supplied by the fill data", () => {
    expect(one(attrs({ key: "name", data: { type: "text" } }), { name: "实际" })).toEqual([]);
  });

  it("warns rather than blocks when text is past its soft limit", () => {
    const issues = one(attrs({ key: "t", data: { type: "text", maxLength: 3 } }), { t: "一二三四五" });
    expect(issues).toEqual([{ key: "t", message: DEFAULT_VARIABLE_LOCALE.textOverflow, severity: "warning" }]);
  });

  it("blocks a number below its minimum or above its maximum", () => {
    const data: VariableData = { type: "number", min: 0, max: 100 };
    expect(one(attrs({ key: "n", data }), { n: -1 })).toHaveLength(1);
    expect(one(attrs({ key: "n", data }), { n: 101 })).toHaveLength(1);
    expect(one(attrs({ key: "n", data }), { n: 50 })).toEqual([]);
  });

  it("blocks a select value that is not among the options", () => {
    const data: VariableData = {
      type: "select",
      options: [
        { label: "甲", value: "a" },
        { label: "乙", value: "b" }
      ]
    };
    expect(one(attrs({ key: "s", data }), { s: "c" })).toEqual([
      { key: "s", message: DEFAULT_VARIABLE_LOCALE.selectInvalid, severity: "error" }
    ]);
    expect(one(attrs({ key: "s", data }), { s: "a" })).toEqual([]);
  });

  it("does not check select values when the option list is empty", () => {
    // An empty list means the fill dialog falls back to free text.
    expect(one(attrs({ key: "s", data: { type: "select", options: [] } }), { s: "anything" })).toEqual([]);
  });

  it("blocks an image that is too large, and one with no source", () => {
    const data: VariableData = { type: "image", maxSizeMb: 1 };
    expect(one(attrs({ key: "img", data }), { img: "" })).toEqual([
      { key: "img", message: DEFAULT_VARIABLE_LOCALE.imageEmpty, severity: "error" }
    ]);

    // 4 base64 characters per 3 bytes, so this is comfortably over 1 MB.
    const huge = `data:image/png;base64,${"A".repeat(2_000_000)}`;
    expect(one(attrs({ key: "img", data }), { img: huge })).toEqual([
      { key: "img", message: DEFAULT_VARIABLE_LOCALE.imageTooLarge, severity: "error" }
    ]);
  });

  it("accepts a remote image URL, whose size it cannot know", () => {
    const data: VariableData = { type: "image" };
    expect(one(attrs({ key: "img", data }), { img: "https://example.com/a.png" })).toEqual([]);
  });

  it("does not require a boolean, which has a meaningful default of 否", () => {
    expect(one(attrs({ key: "b", data: { type: "boolean" } }))).toEqual([]);
  });

  it("does not require a system value, which the document supplies", () => {
    expect(one(attrs({ key: "p", data: { type: "system", systemKey: "page" } }))).toEqual([]);
  });

  it("blocks a formula with a syntax error", () => {
    const issues = one(attrs({ key: "f", data: { type: "formula", expression: "1 +" } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain(DEFAULT_VARIABLE_LOCALE.formulaSyntax);
  });

  it("blocks a formula whose operand is neither a variable nor fill data", () => {
    const issues = one(attrs({ key: "f", data: { type: "formula", expression: "ghost * 2" } }));
    expect(issues[0]?.message).toContain(DEFAULT_VARIABLE_LOCALE.formulaUnknown);
  });

  it("accepts a formula whose operand arrives through the fill data alone", () => {
    // The legacy `innerVariable` case: the key is not a variable in the document.
    const issues = one(attrs({ key: "f", data: { type: "formula", expression: "rate * 2" } }), { rate: 3 });
    expect(issues).toEqual([]);
  });

  it("blocks a formula cycle", () => {
    const a = attrs({ key: "a", data: { type: "formula", expression: "b + 1" } });
    const b = attrs({ key: "b", data: { type: "formula", expression: "a + 1" } });
    const issues = validateFill(
      [
        { pos: 0, attrs: a },
        { pos: 2, attrs: b }
      ],
      {}
    );
    expect(issues.some((issue) => issue.message.includes(DEFAULT_VARIABLE_LOCALE.formulaCycle))).toBe(true);
  });

  it("reports a self-referencing formula as a cycle", () => {
    const issues = one(attrs({ key: "a", data: { type: "formula", expression: "a + 1" } }));
    expect(issues.some((issue) => issue.message.includes(DEFAULT_VARIABLE_LOCALE.formulaCycle))).toBe(true);
  });

  it("reports a repeated variable once, not once per occurrence", () => {
    // The same key in the body and in the signature block is one thing to fix.
    const variable = attrs({ key: "name", data: { type: "text" } });
    const issues = validateFill(
      [
        { pos: 0, attrs: variable },
        { pos: 10, attrs: variable }
      ],
      {}
    );
    expect(issues).toHaveLength(1);
  });

  it("never throws on a corrupt template", () => {
    const broken = [
      attrs({ key: "", data: { type: "text" } }),
      attrs({ key: "x", data: { type: "money", precision: -3 } }),
      attrs({ key: "y", data: { type: "date", format: "" } }),
      attrs({ key: "z", data: { type: "select", options: [{ label: "a", value: "" }] } })
    ];
    expect(() => validateFill(broken.map((variable, index) => ({ pos: index, attrs: variable })), {})).not.toThrow();
  });
});

describe("helpers", () => {
  it("lists a formula's dependencies", () => {
    const dependencies = formulaDependencies([
      { pos: 0, attrs: attrs({ key: "total", data: { type: "formula", expression: "SUM(a, b.c)" } }) },
      { pos: 1, attrs: attrs({ key: "name", data: { type: "text" } }) }
    ]);
    expect(dependencies.get("total")).toEqual(["a", "b.c"]);
    expect(dependencies.has("name")).toBe(false);
  });

  it("flattens an inner-variable tree", () => {
    const flat = flattenInnerVariables([
      {
        label: "甲方",
        key: "partyA",
        children: [{ label: "名称", key: "partyA.name" }]
      }
    ]);
    expect([...flat.keys()]).toEqual(["partyA", "partyA.name"]);
  });
});
