// @vitest-environment happy-dom
/**
 * The watermark's decorations, and the one thing that has to be true about them.
 *
 * A `Decoration.widget` is identified by its `key`: ProseMirror keeps the DOM already on the page when the
 * key is unchanged and never calls `toDOM()` again. The first version keyed each page's mark by its index
 * alone, so every setting *after* the first render changed the state and nothing on screen — "the watermark
 * only applies the first time". This file pins the key to the settings.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import { buildWatermarkDecorations } from "../../src/extensions/watermark";
import {
  resolveWatermarkSettings,
  watermarkSettingsKey
} from "../../src/extensions/watermark/settings";

const schema = getSchema([createDocument(), Paragraph, Text, Page]);

function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

/** A document of `pages` pages. */
function documentOf(pages: number) {
  return schema.nodeFromJSON({
    type: "doc",
    content: Array.from({ length: pages }, (_, index) => ({
      type: "page",
      content: [{ type: "pageContent", content: [block(`第 ${index + 1} 页`)] }]
    }))
  });
}

/** Every widget key in a decoration set. */
function widgetKeys(decorations: ReturnType<typeof buildWatermarkDecorations>): string[] {
  const keys: string[] = [];
  for (const decoration of decorations.find()) {
    if (typeof decoration.spec.key === "string") keys.push(decoration.spec.key);
  }
  return keys;
}

describe("the watermark's decoration keys", () => {
  it("puts one mark on every page", () => {
    const settings = resolveWatermarkSettings({ enabled: true, text: "水印" });
    expect(widgetKeys(buildWatermarkDecorations(documentOf(3), settings))).toHaveLength(3);
  });

  it("gives a changed setting a new key, which is what makes the new mark replace the old one", () => {
    const doc = documentOf(1);
    const before = resolveWatermarkSettings({ enabled: true, text: "水印", angle: -45 });
    const after = resolveWatermarkSettings({ enabled: true, text: "机密", angle: -45 });

    const [keyBefore] = widgetKeys(buildWatermarkDecorations(doc, before));
    const [keyAfter] = widgetKeys(buildWatermarkDecorations(doc, after));

    expect(keyBefore).toContain(watermarkSettingsKey(before));
    expect(keyAfter).not.toBe(keyBefore);
  });

  it("keeps the same key when nothing changed, so the DOM is not rebuilt on every transaction", () => {
    const doc = documentOf(2);
    const settings = resolveWatermarkSettings({ enabled: true, text: "水印" });

    expect(widgetKeys(buildWatermarkDecorations(doc, settings))).toEqual(
      widgetKeys(buildWatermarkDecorations(doc, resolveWatermarkSettings(settings)))
    );
  });

  it("draws nothing while the mark is disabled or explicitly empty", () => {
    expect(widgetKeys(buildWatermarkDecorations(documentOf(2), resolveWatermarkSettings({ enabled: false })))).toEqual(
      []
    );
    expect(
      widgetKeys(
        buildWatermarkDecorations(documentOf(2), resolveWatermarkSettings({ enabled: true, text: "" }))
      )
    ).toEqual([]);
  });
});
