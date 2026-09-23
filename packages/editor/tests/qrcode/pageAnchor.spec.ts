/**
 * The QR code's page anchoring.
 *
 * "Which page is this code on" is a document question, not a rendering one: the code is
 * absolutely positioned inside the page it lives in, so the only way to place it on page 3 is to
 * put the node in page 3. Everything needed to decide that is a pure function of the document,
 * which is what this file pins — including the cases where there is nothing to do (no anchor, or
 * the code is already on the target page) and the cases where the move is impossible (a
 * single-page document).
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import { QRCode } from "../../src/extensions/qrcode";
import { pageContentEnd, pageIndexOf, planPageMove } from "../../src/extensions/qrcode/pageAnchor";

const schema = getSchema([createDocument(), Paragraph, Text, Page, QRCode]);

function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

/**
 * A document of `pages` pages, each with one paragraph of body text. The first page also carries
 * a QR code, so "the code on page 1" has a real position to be addressed by.
 */
function documentOf(pages: number, withCode = true): PMNode {
  const content: JSONContent[] = [];

  for (let index = 1; index <= pages; index += 1) {
    const body: JSONContent[] = [block(`第 ${index} 页正文`)];
    if (withCode && index === 1) body.push({ type: "qrcode", attrs: { text: "https://example.com" } });
    content.push({ type: "page", content: [{ type: "pageContent", content: body }] });
  }

  return schema.nodeFromJSON({ type: "doc", content });
}

/** The position of the QR code in the document. */
function codePos(doc: PMNode): number {
  let found: number | undefined;
  doc.descendants((node, pos) => {
    if (node.type.name === "qrcode" && found === undefined) found = pos;
    return true;
  });
  expect(found, "the document has a QR code").toBeDefined();
  return found as number;
}

describe("pageIndexOf", () => {
  it("reports the 1-based page a position sits on", () => {
    const doc = documentOf(3);
    expect(pageIndexOf(doc, codePos(doc))).toBe(1);

    // Page 2 starts after the first page node; a position just inside its body is on page 2.
    const page2Start = 1 + doc.child(0).nodeSize;
    expect(pageIndexOf(doc, page2Start + 2)).toBe(2);
  });

  it("answers 1 for a document without pages", () => {
    const plain = schema.nodeFromJSON({ type: "doc", content: [block("单页")] });
    expect(pageIndexOf(plain, 1)).toBe(1);
  });
});

describe("pageContentEnd", () => {
  it("is a position inside the page's own content", () => {
    const doc = documentOf(2);
    const end = pageContentEnd(doc, 2);

    expect(end).toBeDefined();
    const $pos = doc.resolve(end as number);
    expect($pos.parent.type.name).toBe("pageContent");
    // The end of page 2's content, not of page 1's.
    expect($pos.node($pos.depth - 1).type.name).toBe("page");
    expect(pageIndexOf(doc, (end as number) - 1)).toBe(2);
  });

  it("clamps a page number past the end, and has no answer without pages", () => {
    const doc = documentOf(2);
    // Clamped rather than refused, the same way `resolvePageIndex` clamps an anchor: a caller
    // that asked for "page 9" of a two-page document means the last page.
    expect(pageContentEnd(doc, 5)).toBe(pageContentEnd(doc, 2));
    expect(pageContentEnd(doc, 0)).toBe(pageContentEnd(doc, 1));
    expect(pageContentEnd(schema.nodeFromJSON({ type: "doc", content: [block("单页")] }), 1)).toBeUndefined();
  });
});

describe("planPageMove", () => {
  it("sends a code to the last page of a multi-page document", () => {
    const doc = documentOf(3);
    const plan = planPageMove(doc, codePos(doc), "last");

    expect(plan?.target).toBe(3);
    expect(plan?.insertAt).toBe(pageContentEnd(doc, 3));
  });

  it("does nothing for an unspecified anchor", () => {
    expect(planPageMove(documentOf(3), codePos(documentOf(3)), null)).toBeUndefined();
  });

  it("does nothing when the code is already there", () => {
    const doc = documentOf(3);
    expect(planPageMove(doc, codePos(doc), "first")).toBeUndefined();
    expect(planPageMove(doc, codePos(doc), 1)).toBeUndefined();
  });

  it("clamps a page number past the end to the last page", () => {
    const doc = documentOf(2);
    expect(planPageMove(doc, codePos(doc), 9)?.target).toBe(2);
  });

  it("cannot move anything when the document has no pages to move between", () => {
    const plain = schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "qrcode", attrs: { text: "https://example.com" } }]
    });
    expect(planPageMove(plain, codePos(plain), "last")).toBeUndefined();
  });
});
