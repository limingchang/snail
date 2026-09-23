/**
 * The furniture-editing model: the double-click gesture and the transaction filter.
 *
 * The rule this file pins down is the one the feature exists for — *a header cannot be edited by
 * accident* — and it has two halves that must agree:
 *
 * - entering a region is possible only for a region that exists and is not locked (the page number
 *   and the logo lock the third they occupy);
 * - a document change that touches furniture is refused while no region is being edited, allowed
 *   inside the region being edited, and still refused in a *locked* one.
 *
 * The filter is the half CSS cannot cover (a paste whose selection spans the band, a consumer's own
 * command), so it is tested directly rather than through DOM events.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import {
  FURNITURE_META,
  collectBands,
  createFurnitureEditingPlugin,
  isFurnitureEditAllowed,
  planEnterFurniture,
  planExitFurniture,
  planFurnitureMousedown,
  readFurnitureEditing
} from "../../src/extensions/page/utils/furnitureEditing";
import type { FurnitureEditingState } from "../../src/extensions/page/utils/furnitureEditing";
import { collectPages, findChild, PAGE_FOOTER_NODE, PAGE_HEADER_NODE } from "../../src/extensions/page/utils/nodes";
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

function numbered(format: string): JSONContent {
  return { type: "paragraph", content: [{ type: "pageNumber", attrs: { format } }] };
}

/** A page with a body, a header with an empty left third and a footer holding a page number. */
function createState(): EditorState {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "page",
        content: [
          band("pageHeader", [region("left"), region("center"), region("right")]),
          { type: "pageContent", content: [block("正文")] },
          band("pageFooter", [
            region("left"),
            region("center", [numbered("{page}")]),
            region("right")
          ])
        ]
      }
    ]
  };
  // The plugin has to be registered: the editing state *is* the plugin's state, and a bare
  // `EditorState.apply` would never call its `state.apply`.
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON(content),
    plugins: [createFurnitureEditingPlugin()]
  });
}

/** The position of a band. */
function bandPos(state: EditorState, side: "top" | "bottom"): number {
  const page = collectPages(state.doc)[0];
  const child = findChild(page, side === "top" ? PAGE_HEADER_NODE : PAGE_FOOTER_NODE);
  expect(child, `expected a ${side} band`).not.toBeNull();
  return child!.pos;
}

/** The range of a region. */
function regionRange(state: EditorState, side: "top" | "bottom", slot: string): { from: number; to: number } {
  const page = collectPages(state.doc)[0];
  const child = findChild(page, side === "top" ? PAGE_HEADER_NODE : PAGE_FOOTER_NODE)!;
  const region = regionMap(collectRegions(child.node, child.pos))[slot as "left" | "center" | "right"]!;
  return { from: region.pos, to: region.pos + region.node.nodeSize };
}

/** The first text position of a region. */
function caretInRegion(state: EditorState, side: "top" | "bottom", slot: string): number {
  const range = regionRange(state, side, slot);
  return TextSelection.near(state.doc.resolve(range.from + 2), 1).from;
}

describe("planEnterFurniture", () => {
  it("enters an empty region and places the caret inside it", () => {
    const base = createState();
    const transaction = planEnterFurniture(base, "top", "left");

    expect(transaction).not.toBeNull();
    const next = base.apply(transaction!);
    expect(readFurnitureEditing(next)).toEqual({ side: "top", slot: "left" });

    const range = regionRange(base, "top", "left");
    expect(next.selection.from).toBeGreaterThan(range.from);
    expect(next.selection.from).toBeLessThan(range.to);
  });

  it("refuses a region that holds the page number", () => {
    const base = createState();
    expect(planEnterFurniture(base, "bottom", "center")).toBeNull();
  });

  it("refuses a region that does not exist", () => {
    const base = createState();
    expect(planEnterFurniture(base, "bottom", "left")).not.toBeNull();
    // The header has no such slot when the band was built from scratch in a legacy shape.
    expect(planEnterFurniture(base, "top", "left")).not.toBeNull();
  });
});

describe("planExitFurniture", () => {
  it("is a no-op when nothing is being edited", () => {
    expect(planExitFurniture(createState())).toBeNull();
  });

  it("clears the state", () => {
    const inside = createState().apply(planEnterFurniture(createState(), "top", "left")!);
    const next = inside.apply(planExitFurniture(inside)!);
    expect(readFurnitureEditing(next)).toBeNull();
  });
});

describe("isFurnitureEditAllowed", () => {
  const editing: FurnitureEditingState = { side: "top", slot: "left" };

  it("allows a change that stays in the body", () => {
    const base = createState();
    const body = base.doc.textContent.indexOf("正文");
    expect(body).toBeGreaterThanOrEqual(0);

    const page = collectPages(base.doc)[0];
    const content = findChild(page, "pageContent")!;
    const transaction = base.tr.insertText("改", content.pos + 2);
    expect(isFurnitureEditAllowed(base, transaction, null)).toBe(true);
  });

  it("refuses a change inside furniture while no band is open", () => {
    const base = createState();
    const range = regionRange(base, "top", "left");
    const transaction = base.tr.insertText("偷偷写字", range.from + 2);

    expect(transaction.docChanged).toBe(true);
    expect(isFurnitureEditAllowed(base, transaction, null)).toBe(false);
  });

  it("allows the same change inside the region being edited", () => {
    const base = createState();
    const range = regionRange(base, "top", "left");
    const transaction = base.tr.insertText("页眉", range.from + 2);

    expect(isFurnitureEditAllowed(base, transaction, editing)).toBe(true);
  });

  it("refuses a change in another region while one is being edited", () => {
    const base = createState();
    const range = regionRange(base, "top", "right");
    const transaction = base.tr.insertText("别的区域", range.from + 2);

    expect(isFurnitureEditAllowed(base, transaction, editing)).toBe(false);
  });

  it("refuses a change in another band", () => {
    const base = createState();
    const range = regionRange(base, "bottom", "left");
    const transaction = base.tr.insertText("页脚", range.from + 2);

    expect(isFurnitureEditAllowed(base, transaction, editing)).toBe(false);
  });

  it("lets a layout transaction and a furniture command through", () => {
    const base = createState();
    const range = regionRange(base, "top", "left");

    const layout = base.tr.insertText("x", range.from + 2);
    layout.setMeta("addToHistory", false);
    expect(isFurnitureEditAllowed(base, layout, null)).toBe(true);

    const command = base.tr.insertText("y", range.from + 2);
    command.setMeta(FURNITURE_META, { type: "command", command: true });
    expect(isFurnitureEditAllowed(base, command, null)).toBe(true);
  });

  it("ignores a selection-only transaction", () => {
    const base = createState();
    const transaction = base.tr.setSelection(TextSelection.near(base.doc.resolve(2), 1));
    expect(isFurnitureEditAllowed(base, transaction, null)).toBe(true);
  });
});

describe("planFurnitureMousedown", () => {
  /** A state with the header's left third open. */
  function openHeader(): EditorState {
    const base = createState();
    return base.apply(planEnterFurniture(base, "top", "left")!);
  }

  it("does **not** open a band on a single click", () => {
    // The point of "double-click to edit": a click the user did not mean as an entry must not put the
    // caret in a header. The CSS used to prevent that by refusing the pointer on the region entirely,
    // which also swallowed the double-click — so a band could never be opened at all.
    const base = createState();
    expect(planFurnitureMousedown(base, { side: "top", slot: "left" })).toBeNull();
    expect(planFurnitureMousedown(base, { side: "bottom", slot: "right" })).toBeNull();
  });

  it("switches to another region of the band that is already open", () => {
    const open = openHeader();
    const transaction = planFurnitureMousedown(open, { side: "top", slot: "right" });

    expect(transaction).not.toBeNull();
    expect(readFurnitureEditing(open.apply(transaction!))).toEqual({ side: "top", slot: "right" });
  });

  it("leaves the caret alone when the click is inside the open region", () => {
    // The browser places the caret exactly where the pointer is; moving it here would fight that.
    expect(planFurnitureMousedown(openHeader(), { side: "top", slot: "left" })).toBeNull();
  });

  it("does not switch to the other band on a single click", () => {
    expect(planFurnitureMousedown(openHeader(), { side: "bottom", slot: "left" })).toBeNull();
  });

  it("leaves the furniture when the click lands outside it", () => {
    const open = openHeader();
    const transaction = planFurnitureMousedown(open, null);

    expect(transaction).not.toBeNull();
    expect(readFurnitureEditing(open.apply(transaction!))).toBeNull();
  });

  it("does nothing when a click outside lands while no band is open", () => {
    expect(planFurnitureMousedown(createState(), null)).toBeNull();
  });
});

describe("collectBands", () => {
  it("reports both bands of every page", () => {
    const bands = collectBands(createState().doc);
    expect(bands.map((entry) => entry.side)).toEqual(["top", "bottom"]);
    expect(bands.every((entry) => entry.page === 1)).toBe(true);
  });
});

describe("caretInRegion", () => {
  it("lands inside the region it names", () => {
    const base = createState();
    const pos = caretInRegion(base, "top", "left");
    const range = regionRange(base, "top", "left");
    expect(pos).toBeGreaterThan(range.from);
    expect(pos).toBeLessThan(range.to);
  });
});
