/**
 * The region model of a header or footer: normalisation, locking and the slot vocabulary.
 *
 * These rules are what the whole three-region design rests on, and they are pure — so they are
 * tested against real ProseMirror nodes without a browser:
 *
 * - a band is *always* three usable regions, whatever shape it arrived in (that is what repairs a
 *   template saved before regions existed);
 * - a region holding the page number or the logo is **locked**, and the search is recursive because
 *   the page number is inline (it lives inside a paragraph) while the logo is a block.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import { collectPages, findChild, PAGE_FOOTER_NODE } from "../../src/extensions/page/utils/nodes";
import type { PageChildRef } from "../../src/extensions/page/utils/nodes";
import {
  collectRegions,
  createRegionNodes,
  findPageNumber,
  planBandRegions,
  regionIsLocked,
  regionMap
} from "../../src/extensions/page/utils/regions";

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
  return { type: "pageNumber", attrs: { format } };
}

function page(...children: JSONContent[]): JSONContent {
  return { type: "page", content: children };
}

function body(...content: JSONContent[]): JSONContent {
  return { type: "pageContent", content };
}

function state(...pages: JSONContent[]): EditorState {
  return EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: pages }) });
}

/** The footer band of the first page, with its position. */
function footerBand(document: EditorState["doc"]): PageChildRef {
  const page = collectPages(document)[0];
  const band = findChild(page, PAGE_FOOTER_NODE);
  expect(band, "expected a footer").not.toBeNull();
  return band!;
}

/** Apply a band plan to a state. */
function applyPlan(current: EditorState, plan: NonNullable<ReturnType<typeof planBandRegions>>): EditorState {
  return current.apply(current.tr.replaceWith(plan.from, plan.to, plan.content));
}

describe("createRegionNodes", () => {
  it("builds the three slots in order, each with a paragraph", () => {
    const nodes = createRegionNodes(schema);
    expect(nodes?.map((node) => node.attrs.slot)).toEqual(["left", "center", "right"]);
    for (const node of nodes ?? []) expect(node.childCount).toBe(1);
  });
});

describe("planBandRegions", () => {
  it("wraps a flat band's content into the centre region and adds the other two", () => {
    const base = state(page(body(block("正文")), band("pageFooter", [block("甲方：")])));
    const footer = footerBand(base.doc);

    const plan = planBandRegions(footer.node, footer.pos);
    expect(plan).not.toBeNull();

    const next = applyPlan(base, plan!);
    const regions = collectRegions(footerBand(next.doc).node, footerBand(next.doc).pos);
    expect(regions.map((entry) => entry.slot)).toEqual(["left", "center", "right"]);

    // The legacy text is not lost — it is in the centre third.
    const centre = regionMap(regions).center!;
    expect(centre.node.textContent).toContain("甲方：");
    // …and the thirds that were invented start usable rather than empty.
    expect(regionMap(regions).left!.node.childCount).toBe(1);
  });

  it("keeps a legacy page number in the centre third, inside its paragraph", () => {
    const base = state(
      page(
        body(block("正文")),
        band("pageFooter", [{ type: "paragraph", content: [number("第{page}页")] }])
      )
    );
    const footer = footerBand(base.doc);

    const next = applyPlan(base, planBandRegions(footer.node, footer.pos)!);
    // A number written before regions existed had no slot, so it belongs in the middle — and a
    // page number is *inline*, so it must still be inside a paragraph after the move. Its label is
    // painted by the node view, so there is no text to assert on: the structure is the evidence.
    const centre = regionMap(collectRegions(footerBand(next.doc).node, footerBand(next.doc).pos)).center!.node;
    expect(centre.firstChild?.type.name).toBe("paragraph");
    expect(centre.firstChild?.firstChild?.type.name).toBe("pageNumber");
    expect(centre.firstChild?.firstChild?.attrs.format).toBe("第{page}页");
  });

  it("folds a duplicated slot into the first region and reorders", () => {
    const base = state(
      page(
        body(block("正文")),
        band("pageFooter", [region("right", [block("右")]), region("center", [block("中")]), region("center", [block("重复")])])
      )
    );
    const footer = footerBand(base.doc);

    const next = applyPlan(base, planBandRegions(footer.node, footer.pos)!);
    const regions = collectRegions(footerBand(next.doc).node, footerBand(next.doc).pos);
    expect(regions.map((entry) => entry.slot)).toEqual(["left", "center", "right"]);

    const centre = regionMap(regions).center!;
    expect(centre.node.textContent).toContain("中");
    expect(centre.node.textContent).toContain("重复");
    expect(regionMap(regions).right!.node.textContent).toContain("右");
  });

  it("gives an emptied region a paragraph, so it stays clickable", () => {
    const base = state(
      page(body(block("正文")), band("pageFooter", [region("left", []), region("center"), region("right")]))
    );
    const footer = footerBand(base.doc);

    const next = applyPlan(base, planBandRegions(footer.node, footer.pos)!);
    const regions = collectRegions(footerBand(next.doc).node, footerBand(next.doc).pos);
    for (const entry of regions) expect(entry.node.childCount).toBeGreaterThan(0);
  });

  it("is idempotent: a complete band plans nothing", () => {
    const base = state(
      page(body(block("正文")), band("pageFooter", [region("left"), region("center"), region("right")]))
    );
    const footer = footerBand(base.doc);
    expect(planBandRegions(footer.node, footer.pos)).toBeNull();
  });
});

describe("locking", () => {
  it("locks a region holding a page number inside a paragraph", () => {
    const base = state(
      page(
        body(block("正文")),
        band("pageFooter", [
          region("left"),
          region("center", [{ type: "paragraph", content: [number("{page}")] }]),
          region("right")
        ])
      )
    );
    const footer = footerBand(base.doc);
    const regions = regionMap(collectRegions(footer.node, footer.pos));

    expect(regionIsLocked(regions.center!.node)).toBe(true);
    expect(regionIsLocked(regions.left!.node)).toBe(false);
    expect(regionIsLocked(regions.right!.node)).toBe(false);
  });

  it("locks a region holding a logo, which is a block", () => {
    const base = state(
      page(
        body(block("正文")),
        band("pageFooter", [
          region("left", [{ type: "pageLogo", attrs: { src: "data:image/png;base64,AAA", width: "30mm", height: "auto" } }]),
          region("center"),
          region("right")
        ])
      )
    );
    const footer = footerBand(base.doc);
    const regions = regionMap(collectRegions(footer.node, footer.pos));

    expect(regionIsLocked(regions.left!.node)).toBe(true);
    expect(regionIsLocked(regions.center!.node)).toBe(false);
  });

  it("finds a page number wherever in the band it sits", () => {
    const base = state(
      page(
        body(block("正文")),
        band("pageFooter", [
          region("left"),
          region("center"),
          region("right", [{ type: "paragraph", content: [{ type: "text", text: "第 " }, number("#"), { type: "text", text: " 页" }] }])
        ])
      )
    );
    const footer = footerBand(base.doc);
    const found = findPageNumber(footer.node, footer.pos);

    expect(found).not.toBeNull();
    expect(found!.region.slot).toBe("right");
    expect(found!.node.attrs.format).toBe("#");
  });
});
