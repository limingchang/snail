/**
 * The header/footer click correction, tested without a browser.
 *
 * A freshly added band holds one empty paragraph. Clicking it (or its padding) does not always
 * resolve to a *text* position — there is no text to hit — so ProseMirror can answer with a
 * `NodeSelection` on the whole band. The user sees "the header cannot be edited": no caret,
 * typing replaces the band. {@link planFurnitureClick} is the rule that turns exactly that state
 * back into a caret, and it must never fire in any other state — otherwise it would fight
 * ProseMirror's own mapping, or steal a selection the user made on purpose.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import { planFurnitureClick } from "../../src/extensions/page/utils/furniture";
import {
  collectPages,
  findChild,
  PAGE_CONTENT_NODE,
  PAGE_FOOTER_NODE,
  PAGE_HEADER_NODE
} from "../../src/extensions/page/utils/nodes";

const schema = getSchema([createDocument(), Paragraph, Text, Page]);

function emptyBlock(): JSONContent {
  return { type: "paragraph" };
}

function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

function furniture(type: "pageHeader" | "pageFooter", content: JSONContent[]): JSONContent {
  return { type, content };
}

/** One page: body + header + footer, i.e. both bands present. */
function state(): EditorState {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "page",
        content: [
          furniture(PAGE_HEADER_NODE, [emptyBlock()]),
          { type: "pageContent", content: [block("正文")] },
          furniture(PAGE_FOOTER_NODE, [emptyBlock()])
        ]
      }
    ]
  };
  return EditorState.create({ schema, doc: schema.nodeFromJSON(content) });
}

/** The position before a band, which is what `view.posAtDOM(band, 0)` reports. */
function bandPos(current: EditorState, typeName: string): number {
  const band = findChild(collectPages(current.doc)[0], typeName);
  expect(band).not.toBeNull();
  return band!.pos;
}

describe("planFurnitureClick", () => {
  it("turns a node selection on the footer into a caret inside it", () => {
    const base = state();
    const pos = bandPos(base, PAGE_FOOTER_NODE);
    const selected = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, pos)));
    expect(selected.selection).toBeInstanceOf(NodeSelection);

    const tr = planFurnitureClick(selected, pos, PAGE_FOOTER_NODE);
    expect(tr).not.toBeNull();

    const next = selected.apply(tr!);
    expect(next.selection).toBeInstanceOf(TextSelection);
    // The caret is inside the band's paragraph — the state that makes typing work.
    expect(next.selection.$from.parent.type.name).toBe("paragraph");
    expect(next.selection.from).toBeGreaterThan(pos);
    expect(next.selection.from).toBeLessThan(pos + findChild(collectPages(next.doc)[0], PAGE_FOOTER_NODE)!.node.nodeSize);
  });

  it("does the same for the header", () => {
    const base = state();
    const pos = bandPos(base, PAGE_HEADER_NODE);
    const selected = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, pos)));

    const next = selected.apply(planFurnitureClick(selected, pos, PAGE_HEADER_NODE)!);
    expect(next.selection).toBeInstanceOf(TextSelection);
    expect(next.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("leaves a caret that is already inside the band alone", () => {
    const base = state();
    const pos = bandPos(base, PAGE_FOOTER_NODE);
    const inside = base.apply(
      base.tr.setSelection(TextSelection.near(base.doc.resolve(pos + 2)))
    );

    expect(planFurnitureClick(inside, pos, PAGE_FOOTER_NODE)).toBeNull();
  });

  it("does not steal a node selection the user made elsewhere", () => {
    const base = state();
    // The body paragraph: a node selection in the page content, while the click target would
    // still report the footer's position.
    const content = findChild(collectPages(base.doc)[0], PAGE_CONTENT_NODE)!;
    const selected = base.apply(
      base.tr.setSelection(NodeSelection.create(base.doc, content.pos + 1))
    );
    expect(selected.selection).toBeInstanceOf(NodeSelection);

    expect(planFurnitureClick(selected, bandPos(base, PAGE_FOOTER_NODE), PAGE_FOOTER_NODE)).toBeNull();
  });

  it("returns null for a position that is not a band of that type", () => {
    const base = state();
    const footer = bandPos(base, PAGE_FOOTER_NODE);
    const selected = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, footer)));

    expect(planFurnitureClick(selected, footer, PAGE_HEADER_NODE)).toBeNull();
    // Out of range: never throws.
    expect(planFurnitureClick(selected, base.doc.content.size, PAGE_FOOTER_NODE)).toBeNull();
  });
});
