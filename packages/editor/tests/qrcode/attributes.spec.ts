/**
 * The QR code's HTML round-trip.
 *
 * Legacy defect 34: `text` was not a schema attribute at all, and `renderHTML` wrote no
 * `data-*` for `size`/`position` either, so the payload was dropped on every save and the
 * geometry did not survive a copy either. Every attribute has to come back.
 *
 * The test drives the extension's own `addAttributes` and its own `renderHTML` — through
 * Tiptap's real `mergeAttributes` — rather than re-implementing them, so it fails if the
 * encoding and the reader ever drift apart. The element argument is the small stub the
 * readers actually use (`getAttribute`), which keeps the test independent of a DOM.
 */

import { describe, expect, it } from "vitest";

import {
  parseQRCodeAttributes,
  QR_CODE_ALT_ATTRIBUTE,
  QR_CODE_CONFIG_ATTRIBUTE,
  QR_CODE_TEXT_ATTRIBUTE,
  QR_CODE_TYPE_ATTRIBUTE,
  QR_CODE_TYPE_VALUE
} from "../../src/extensions/qrcode/attributes";
import {
  encodeQRCodeConfig,
  normalizeAttrs,
  QR_DEFAULT_ALT,
  QR_DEFAULT_COLOR,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_POSITION,
  QR_DEFAULT_SIZE
} from "../../src/extensions/qrcode/geometry";
import { QRCode } from "../../src/extensions/qrcode/index";
import type { QRCodeAttrs } from "../../src/extensions/qrcode/typing";

/** The shape `getAttribute` readers are handed. */
interface ElementStub {
  getAttribute: (name: string) => string | null;
}

/** Build a stub from an attribute record, the way Tiptap hands over a real element. */
function element(attributes: Record<string, string>): ElementStub {
  return {
    getAttribute: (name) => (name in attributes ? (attributes[name] ?? null) : null)
  };
}

/** The extension's `addAttributes()` result, without needing a live editor. */
function attributeDefinitions(): Record<string, unknown> {
  const addAttributes = (
    QRCode.config as unknown as { addAttributes?: () => Record<string, unknown> }
  ).addAttributes;
  if (!addAttributes) throw new Error("the qrcode extension declares no attributes");
  return addAttributes.call({ options: {} });
}

/** Merge the per-attribute `renderHTML` outputs, exactly as Tiptap's renderer does. */
function attributeHTML(attrs: QRCodeAttrs): Record<string, string> {
  const rendered: Record<string, string> = {};

  for (const definition of Object.values(attributeDefinitions())) {
    const typed = definition as {
      renderHTML?: (attributes: Record<string, unknown>) => Record<string, unknown> | null;
    };
    if (!typed.renderHTML) continue;
    const produced = typed.renderHTML(attrs as unknown as Record<string, unknown>);
    if (produced === null) continue;
    for (const [key, value] of Object.entries(produced)) {
      rendered[key] = String(value);
    }
  }

  return rendered;
}

/**
 * The whole `<img>` attribute set, through the extension's real `renderHTML`.
 *
 * `this` is a stand-in for the extension context (only `options.HTMLAttributes` is read), and
 * `HTMLAttributes` is what Tiptap passes: the merged per-attribute output above.
 */
function renderNode(attrs: QRCodeAttrs): Record<string, string> {
  const renderHTML = (
    QRCode.config as unknown as {
      renderHTML?: (props: unknown) => [string, Record<string, unknown>];
    }
  ).renderHTML;
  if (!renderHTML) throw new Error("the qrcode extension declares no renderHTML");

  const [tag, rendered] = renderHTML.call(
    { options: { HTMLAttributes: {} } },
    { node: { attrs }, HTMLAttributes: attributeHTML(attrs) }
  );

  expect(tag).toBe("img");

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(rendered)) {
    result[key] = String(value);
  }
  return result;
}

/** One round-trip through the element's attributes. */
function roundTrip(attrs: QRCodeAttrs): Partial<QRCodeAttrs> {
  return parseQRCodeAttributes(element(renderNode(attrs)) as unknown as HTMLElement);
}

/** The extension's parse rule, for the marker check. */
function parseRule(): { tag: string; getAttrs?: (element: unknown) => unknown } {
  const parseHTML = (QRCode.config as unknown as { parseHTML?: () => unknown[] }).parseHTML;
  if (!parseHTML) throw new Error("the qrcode extension declares no parseHTML");
  const rules = parseHTML.call({ options: {} });
  const rule = rules[0] as { tag: string; getAttrs?: (element: unknown) => unknown } | undefined;
  if (!rule) throw new Error("the qrcode extension declares no parse rule");
  return rule;
}

/** A fully-specified QR code. */
const FULL: QRCodeAttrs = normalizeAttrs({
  text: "https://example.com/contract/9f2",
  src: "data:image/png;base64,AAAA",
  alt: "合同核验二维码",
  size: { value: 42, unit: "mm" },
  position: { x: 15, y: 25, unit: "mm" },
  color: { dark: "#112233", light: "#fefefe" },
  margin: 2
});

describe("parseHTML(renderHTML(attrs))", () => {
  it("preserves the payload, which the legacy schema dropped entirely", () => {
    expect(roundTrip(FULL).text).toBe(FULL.text);
  });

  it("preserves the raster", () => {
    expect(roundTrip(FULL).src).toBe(FULL.src);
  });

  it("preserves the structured attributes as their original types", () => {
    const parsed = roundTrip(FULL);
    // `toStrictEqual`, not `toEqual`: an extra or missing field is a failure rather than
    // something a loose comparison would forgive.
    expect(parsed.size).toStrictEqual(FULL.size);
    expect(parsed.position).toStrictEqual(FULL.position);
    expect(parsed.color).toStrictEqual(FULL.color);
    // A number must not come back as the string "2".
    expect(parsed.margin).toBe(2);
  });

  it("preserves the accessible label", () => {
    expect(roundTrip(FULL).alt).toBe(FULL.alt);
  });

  it("keeps a metric unit and a unitless raster apart", () => {
    const pixel = normalizeAttrs({ text: "x", size: { value: 200, unit: "px" } });
    expect(roundTrip(pixel).size).toStrictEqual({ value: 200, unit: "px" });
  });
});

describe("the encoding", () => {
  it("marks the element so the parse rule finds it", () => {
    const rendered = renderNode(FULL);
    expect(rendered[QR_CODE_TYPE_ATTRIBUTE]).toBe(QR_CODE_TYPE_VALUE);
  });

  it("writes the payload as a plain attribute, readable without a JSON parse", () => {
    const rendered = renderNode(FULL);
    expect(rendered[QR_CODE_TEXT_ATTRIBUTE]).toBe(FULL.text);
    // Not double-encoded: the payload is not a JSON string.
    expect(rendered[QR_CODE_TEXT_ATTRIBUTE]).not.toBe(JSON.stringify(FULL.text));
  });

  it("writes the four structured attributes as one JSON blob", () => {
    const rendered = renderNode(FULL);
    expect(rendered[QR_CODE_CONFIG_ATTRIBUTE]).toBe(encodeQRCodeConfig(FULL));

    const decoded: unknown = JSON.parse(rendered[QR_CODE_CONFIG_ATTRIBUTE] ?? "{}");
    expect(decoded).toStrictEqual({
      size: FULL.size,
      position: FULL.position,
      color: FULL.color,
      margin: FULL.margin
    });
  });

  it("writes the label as `alt`, so the exported image is still described", () => {
    expect(renderNode(FULL)[QR_CODE_ALT_ATTRIBUTE]).toBe(FULL.alt);
  });

  it("writes the position and the size as inline styles as well", () => {
    const style = renderNode(FULL).style ?? "";
    // The exported HTML must lay out exactly like the editor showed it.
    expect(style).toContain("left: 15mm");
    expect(style).toContain("top: 25mm");
    expect(style).toContain("width: 42mm");
    expect(style).toContain("height: 42mm");
    expect(style).toContain("position: absolute");
    // Nothing may clip a positioned QR code.
    expect(style).toContain("overflow: visible");
  });

  it("writes every default for a node created without attributes", () => {
    const rendered = renderNode(normalizeAttrs({}));
    expect(rendered[QR_CODE_ALT_ATTRIBUTE]).toBe(QR_DEFAULT_ALT);
    expect(JSON.parse(rendered[QR_CODE_CONFIG_ATTRIBUTE] ?? "{}")).toStrictEqual({
      size: QR_DEFAULT_SIZE,
      position: QR_DEFAULT_POSITION,
      color: QR_DEFAULT_COLOR,
      margin: QR_DEFAULT_MARGIN
    });
  });
});

describe("the parser is defensive", () => {
  it("rejects an image that is not a QR code", () => {
    const rule = parseRule();
    // `false` tells ProseMirror "this rule does not apply", so a pasted `<img>` stays an image.
    expect(rule.getAttrs?.(element({ src: "photo.png" }) as unknown)).toBe(false);
    expect(rule.getAttrs?.(element({ "data-type": "qrcode" }) as unknown)).toStrictEqual({});
  });

  it("survives a truncated configuration blob and falls back to the defaults", () => {
    const parsed = parseQRCodeAttributes(
      element({
        "data-type": "qrcode",
        [QR_CODE_CONFIG_ATTRIBUTE]: "{not json",
        [QR_CODE_TEXT_ATTRIBUTE]: "kept"
      }) as unknown as HTMLElement
    );

    // The scalar survives even though the structured half was lost.
    expect(parsed.text).toBe("kept");
    expect(parsed.size).toBeUndefined();

    const attrs = normalizeAttrs(parsed);
    expect(attrs.size).toStrictEqual(QR_DEFAULT_SIZE);
    expect(attrs.color).toStrictEqual(QR_DEFAULT_COLOR);
  });

  it("drops a field whose unit is not one of ours, keeping the rest", () => {
    const parsed = parseQRCodeAttributes(
      element({
        "data-type": "qrcode",
        [QR_CODE_CONFIG_ATTRIBUTE]: JSON.stringify({
          size: { value: 30, unit: "furlong" },
          margin: 3
        })
      }) as unknown as HTMLElement
    );

    expect(parsed.size).toBeUndefined();
    expect(parsed.margin).toBe(3);
  });

  it("drops a colour pair that is not a pair", () => {
    const parsed = parseQRCodeAttributes(
      element({
        "data-type": "qrcode",
        [QR_CODE_CONFIG_ATTRIBUTE]: JSON.stringify({ color: { dark: "#000" } })
      }) as unknown as HTMLElement
    );

    expect(parsed.color).toBeUndefined();
  });

  it("does not read a `data-qrcode-config` that is a JSON array", () => {
    const parsed = parseQRCodeAttributes(
      element({
        "data-type": "qrcode",
        [QR_CODE_CONFIG_ATTRIBUTE]: "[]"
      }) as unknown as HTMLElement
    );

    expect(parsed.margin).toBeUndefined();
    expect(parsed.size).toBeUndefined();
  });
});
