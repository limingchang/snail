/**
 * `applyPageNumberFormat`'s planner, tested without a browser.
 *
 * The bug this covers is a *state* bug, not a rendering bug: enabling the footer leaves the band
 * empty, so "pick a page number format" had no page-number node to write to and the panel could
 * only report that the footer had none. Choosing a format is how a user asks for a number, so the
 * planner has to create the missing node — and it has to do it in `block*` furniture, on every
 * page, without disturbing positions as it goes.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import {
  collectPages,
  findChild,
  PAGE_FOOTER_NODE,
  PAGE_HEADER_NODE,
  PAGE_NUMBER_NODE
} from "../../src/extensions/page/utils/nodes";
import type { PageRef } from "../../src/extensions/page/utils/nodes";
import { planPageNumberFormat } from "../../src/extensions/page/utils/pageNumberFormat";

const schema = getSchema([createDocument(), Paragraph, Text, Heading, Page]);

/** A paragraph with text. */
function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

/** The empty paragraph `addFooter()` seeds a fresh band with. */
function emptyBlock(): JSONContent {
  return { type: "paragraph" };
}

function furniture(type: "pageHeader" | "pageFooter", content: JSONContent[]): JSONContent {
  return { type, content };
}

function body(...content: JSONContent[]): JSONContent {
  return { type: "pageContent", content };
}

function page(...children: JSONContent[]): JSONContent {
  return { type: "page", content: children };
}

function doc(...pages: JSONContent[]): JSONContent {
  return { type: "doc", content: pages };
}

function number(format: string): JSONContent {
  return { type: PAGE_NUMBER_NODE, attrs: { format } };
}

function state(content: JSONContent): EditorState {
  return EditorState.create({ schema, doc: schema.nodeFromJSON(content) });
}

/** Every `pageNumber` in the document, with its position. */
function pageNumbers(document: PMNode): { node: PMNode; pos: number }[] {
  const found: { node: PMNode; pos: number }[] = [];
  document.descendants((node, pos) => {
    if (node.type.name === PAGE_NUMBER_NODE) {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

/** The page numbers that sit **inside** a band. */
function numbersIn(document: PMNode, band: PageRef, typeName: string): PMNode[] {
  const child = findChild(band, typeName);
  if (!child) return [];
  const end = child.pos + child.node.nodeSize;
  return pageNumbers(document)
    .filter((entry) => entry.pos > child.pos && entry.pos < end)
    .map((entry) => entry.node);
}

/** The single page of a one-page fixture. */
function firstPage(document: PMNode): PageRef {
  const pages = collectPages(document);
  expect(pages).toHaveLength(1);
  return pages[0];
}

describe("planPageNumberFormat", () => {
  it("creates the page number when the footer is empty", () => {
    const base = state(doc(page(body(block("正文")), furniture(PAGE_FOOTER_NODE, [emptyBlock()]))));
    const format = "第 {page} 页 / 共 {total} 页";

    const tr = planPageNumberFormat(base, format);
    expect(tr).not.toBeNull();

    const next = base.apply(tr!);
    const inside = numbersIn(next.doc, firstPage(next.doc), PAGE_FOOTER_NODE);
    expect(inside).toHaveLength(1);
    expect(inside[0].attrs.format).toBe(format);

    // The number went into the footer, not into the body or the page.
    expect(pageNumbers(next.doc)).toHaveLength(1);
    // …and the body is byte-for-byte what it was.
    expect(next.doc.textContent).toBe("正文");
  });

  it("updates the existing number instead of adding a second one", () => {
    const base = state(
      doc(
        page(
          body(block("正文")),
          furniture(PAGE_FOOTER_NODE, [
            { type: "paragraph", content: [number("第{page}页")] }
          ])
        )
      )
    );

    const next = base.apply(planPageNumberFormat(base, "# / &")!);
    const inside = numbersIn(next.doc, firstPage(next.doc), PAGE_FOOTER_NODE);
    expect(inside).toHaveLength(1);
    expect(inside[0].attrs.format).toBe("# / &");
  });

  it("does nothing when every number already has that format", () => {
    const base = state(
      doc(
        page(
          body(block("正文")),
          furniture(PAGE_FOOTER_NODE, [{ type: "paragraph", content: [number("{page}")] }])
        )
      )
    );

    expect(planPageNumberFormat(base, "{page}")).toBeNull();
  });

  it("does nothing when no page has any furniture", () => {
    const base = state(doc(page(body(block("正文")))));
    expect(planPageNumberFormat(base, "{page}")).toBeNull();
  });

  it("prefers the footer and falls back to the header", () => {
    const base = state(
      doc(
        page(body(block("第一页")), furniture(PAGE_HEADER_NODE, [emptyBlock()])),
        page(
          body(block("第二页")),
          furniture(PAGE_HEADER_NODE, [emptyBlock()]),
          furniture(PAGE_FOOTER_NODE, [emptyBlock()])
        )
      )
    );

    const next = base.apply(planPageNumberFormat(base, "{page}/{total}")!);
    const pages = collectPages(next.doc);
    expect(pages).toHaveLength(2);

    // No footer on page 1: the number goes in the header rather than nowhere.
    expect(numbersIn(next.doc, pages[0], PAGE_HEADER_NODE)).toHaveLength(1);
    // A page with both gets exactly one, in the footer.
    expect(numbersIn(next.doc, pages[1], PAGE_FOOTER_NODE)).toHaveLength(1);
    expect(numbersIn(next.doc, pages[1], PAGE_HEADER_NODE)).toHaveLength(0);
    expect(pageNumbers(next.doc)).toHaveLength(2);
  });

  it("numbers every page in one transaction, without shifting a later position", () => {
    const base = state(
      doc(
        page(body(block("一")), furniture(PAGE_FOOTER_NODE, [emptyBlock()])),
        page(body(block("二")), furniture(PAGE_FOOTER_NODE, [emptyBlock()])),
        page(body(block("三")), furniture(PAGE_FOOTER_NODE, [emptyBlock()]))
      )
    );

    const next = base.apply(planPageNumberFormat(base, "{page}")!);
    const pages = collectPages(next.doc);
    expect(pages).toHaveLength(3);

    for (const ref of pages) {
      expect(numbersIn(next.doc, ref, PAGE_FOOTER_NODE)).toHaveLength(1);
    }
    // One insert per page: an ascending pass would have spliced stale positions and produced
    // either a missing number or a `RangeError`.
    expect(pageNumbers(next.doc)).toHaveLength(3);
    expect(next.doc.textContent).toBe("一二三");
  });

  it("creates the number in a footer that holds text after an existing paragraph", () => {
    const base = state(
      doc(
        page(
          body(block("正文")),
          furniture(PAGE_FOOTER_NODE, [block("甲方："), block("日期：")])
        )
      )
    );

    const next = base.apply(planPageNumberFormat(base, "{page}")!);
    const inside = numbersIn(next.doc, firstPage(next.doc), PAGE_FOOTER_NODE);
    expect(inside).toHaveLength(1);

    // Appended at the end of the band's last textblock, so the text before it is intact.
    const text = findChild(firstPage(next.doc), PAGE_FOOTER_NODE)!.node.textContent;
    expect(text).toBe("甲方：日期：");
  });
});
