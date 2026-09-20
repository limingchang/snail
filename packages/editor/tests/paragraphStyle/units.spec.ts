/**
 * Paragraph style values, units and the collection pass.
 *
 * The headline case is the legacy unit bug: `parseFloat("2em")` is `2`, and the measurer then
 * treated that `2` as pixels, so every indented paragraph was measured — and paginated —
 * wrong. A length here keeps its unit, and a pixel conversion has to be told which font it is
 * relative to.
 */

import { describe, expect, it } from "vitest";

import {
  collectParagraphStyleTargets,
  ParagraphStyle
} from "../../src/extensions/paragraphStyle/index";
import {
  changedParagraphStyleAttrs,
  formatParagraphLength,
  normalizeParagraphStyleValue,
  paragraphStyleDeclarations,
  paragraphStyleString,
  parseParagraphLength,
  readComputedLengthPixels,
  toPixels
} from "../../src/extensions/paragraphStyle/units";
import type { ParagraphStyleAttrs, ParagraphStyleState } from "../../src/extensions/paragraphStyle/typing";

describe("CSS lengths", () => {
  it("keeps the unit instead of stripping it", () => {
    // The legacy bug, stated as an assertion.
    expect(parseParagraphLength("2em")).toStrictEqual({ value: 2, unit: "em" });
    expect(parseParagraphLength("1.5rem")).toStrictEqual({ value: 1.5, unit: "rem" });
    expect(parseParagraphLength("12pt")).toStrictEqual({ value: 12, unit: "pt" });
    expect(parseParagraphLength("20px")).toStrictEqual({ value: 20, unit: "px" });
    expect(parseParagraphLength("50%")).toStrictEqual({ value: 50, unit: "%" });
  });

  it("reads a bare number as pixels, which is what CSS does", () => {
    expect(parseParagraphLength("0")).toStrictEqual({ value: 0, unit: "px" });
    expect(parseParagraphLength(" 24 ")).toStrictEqual({ value: 24, unit: "px" });
  });

  it("returns nothing for a value it cannot read, rather than NaN", () => {
    expect(parseParagraphLength("auto")).toBeUndefined();
    expect(parseParagraphLength("calc(1px + 2px)")).toBeUndefined();
    expect(parseParagraphLength("")).toBeUndefined();
    expect(parseParagraphLength(undefined)).toBeUndefined();
    expect(parseParagraphLength(null)).toBeUndefined();
  });

  it("formats a length back out", () => {
    expect(formatParagraphLength({ value: 2, unit: "em" })).toBe("2em");
    expect(formatParagraphLength({ value: 0, unit: "px" })).toBe("0px");
  });
});

describe("pixel conversion", () => {
  it("uses the element's own font for em", () => {
    expect(toPixels({ value: 2, unit: "em" }, { fontSize: 20 })).toBe(40);
    // The default is the browser's: 16 px.
    expect(toPixels({ value: 2, unit: "em" })).toBe(32);
  });

  it("uses the root font for rem", () => {
    expect(toPixels({ value: 1.5, unit: "rem" }, { rootFontSize: 10 })).toBe(15);
    expect(toPixels({ value: 1.5, unit: "rem" })).toBe(24);
  });

  it("converts points through the CSS definition of the inch", () => {
    expect(toPixels({ value: 12, unit: "pt" })).toBeCloseTo(16, 6);
  });

  it("converts a percentage against the element's font", () => {
    expect(toPixels({ value: 50, unit: "%" }, { fontSize: 20 })).toBe(10);
  });

  it("passes pixels through", () => {
    expect(toPixels({ value: 20, unit: "px" })).toBe(20);
  });

  it("reads a computed value into pixels, or nothing at all", () => {
    expect(readComputedLengthPixels("32px")).toBe(32);
    expect(readComputedLengthPixels("2em", { fontSize: 20 })).toBe(40);
    expect(readComputedLengthPixels("12pt")).toBeCloseTo(16, 6);
    expect(readComputedLengthPixels("auto")).toBeUndefined();
    expect(readComputedLengthPixels(null)).toBeUndefined();
  });
});

describe("normalising a value", () => {
  it("keeps `null` as `null`, because `null` is what removes a style", () => {
    expect(normalizeParagraphStyleValue(null)).toBeNull();
  });

  it("turns an empty string into `null`, because a cleared input means 'no indent'", () => {
    expect(normalizeParagraphStyleValue("")).toBeNull();
    expect(normalizeParagraphStyleValue("   ")).toBeNull();
  });

  it("trims a real value and keeps `0`, which is a real value", () => {
    expect(normalizeParagraphStyleValue("  2em ")).toBe("2em");
    expect(normalizeParagraphStyleValue("0")).toBe("0");
  });

  it("reports a non-string as 'not a value at all', which means 'leave it alone'", () => {
    expect(normalizeParagraphStyleValue(undefined)).toBeUndefined();
    expect(normalizeParagraphStyleValue(12)).toBeUndefined();
    expect(normalizeParagraphStyleValue({})).toBeUndefined();
  });
});

describe("change detection", () => {
  it("reports nothing when nothing would change", () => {
    // The legacy command logged 「没有需要更新的节点」 and returned false; there is nothing to log
    // here, and `undefined` is the whole of the answer.
    expect(changedParagraphStyleAttrs({ textIndent: "2em" }, { textIndent: "2em" })).toBeUndefined();
    expect(changedParagraphStyleAttrs({}, {})).toBeUndefined();
    expect(changedParagraphStyleAttrs({ textIndent: null }, { textIndent: "" })).toBeUndefined();
  });

  it("reports only the attributes that differ", () => {
    expect(
      changedParagraphStyleAttrs(
        { textIndent: "2em", paragraphStart: "0" },
        { textIndent: "4em", paragraphStart: "0" }
      )
    ).toStrictEqual({ textIndent: "4em" });
  });

  it("treats an absent attribute and `null` as the same state", () => {
    expect(changedParagraphStyleAttrs({}, { textIndent: null })).toBeUndefined();
    expect(changedParagraphStyleAttrs({ textIndent: null }, { textIndent: "2em" })).toStrictEqual({
      textIndent: "2em"
    });
  });

  it("removes an attribute when the patch says null", () => {
    expect(changedParagraphStyleAttrs({ textIndent: "2em" }, { textIndent: null })).toStrictEqual({
      textIndent: null
    });
    expect(changedParagraphStyleAttrs({ textIndent: "2em" }, { textIndent: "" })).toStrictEqual({
      textIndent: null
    });
  });
});

describe("rendering", () => {
  it("writes nothing for an unset style", () => {
    // The legacy `textIndent` default was `"0"`, so this map was never empty and every
    // paragraph carried `text-indent: 0;`.
    expect(paragraphStyleDeclarations({})).toStrictEqual({});
    expect(paragraphStyleDeclarations({ textIndent: null })).toStrictEqual({});
    expect(paragraphStyleString({})).toBeUndefined();
  });

  it("writes each set value under its CSS property", () => {
    expect(
      paragraphStyleDeclarations({
        textIndent: "2em",
        paragraphStart: "8pt",
        paragraphEnd: "1rem"
      })
    ).toStrictEqual({
      "text-indent": "2em",
      "margin-block-start": "8pt",
      "margin-block-end": "1rem"
    });
  });

  it("joins a declaration map into a style attribute value", () => {
    expect(paragraphStyleString({ textIndent: "2em", paragraphStart: "8pt" })).toBe(
      "text-indent: 2em; margin-block-start: 8pt;"
    );
  });
});

/** The shape `addGlobalAttributes` returns, narrowed to what this test reads. */
interface GlobalAttributeGroup {
  types: string[];
  attributes: Record<
    string,
    {
      default?: unknown;
      parseHTML?: (element: unknown) => unknown;
      renderHTML?: (attributes: Record<string, unknown>) => Record<string, unknown>;
    }
  >;
}

/** The extension's single global-attribute group. */
function globalAttributeGroup(): GlobalAttributeGroup {
  const addGlobalAttributes = (
    ParagraphStyle.config as unknown as { addGlobalAttributes?: () => unknown[] }
  ).addGlobalAttributes;
  if (!addGlobalAttributes) throw new Error("paragraphStyle declares no global attributes");

  const groups = addGlobalAttributes.call({ options: { types: ["paragraph", "heading"] } });
  const group = groups[0] as GlobalAttributeGroup | undefined;
  if (!group) throw new Error("paragraphStyle declares no global attribute group");
  return group;
}

/** An element stub with only the inline style the readers touch. */
function styledElement(style: Partial<CSSStyleDeclaration>): unknown {
  return { style };
}

describe("the schema attributes", () => {
  it("applies to paragraphs and headings", () => {
    expect(globalAttributeGroup().types).toStrictEqual(["paragraph", "heading"]);
  });

  it('defaults every style to null, not to "0"', () => {
    const { attributes } = globalAttributeGroup();
    expect(attributes.textIndent?.default).toBeNull();
    expect(attributes.paragraphStart?.default).toBeNull();
    expect(attributes.paragraphEnd?.default).toBeNull();
  });

  it("renders only the values that are set", () => {
    const { attributes } = globalAttributeGroup();
    expect(attributes.textIndent?.renderHTML?.({ textIndent: null })).toStrictEqual({});
    expect(attributes.textIndent?.renderHTML?.({})).toStrictEqual({});
    expect(attributes.textIndent?.renderHTML?.({ textIndent: "2em" })).toStrictEqual({
      style: "text-indent: 2em;"
    });
    expect(attributes.paragraphStart?.renderHTML?.({ paragraphStart: "8pt" })).toStrictEqual({
      style: "margin-block-start: 8pt;"
    });
    expect(attributes.paragraphEnd?.renderHTML?.({ paragraphEnd: "1rem" })).toStrictEqual({
      style: "margin-block-end: 1rem;"
    });
  });

  it("reads the inline styles back, and reports an absent one as absent", () => {
    const { attributes } = globalAttributeGroup();
    expect(
      attributes.textIndent?.parseHTML?.(
        styledElement({ textIndent: "2em", marginBlockStart: "", marginBlockEnd: "" })
      )
    ).toBe("2em");
    // An empty inline style must not become the value `""` — that would render `text-indent: ;`.
    expect(attributes.textIndent?.parseHTML?.(styledElement({ textIndent: "" }))).toBeUndefined();
    expect(attributes.paragraphStart?.parseHTML?.(styledElement({ marginBlockStart: "8pt" }))).toBe("8pt");
  });
});

/** A block for the stub document. */
interface BlockStub {
  pos: number;
  attrs: ParagraphStyleAttrs;
  name?: string;
}

/** A node stub: only `type.name` and `attrs` are read. */
function nodeStub(block: BlockStub): unknown {
  return { type: { name: block.name ?? "paragraph" }, attrs: block.attrs };
}

/** A state stub with a non-empty selection over `blocks`. */
function rangeState(blocks: BlockStub[], from: number, to: number): ParagraphStyleState {
  return {
    doc: {
      nodesBetween: (
        rangeFrom: number,
        rangeTo: number,
        callback: (node: unknown, pos: number, parent: unknown, index: number) => unknown
      ) => {
        for (const block of blocks) {
          if (block.pos < rangeFrom || block.pos >= rangeTo) continue;
          callback(nodeStub(block), block.pos, null, 0);
        }
      }
    },
    selection: { empty: false, from, to, $from: {} }
  } as unknown as ParagraphStyleState;
}

/** A state stub with a collapsed caret directly inside `block`, at depth 1. */
function caretState(block: BlockStub): ParagraphStyleState {
  const blockNode = nodeStub(block);
  const parentNode = nodeStub({ pos: 0, attrs: {}, name: "pageContent" });

  return {
    doc: { nodesBetween: () => undefined },
    selection: {
      empty: true,
      from: block.pos + 1,
      to: block.pos + 1,
      $from: {
        depth: 1,
        before: (depth: number) => (depth === 1 ? block.pos : 0),
        node: (depth: number) => (depth === 1 ? blockNode : parentNode)
      }
    }
  } as unknown as ParagraphStyleState;
}

const TYPES = ["paragraph", "heading"];

describe("collecting the blocks a patch would change", () => {
  it("targets the block the caret is in", () => {
    const targets = collectParagraphStyleTargets(caretState({ pos: 12, attrs: { textIndent: null } }), TYPES, {
      textIndent: "2em"
    });

    expect(targets).toStrictEqual([{ pos: 12, attrs: { textIndent: "2em" } }]);
  });

  it("returns nothing when the caret's block already has the value", () => {
    expect(
      collectParagraphStyleTargets(caretState({ pos: 12, attrs: { textIndent: "2em" } }), TYPES, {
        textIndent: "2em"
      })
    ).toStrictEqual([]);
  });

  it("covers every block in a range, and only the ones that change", () => {
    const targets = collectParagraphStyleTargets(
      rangeState(
        [
          { pos: 1, attrs: { textIndent: null } },
          { pos: 8, attrs: { textIndent: "2em" } },
          { pos: 20, attrs: { textIndent: null } }
        ],
        0,
        25
      ),
      TYPES,
      { textIndent: "2em" }
    );

    expect(targets.map((target) => target.pos)).toStrictEqual([1, 20]);
  });

  it("skips a block whose type is not in the option list", () => {
    const targets = collectParagraphStyleTargets(
      rangeState([{ pos: 1, attrs: {}, name: "blockquote" }], 0, 5),
      TYPES,
      { textIndent: "2em" }
    );

    expect(targets).toStrictEqual([]);
  });

  it("writes the complete attribute set, so nothing is dropped", () => {
    const targets = collectParagraphStyleTargets(
      rangeState([{ pos: 1, attrs: { textIndent: null, paragraphEnd: "8pt" } }], 0, 5),
      TYPES,
      { textIndent: "2em" }
    );

    expect(targets).toStrictEqual([
      { pos: 1, attrs: { textIndent: "2em", paragraphEnd: "8pt" } }
    ]);
  });

  it("removes a style when the patch asks for null", () => {
    const targets = collectParagraphStyleTargets(
      rangeState([{ pos: 1, attrs: { textIndent: "2em" } }], 0, 5),
      TYPES,
      { textIndent: null }
    );

    expect(targets).toStrictEqual([{ pos: 1, attrs: { textIndent: null } }]);
  });
});
