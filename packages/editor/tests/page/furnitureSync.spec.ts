/**
 * The furniture rules that only show up in a document with more than one page.
 *
 * Two defects live here:
 *
 * - **a header edit stayed on the page it was typed on.** A header is every page's header, but the model
 *   keeps one copy of the regions per band, so page two and three kept the old text. {@link planFurnitureSync}
 *   is the planner that copies the edited band's slots onto the others;
 * - **a locked region (a page number or a logo) is not editable at all**, and a double-click on one has to
 *   say so rather than look broken.
 *
 * Both are pure functions of a document and a set of touched ranges, which is what this file drives.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import {
  isFurnitureRegionLocked,
  planFurnitureSync,
  touchedRanges
} from "../../src/extensions/page/utils/furnitureEditing";
import { planFurnitureNormalisation } from "../../src/extensions/page/utils/furniture";

const schema = getSchema([createDocument(), Paragraph, Text, Heading, Page]);

function block(value: string): JSONContent {
  return { type: "paragraph", content: value === "" ? [] : [{ type: "text", text: value }] };
}

function region(slot: string, value: string): JSONContent {
  return { type: "pageRegion", attrs: { slot }, content: [block(value)] };
}

function numbered(): JSONContent {
  return { type: "paragraph", content: [{ type: "pageNumber" }] };
}

/**
 * A document of `pages` pages. Each header holds the same centre text, and `footerNumberPages` names the
 * pages whose footer centre holds a page number (a locked region) instead of text.
 */
function documentOf(options: {
  pages: number;
  headers: string[];
  footerCentre?: string[];
  footerNumberPages?: number[];
}): PMNode {
  const content: JSONContent[] = [];

  for (let index = 0; index < options.pages; index += 1) {
    const centre = options.headers[index] ?? options.headers[0] ?? "";
    const footerIsNumber = options.footerNumberPages?.includes(index) === true;
    const footerCentre = options.footerCentre?.[index] ?? "";

    content.push({
      type: "page",
      content: [
        {
          type: "pageHeader",
          content: [region("left", ""), region("center", centre), region("right", "")]
        },
        { type: "pageContent", content: [block(`第 ${index + 1} 页正文`)] },
        {
          type: "pageFooter",
          content: [
            region("left", ""),
            footerIsNumber
              ? { type: "pageRegion", attrs: { slot: "center" }, content: [numbered()] }
              : region("center", footerCentre),
            region("right", "")
          ]
        }
      ]
    });
  }

  return schema.nodeFromJSON({ type: "doc", content });
}

function stateOf(options: {
  pages: number;
  headers: string[];
  footerCentre?: string[];
  footerNumberPages?: number[];
}): EditorState {
  return EditorState.create({ schema, doc: documentOf(options) });
}

/** Every header's centre text, page by page. */
function headerCentres(doc: PMNode): string[] {
  const values: string[] = [];
  doc.forEach((page) => {
    page.forEach((child) => {
      if (child.type.name !== "pageHeader") return;
      child.forEach((regionNode) => {
        if (regionNode.type.name !== "pageRegion") return;
        if (regionNode.attrs.slot !== "center") return;
        values.push(regionNode.textContent);
      });
    });
  });
  return values;
}

describe("planFurnitureSync", () => {
  it("copies the edited band's text onto every other page", () => {
    const state = stateOf({ pages: 3, headers: ["旧页眉", "旧页眉", "旧页眉"] });

    // What a user typing in page 3's *centre* third produces: a change inside that band.
    const { tr, state: edited } = type(state, slotTextPos(state.doc, "pageHeader", "center", 2), "新");
    const plan = planFurnitureSync(edited, touchedRanges(tr));

    expect(plan).not.toBeNull();
    expect(headerCentres(edited.apply(plan!).doc)).toEqual(["新旧页眉", "新旧页眉", "新旧页眉"]);
  });

  it("does nothing when every band already matches", () => {
    const state = stateOf({ pages: 2, headers: ["同一页眉", "同一页眉"] });
    const { tr, state: edited } = type(state, slotTextPos(state.doc, "pageHeader", "center", 0), "字");

    // The source band now says 「字同一页眉」 and the other one does not, so *that* one is planned…
    const plan = planFurnitureSync(edited, touchedRanges(tr));
    expect(plan).not.toBeNull();
    // …but once they agree there is nothing left to do.
    const synced = edited.apply(plan!);
    expect(planFurnitureSync(synced, touchedRanges(tr))).toBeNull();
  });

  it("never writes into a region that holds a page number", () => {
    // Page one's footer centre is plain text, page two's holds a page number: editing the text must not
    // paste over the number.
    const state = stateOf({
      pages: 2,
      headers: ["页眉", "页眉"],
      footerCentre: ["版本 A", ""],
      footerNumberPages: [1]
    });

    const { tr, state: edited } = type(state, slotTextPos(state.doc, "pageFooter", "center", 0), "注");
    // Nothing to sync: the only target slot that differs is locked.
    expect(planFurnitureSync(edited, touchedRanges(tr))).toBeNull();
  });

  it("does nothing for a single page, and nothing when no range touches furniture", () => {
    expect(planFurnitureSync(stateOf({ pages: 1, headers: ["页眉"] }), [{ from: 1, to: 2 }])).toBeNull();

    const state = stateOf({ pages: 2, headers: ["页眉", "页眉"] });
    // A range in the body, not in any band.
    expect(planFurnitureSync(state, [{ from: 40, to: 41 }])).toBeNull();
  });
});

describe("isFurnitureRegionLocked", () => {
  it("is true where a page number sits and false for a plain third", () => {
    const state = stateOf({ pages: 1, headers: ["页眉"], footerNumberPages: [0] });

    expect(isFurnitureRegionLocked(state, "bottom", "center")).toBe(true);
    expect(isFurnitureRegionLocked(state, "bottom", "left")).toBe(false);
    expect(isFurnitureRegionLocked(state, "top", "center")).toBe(false);
  });
});

describe("planFurnitureNormalisation", () => {
  it("does nothing to a well-formed band", () => {
    expect(planFurnitureNormalisation(stateOf({ pages: 2, headers: ["页眉", "页眉"] }))).toBeNull();
  });

  it("wraps a stray block into the centre third", () => {
    // A template written before regions existed: ordinary blocks directly in the header.
    const flat = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "page",
          content: [
            { type: "pageHeader", content: [block("老页眉")] },
            { type: "pageContent", content: [block("正文")] }
          ]
        }
      ]
    });
    const state = EditorState.create({ schema, doc: flat });

    const plan = planFurnitureNormalisation(state);
    expect(plan).not.toBeNull();
    expect(headerCentres(state.apply(plan!).doc)).toEqual(["老页眉"]);
  });
});

/** 第 `page` 页（0 起）`side` 条带中 `slot` 区域里第一个块的内容起点。 */
function slotTextPos(
  doc: PMNode,
  side: "pageHeader" | "pageFooter",
  slot: string,
  page: number
): number {
  let found = -1;
  let index = 0;

  doc.forEach((pageNode, offset) => {
    if (index !== page) {
      index += 1;
      return;
    }
    pageNode.forEach((child, childOffset) => {
      if (child.type.name !== side) return;
      const bandPos = offset + 1 + childOffset;
      child.forEach((regionNode, regionOffset) => {
        if (regionNode.type.name !== "pageRegion") return;
        if (regionNode.attrs.slot !== slot) return;
        // band > region > paragraph > text: two tokens down is inside the paragraph.
        found = bandPos + 1 + regionOffset + 2;
      });
    });
    index += 1;
  });

  expect(found, `${side} has a ${slot} region on page ${page + 1}`).toBeGreaterThanOrEqual(0);
  return found;
}

/** 在 `pos` 处插入文字，并交回事务与它的结果状态。 / Insert text at `pos`, returning the transaction and its result. */
function type(state: EditorState, pos: number, text: string): { tr: Transaction; state: EditorState } {
  const tr = state.tr.insertText(text, pos);
  return { tr, state: state.apply(tr) };
}

/** 每一页页脚节点的位置。 / Every footer node's position, page by page. */
function footerBandPositions(doc: PMNode): number[] {
  const found: number[] = [];
  doc.forEach((pageNode, offset) => {
    pageNode.forEach((child, childOffset) => {
      if (child.type.name === "pageFooter") found.push(offset + 1 + childOffset);
    });
  });
  return found;
}
