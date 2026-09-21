/**
 * The page-number planner, tested without a browser.
 *
 * Three operations, three plans, and each one has a state a naive implementation gets wrong:
 *
 * - **a format** chosen on a document whose footer is empty has nothing to write to — the number
 *   has to be *created*, and in the default placement, because picking a format is how a user asks
 *   for a number;
 * - **a placement** has to *move* the number rather than add a second one, and it has to keep the
 *   text the user chose while doing it;
 * - **a removal** has to leave the region usable again — a region with no block cannot be clicked
 *   into, and the normaliser in `utils/furniture.ts` is what puts the paragraph back (the
 *   `planBandRegions` test covers that half).
 *
 * The number is an **inline** node, so every assertion about *where* it went also checks that it is
 * inside a paragraph: a region's content is `block*`, and an inline node placed directly in one
 * would be an invalid document.
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
import type { PageChildRef, PageRef } from "../../src/extensions/page/utils/nodes";
import {
  DEFAULT_PAGE_NUMBER_PLACEMENT,
  placedSlot,
  planPageNumberFormat,
  planPageNumberPlacement,
  planPageNumberRemoval
} from "../../src/extensions/page/utils/pageNumberFormat";
import { collectRegions, regionMap } from "../../src/extensions/page/utils/regions";

const schema = getSchema([createDocument(), Paragraph, Text, Heading, Page]);

function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

function emptyBlock(): JSONContent {
  return { type: "paragraph" };
}

function region(slot: string, content: JSONContent[] = [emptyBlock()]): JSONContent {
  return { type: "pageRegion", attrs: { slot }, content };
}

function band(type: "pageHeader" | "pageFooter", content: JSONContent[]): JSONContent {
  return { type, content };
}

function number(format: string): JSONContent {
  return { type: PAGE_NUMBER_NODE, attrs: { format } };
}

function numbered(format: string): JSONContent {
  return { type: "paragraph", content: [number(format)] };
}

function page(...children: JSONContent[]): JSONContent {
  return { type: "page", content: children };
}

function body(...content: JSONContent[]): JSONContent {
  return { type: "pageContent", content };
}

function doc(...pages: JSONContent[]): JSONContent {
  return { type: "doc", content: pages };
}

function state(content: JSONContent): EditorState {
  return EditorState.create({ schema, doc: schema.nodeFromJSON(content) });
}

/** The band of a page, by side. */
function bandOf(pageRef: PageRef, side: "top" | "bottom"): PageChildRef | null {
  return findChild(pageRef, side === "top" ? PAGE_HEADER_NODE : PAGE_FOOTER_NODE);
}

/** The region of a band, by slot. */
function regionOf(pageRef: PageRef, side: "top" | "bottom", slot: string) {
  const band = bandOf(pageRef, side);
  expect(band, `expected a ${side} band`).not.toBeNull();
  const found = regionMap(collectRegions(band!.node, band!.pos))[slot as "left" | "center" | "right"];
  expect(found, `expected a ${slot} region`).toBeDefined();
  return found!;
}

/** The page number inside a region. */
function numberInRegion(pageRef: PageRef, side: "top" | "bottom", slot: string): PMNode | null {
  const region = regionOf(pageRef, side, slot);
  let found: PMNode | null = null;
  region.node.descendants((child) => {
    if (child.type.name !== PAGE_NUMBER_NODE) return true;
    found = child;
    return false;
  });
  return found;
}

/** Every page number in a document. */
function allNumbers(document: PMNode): PMNode[] {
  const found: PMNode[] = [];
  document.descendants((node) => {
    if (node.type.name === PAGE_NUMBER_NODE) found.push(node);
    return true;
  });
  return found;
}

describe("planPageNumberFormat", () => {
  it("creates the number in the default placement when the page has no furniture at all", () => {
    const base = state(doc(page(body(block("正文")))));
    const format = "第 {page} 页 / 共 {total} 页";

    const next = base.apply(planPageNumberFormat(base, format)!);
    const pageRef = collectPages(next.doc)[0];

    // The footer did not exist; asking for a number is what creates it.
    expect(numberInRegion(pageRef, "bottom", DEFAULT_PAGE_NUMBER_PLACEMENT.slot)?.attrs.format).toBe(
      format
    );
    expect(allNumbers(next.doc)).toHaveLength(1);

    // Inline node, so inside a paragraph — never a direct child of the region.
    const centre = regionOf(pageRef, "bottom", "center").node;
    expect(centre.firstChild?.type.name).toBe("paragraph");
    expect(centre.firstChild?.firstChild?.type.name).toBe(PAGE_NUMBER_NODE);
  });

  it("re-formats every existing number without moving it", () => {
    const base = state(
      doc(
        page(
          body(block("正文")),
          band("pageFooter", [region("left"), region("right", [numbered("第{page}页")])])
        )
      )
    );

    const next = base.apply(planPageNumberFormat(base, "# / &")!);
    const pageRef = collectPages(next.doc)[0];

    expect(allNumbers(next.doc)).toHaveLength(1);
    expect(numberInRegion(pageRef, "bottom", "right")?.attrs.format).toBe("# / &");
  });

  it("does nothing when every number already reads that way", () => {
    const base = state(
      doc(page(body(block("正文")), band("pageFooter", [region("center", [numbered("{page}")])])))
    );
    expect(planPageNumberFormat(base, "{page}")).toBeNull();
  });

  it("numbers every page in one transaction, in the default placement", () => {
    const base = state(
      doc(
        page(body(block("一")), band("pageFooter", [region("left"), region("center"), region("right")])),
        page(body(block("二")), band("pageFooter", [region("left"), region("center"), region("right")])),
        page(body(block("三")), band("pageFooter", [region("left"), region("center"), region("right")]))
      )
    );

    const next = base.apply(planPageNumberFormat(base, "{page}")!);
    const pages = collectPages(next.doc);
    expect(pages).toHaveLength(3);
    for (const pageRef of pages) {
      expect(numberInRegion(pageRef, "bottom", "center")).not.toBeNull();
    }
    expect(allNumbers(next.doc)).toHaveLength(3);
    // The bodies are untouched, which is what proves the positions were applied last-to-first.
    expect(next.doc.textContent).toContain("一二三");
  });
});

describe("planPageNumberPlacement", () => {
  it("moves the number to another region and keeps its format", () => {
    const base = state(
      doc(page(body(block("正文")), band("pageFooter", [region("center", [numbered("第{page}页")])])))
    );

    const next = base.apply(planPageNumberPlacement(base, { side: "bottom", slot: "left" })!);
    const pageRef = collectPages(next.doc)[0];

    expect(allNumbers(next.doc)).toHaveLength(1);
    expect(numberInRegion(pageRef, "bottom", "left")?.attrs.format).toBe("第{page}页");
    expect(numberInRegion(pageRef, "bottom", "center")).toBeNull();
  });

  it("creates the band it is told to use", () => {
    const base = state(doc(page(body(block("正文")))));

    const next = base.apply(planPageNumberPlacement(base, { side: "top", slot: "right" })!);
    const pageRef = collectPages(next.doc)[0];

    expect(numberInRegion(pageRef, "top", "right")).not.toBeNull();
    const band = bandOf(pageRef, "top")!;
    expect(collectRegions(band.node, band.pos)).toHaveLength(3);
  });

  it("does nothing when the page already has it exactly there", () => {
    const base = state(
      doc(page(body(block("正文")), band("pageFooter", [region("center", [numbered("{page}")])])))
    );
    expect(planPageNumberPlacement(base, { side: "bottom", slot: "center" })).toBeNull();
  });

  it("reports where a number sits", () => {
    const base = state(
      doc(page(body(block("正文")), band("pageHeader", [region("left", [numbered("{page}")])])))
    );
    expect(placedSlot(collectPages(base.doc)[0])).toEqual({ side: "top", slot: "left" });
    expect(placedSlot(collectPages(state(doc(page(body(block("无"))))).doc)[0])).toBeNull();
  });
});

describe("planPageNumberRemoval", () => {
  it("removes the number from its region", () => {
    const base = state(
      doc(page(body(block("正文")), band("pageFooter", [region("center", [numbered("{page}")])])))
    );

    const next = base.apply(planPageNumberRemoval(base)!);
    expect(allNumbers(next.doc)).toHaveLength(0);
  });

  it("returns null when there is nothing to remove", () => {
    const base = state(doc(page(body(block("正文")))));
    expect(planPageNumberRemoval(base)).toBeNull();
  });
});
