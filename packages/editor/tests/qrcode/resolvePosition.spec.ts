/**
 * Finding the QR code again after an `await`.
 *
 * Rasterising waits on a canvas, and during those milliseconds the automatic paginator can move content
 * between pages — this zero-height node included. The offset captured before the `await` is therefore
 * only a *hint*: the bug this file pins is the old behaviour of asking whether that same offset still
 * held a QR code and silently doing nothing when it did not, which is why a document could open with a
 * broken image (alt text only) until the user pressed 更新 by hand.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import { QRCode, resolveQRCodePosition } from "../../src/extensions/qrcode";

const schema = getSchema([createDocument(), Paragraph, Text, Page, QRCode]);

function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

function code(text: string, src = ""): JSONContent {
  return { type: "qrcode", attrs: { text, src } };
}

/** A page whose body is the given blocks. */
function page(blocks: JSONContent[]): JSONContent {
  return { type: "page", content: [{ type: "pageContent", content: blocks }] };
}

function stateOf(blocks: JSONContent[]): EditorState {
  const doc = schema.nodeFromJSON({ type: "doc", content: [page(blocks)] });
  return EditorState.create({ schema, doc });
}

/** The position of the first QR code in a document. */
function firstCodePos(doc: PMNode): number {
  return codePositions(doc)[0];
}

/** Every QR code's position, in document order. */
function codePositions(doc: PMNode): number[] {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "qrcode") {
      found.push(pos);
      return false;
    }
    return true;
  });
  return found;
}

describe("resolveQRCodePosition", () => {
  it("keeps the original offset while the code is still there", () => {
    const state = stateOf([code("https://example.com"), block("正文")]);
    const pos = firstCodePos(state.doc);

    expect(resolveQRCodePosition(state, pos, "https://example.com")).toBe(pos);
  });

  it("follows the code when the paginator has moved it", () => {
    // The document after the move: the same payload, a different offset, still no raster.
    const after = stateOf([block("正文"), code("https://example.com")]);
    const stale = 1;

    const found = resolveQRCodePosition(after, stale, "https://example.com");
    expect(found).toBe(firstCodePos(after.doc));
    expect(found).not.toBe(stale);
  });

  it("prefers the code that still has no raster", () => {
    // Two codes share a payload; the one that was waiting for its raster is the one to write to.
    const state = stateOf([
      code("https://example.com", "data:image/png;base64,AAAA"),
      block("正文"),
      code("https://example.com")
    ]);
    const [withRaster, waiting] = codePositions(state.doc);

    // The hint points at the code that already has a raster, so the resolver must skip it.
    expect(resolveQRCodePosition(state, withRaster, "https://example.com")).toBe(waiting);
  });

  it("gives up when the payload is gone", () => {
    const state = stateOf([block("正文")]);
    expect(resolveQRCodePosition(state, 1, "https://example.com")).toBeUndefined();
  });

  it("gives up when the document holds a different payload", () => {
    const state = stateOf([code("https://other.example.com")]);
    expect(resolveQRCodePosition(state, firstCodePos(state.doc), "https://example.com")).toBeUndefined();
  });
});
