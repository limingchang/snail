/**
 * The HTML round-trip.
 *
 * Legacy defect 25: `renderHTML` returned `{}` for `key`, `desc`, `defaultValue` and
 * `data`, so copying a variable inside the editor — or exporting HTML and importing it
 * again — silently dropped the type-specific configuration, and it never survived a
 * save either. Every field of every type in the union has to come back.
 *
 * The test drives the extension's own `renderHTML`/`parseHTML` definitions rather than
 * a live editor, so it needs no DOM: the element argument is the small stub Tiptap's
 * `getAttrs` actually calls (`getAttribute`/`hasAttribute`).
 */

import { describe, expect, it } from "vitest";

import { Variable } from "../../src/extensions/variable/index";
import { VARIABLE_TYPES } from "../../src/typings/variable";
import type { VariableAttrs, VariableData, VariableType } from "../../src/typings/variable";

/**
 * The shape `getAttrs` is handed.
 *
 * A real `HTMLElement` would do, but a stub keeps this test independent of a DOM
 * implementation and documents exactly which methods the attribute readers use.
 */
interface ParseElementStub {
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
}

/** Build a stub from an attribute record. */
function element(attributes: Record<string, string>): ParseElementStub {
  return {
    getAttribute: (name) => (name in attributes ? (attributes[name] ?? null) : null),
    hasAttribute: (name) => name in attributes
  };
}

/** The extension's `addAttributes()` result, without needing a live editor. */
function attributeDefinitions(): Record<string, unknown> {
  const addAttributes = (Variable.config as unknown as { addAttributes?: () => Record<string, unknown> })
    .addAttributes;
  if (!addAttributes) throw new Error("the variable extension declares no attributes");
  return addAttributes.call(Variable);
}

/** The extension's single `parseHTML` rule. */
function parseRule(): { tag: string; getAttrs?: (element: unknown) => unknown } {
  const parseHTML = (Variable.config as unknown as { parseHTML?: () => unknown[] }).parseHTML;
  if (!parseHTML) throw new Error("the variable extension declares no parseHTML");
  const rules = parseHTML.call(Variable);
  const rule = rules[0] as { tag: string; getAttrs?: (element: unknown) => unknown } | undefined;
  if (!rule) throw new Error("the variable extension declares no parse rule");
  return rule;
}

/** Merge the per-attribute `renderHTML` outputs, exactly as Tiptap's renderer does. */
function renderAttributes(attrs: VariableAttrs): Record<string, string> {
  const rendered: Record<string, string> = {};

  for (const definition of Object.values(attributeDefinitions())) {
    const typed = definition as {
      renderHTML?: (attributes: Record<string, unknown>) => Record<string, unknown>;
    };
    if (!typed.renderHTML) continue;
    const produced = typed.renderHTML(attrs as unknown as Record<string, unknown>);
    for (const [key, value] of Object.entries(produced)) {
      // Tiptap drops `undefined`, which is what makes an absent `desc` add no attribute.
      if (value === undefined) continue;
      rendered[key] = String(value);
    }
  }

  // The two markers come from `renderHTML` itself rather than from an attribute
  // definition: `data-type` is what the parse rule matches on, and `data-variable-type`
  // is the discriminant duplicated out of the config blob for CSS. Without them the rule
  // correctly rejects the element, since it is not marked as a variable.
  rendered["data-type"] = "variable";
  rendered["data-variable-type"] = attrs.data.type;

  return rendered;
}

/**
 * Parse attributes back out of a rendered element.
 *
 * Tiptap merges each attribute definition's `parseHTML` over the rule's own getAttrs,
 * and only overrides the default when the reader returns something other than
 * `undefined`/`null`. That is what keeps an absent field absent instead of resetting it
 * to the default.
 */
function parseAttributes(rendered: Record<string, string>): Partial<VariableAttrs> {
  const stub = element(rendered);
  const rule = parseRule();

  const parsed: Record<string, unknown> = {};
  if (rule.getAttrs) {
    const fromRule = rule.getAttrs(stub as unknown);
    if (fromRule === false) throw new Error("the parse rule rejected the element it rendered");
    if (fromRule && typeof fromRule === "object") Object.assign(parsed, fromRule);
  }

  for (const [name, definition] of Object.entries(attributeDefinitions())) {
    const typed = definition as { default?: unknown; parseHTML?: (element: unknown) => unknown };
    if (!typed.parseHTML) continue;
    const value = typed.parseHTML(stub as unknown);
    if (value === undefined || value === null) continue;
    parsed[name] = value;
  }

  return parsed as Partial<VariableAttrs>;
}

/** Round-trip one variable through its HTML form. */
function roundTrip(attrs: VariableAttrs): Partial<VariableAttrs> {
  return parseAttributes(renderAttributes(attrs));
}

/** The default `keySource`, which `renderHTML` deliberately does not write out. */
const MANUAL: NonNullable<VariableAttrs["keySource"]> = "manual";

/** One representative attribute set per type in the union. */
const fixtures: Array<{ type: VariableType; attrs: VariableAttrs }> = [
  {
    type: "text",
    attrs: {
      label: "合同名称",
      key: "contract.name",
      desc: "双方约定的合同名称",
      defaultValue: "采购合同",
      data: { type: "text", placeholder: "请输入合同名称", maxLength: 50 } satisfies VariableData
    }
  },
  {
    type: "number",
    attrs: {
      label: "数量",
      key: "item.count",
      defaultValue: 12,
      data: { type: "number", precision: 2, thousands: true, min: 0, max: 9999 } satisfies VariableData
    }
  },
  {
    type: "money",
    attrs: {
      label: "金额",
      key: "total",
      desc: "含税总额",
      defaultValue: 1234.5,
      data: {
        type: "money",
        precision: 2,
        currency: "￥",
        thousands: true,
        chineseUppercase: true
      } satisfies VariableData
    }
  },
  {
    type: "boolean",
    attrs: {
      label: "是否含税",
      key: "taxIncluded",
      defaultValue: true,
      data: { type: "boolean", trueText: "含税", falseText: "不含税" } satisfies VariableData
    }
  },
  {
    type: "date",
    attrs: {
      label: "签订日期",
      key: "signedAt",
      defaultValue: "today",
      data: { type: "date", format: "YYYY年MM月DD日", resolveToday: true } satisfies VariableData
    }
  },
  {
    type: "select",
    attrs: {
      label: "期限类型",
      key: "term",
      defaultValue: "fixed",
      data: {
        type: "select",
        options: [
          { label: "固定期限", value: "fixed", description: "约定明确的起止日" },
          { label: "无固定期限", value: "open" },
          { label: "以完成一定工作为期限", value: 3 }
        ],
        multiple: true,
        joinWith: "、"
      } satisfies VariableData
    }
  },
  {
    type: "image",
    attrs: {
      label: "公章",
      key: "seal",
      defaultValue: "data:image/png;base64,AAAA",
      data: { type: "image", source: "upload", accept: "image/png", maxSizeMb: 1, width: "40mm" } satisfies VariableData
    }
  },
  {
    type: "formula",
    attrs: {
      label: "合计",
      key: "grandTotal",
      defaultValue: 0,
      data: {
        type: "formula",
        expression: "SUM(item1.price, item2.price) * 1.06",
        precision: 2,
        prefix: "￥",
        suffix: " 元"
      } satisfies VariableData
    }
  },
  {
    type: "system",
    attrs: {
      label: "页码",
      key: "page",
      data: { type: "system", systemKey: "pageOfTotal", format: "YYYY" } satisfies VariableData
    }
  }
];

describe("the fixture set covers the contract", () => {
  it("has one case per type in the union", () => {
    expect(fixtures.map(({ type }) => type)).toEqual([...VARIABLE_TYPES]);
    expect(new Set(fixtures.map(({ type }) => type)).size).toBe(VARIABLE_TYPES.length);
  });
});

describe("parseHTML(renderHTML(attrs))", () => {
  for (const { type, attrs } of fixtures) {
    describe(type, () => {
      it("preserves every field", () => {
        const parsed = roundTrip(attrs);

        expect(parsed.label).toBe(attrs.label);
        expect(parsed.key).toBe(attrs.key);
        expect(parsed.desc).toBe(attrs.desc);
        // A boolean default must not come back as the string "true", and a numeric one
        // must not come back as "12": the JSON encoding is what keeps the type.
        expect(parsed.defaultValue).toStrictEqual(attrs.defaultValue);
        expect(parsed.keySource ?? MANUAL).toBe(attrs.keySource ?? MANUAL);
      });

      it("preserves the whole type-specific configuration", () => {
        const parsed = roundTrip(attrs);
        // `toStrictEqual` on the union payload, so an extra or missing optional field is
        // a failure rather than something `toEqual` would forgive.
        expect(parsed.data).toStrictEqual(attrs.data);
      });

      it("recovers the discriminant, which is the only field the type cannot disagree with", () => {
        const parsed = roundTrip(attrs);
        expect(parsed.data?.type).toBe(type);
      });
    });
  }
});

describe("the encoding", () => {
  it("marks the element so a selector can find it", () => {
    const rendered = renderAttributes(fixtures[0]!.attrs);
    expect(rendered["data-type"]).toBe("variable");
    expect(rendered["data-variable-type"]).toBe("text");
  });

  it("writes the structured configuration as JSON, and the scalars as plain attributes", () => {
    const rendered = renderAttributes(fixtures[2]!.attrs);
    expect(rendered["data-variable-config"]).toBe(JSON.stringify(fixtures[2]!.attrs.data));
    // The label and key are readable without a JSON parse, which is what a third-party
    // consumer or a CSS rule needs.
    expect(rendered["data-variable-label"]).toBe("金额");
    expect(rendered["data-variable-key"]).toBe("total");
    // Not double-encoded: the label is a plain string attribute.
    expect(rendered["data-variable-label"]).not.toBe('"金额"');
  });

  it("omits an absent optional field rather than writing an empty one", () => {
    const rendered = renderAttributes({
      label: "无描述",
      key: "k",
      data: { type: "text" }
    });
    expect(rendered["data-variable-desc"]).toBeUndefined();
    expect(rendered["data-variable-default"]).toBeUndefined();
    expect(rendered["data-variable-key-source"]).toBeUndefined();
  });

  it("writes keySource only for the non-default value", () => {
    const inner = renderAttributes({
      label: "内置",
      key: "partyA.name",
      keySource: "inner",
      data: { type: "text" }
    });
    expect(inner["data-variable-key-source"]).toBe("inner");
    expect(parseAttributes(inner).keySource).toBe("inner");
  });

  it("keeps a description that is the empty string, which is different from absent", () => {
    const rendered = renderAttributes({ label: "k", key: "k", desc: "", data: { type: "text" } });
    expect(rendered["data-variable-desc"]).toBe("");
    expect(parseAttributes(rendered).desc).toBe("");
  });
});

describe("the parser is defensive", () => {
  it("rejects an element without the marker attribute", () => {
    const rule = parseRule();
    // `false` tells ProseMirror "this rule does not apply", so an unrelated `<span>`
    // pasted from a web page does not become a variable.
    expect(rule.getAttrs?.(element({ "data-variable-label": "x" }) as unknown)).toBe(false);
  });

  it("falls back to a text variable when the configuration is not valid JSON", () => {
    // A hand-edited or truncated document must still open.
    const parsed = parseAttributes({
      "data-type": "variable",
      "data-variable-config": "{not json"
    });
    expect(parsed.data).toStrictEqual({ type: "text" });
  });

  it("falls back to a text variable when the configuration has no discriminant", () => {
    const parsed = parseAttributes({
      "data-type": "variable",
      "data-variable-config": '{"precision":2}'
    });
    expect(parsed.data).toStrictEqual({ type: "text" });
  });

  it("drops a default that is not a scalar", () => {
    const parsed = parseAttributes({
      "data-type": "variable",
      "data-variable-config": '{"type":"text"}',
      "data-variable-default": '{"nested":true}'
    });
    expect(parsed.defaultValue).toBeUndefined();
  });

  it("reads a JSON default through its type", () => {
    expect(
      parseAttributes({
        "data-type": "variable",
        "data-variable-config": '{"type":"boolean"}',
        "data-variable-default": "false"
      }).defaultValue
    ).toBe(false);

    expect(
      parseAttributes({
        "data-type": "variable",
        "data-variable-config": '{"type":"number"}',
        "data-variable-default": "0"
      }).defaultValue
    ).toBe(0);

    expect(
      parseAttributes({
        "data-type": "variable",
        "data-variable-config": '{"type":"text"}',
        "data-variable-default": '"0"'
      }).defaultValue
    ).toBe("0");
  });

  it("treats an unknown keySource as the default", () => {
    const parsed = parseAttributes({
      "data-type": "variable",
      "data-variable-config": '{"type":"text"}',
      "data-variable-key-source": "something-else"
    });
    expect(parsed.keySource).toBe("manual");
  });
});
