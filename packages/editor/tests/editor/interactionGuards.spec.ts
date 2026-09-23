// @vitest-environment happy-dom
/**
 * The two guards around long-lived pointer / IME interactions.
 *
 * ## 1. A table column drag must be able to end
 *
 * `prosemirror-tables` remembers the column it is dragging in its plugin state and clears that state from a
 * `mouseup` listener on `window` — *after* it has written the new width to the document. That write works
 * from an absolute position captured at `mousedown`, so when our pagination moved content in between it
 * throws, and where it throws is before the state is cleared. The drag is then stuck forever: no second
 * resize can start and the resize cursor stays on the table.
 *
 * ## 2. An IME composition must not be interrupted
 *
 * The regions normaliser replaces a band's children whole. Doing that while the user's IME is composing
 * cancels the composition, and what the user typed lands as pinyin instead of Chinese. So the normaliser
 * carries a "composing" flag and defers until `compositionend`.
 */

import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { columnResizing, columnResizingPluginKey } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page } from "../../src/extensions/page";
import {
  COLUMN_RESIZE_DRAGGING_CLASS,
  endUnfinishedResize,
  hasUnfinishedResize,
  isDraggingColumn
} from "../../src/extensions/table/resizeGuard";
import {
  createFurnitureRegionsPlugin,
  FURNITURE_COMPOSITION_META,
  furnitureRegionsPluginKey
} from "../../src/extensions/page/utils/furniture";

const schema = getSchema([
  createDocument(),
  Paragraph,
  Text,
  Heading,
  Page,
  Table,
  TableRow,
  TableCell,
  TableHeader
]);

/** A cell holding one paragraph. / One table cell with a paragraph in it. */
function cell(value: string): JSONContent {
  return { type: "tableCell", content: [block(value)] };
}

/** A one-page document with a two-column table in the body. */
function tableDocument(): PMNode {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "page",
        content: [
          { type: "pageHeader", content: [block("页眉")] },
          {
            type: "pageContent",
            content: [
              block("正文"),
              {
                type: "table",
                content: [
                  { type: "tableRow", content: [cell("甲"), cell("乙")] },
                  { type: "tableRow", content: [cell("1"), cell("2")] }
                ]
              }
            ]
          }
        ]
      }
    ]
  });
}

function block(value: string): JSONContent {
  return { type: "paragraph", content: value === "" ? [] : [{ type: "text", text: value }] };
}

/** A one-page document whose header holds a *stray* block, i.e. a band the normaliser has work to do on. */
function flatBandDocument(): PMNode {
  return schema.nodeFromJSON({
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
}

/** Whether the header still holds a stray block instead of three regions. */
function headerIsFlat(doc: PMNode): boolean {
  let flat = false;
  doc.forEach((page) => {
    page.forEach((child) => {
      if (child.type.name !== "pageHeader") return;
      flat = child.childCount === 1 && child.child(0).type.name === "paragraph";
    });
  });
  return flat;
}

/** 该状态是否正在输入法组合中。 / Whether that state is mid-composition. */
function furnitureComposing(state: EditorState): boolean {
  return (furnitureRegionsPluginKey.getState(state) as { composing?: boolean } | undefined)?.composing === true;
}

describe("the IME composition gate on the regions normaliser", () => {
  const plugins = [createFurnitureRegionsPlugin()];

  it("normalises a malformed band on an ordinary document change", () => {
    const state = EditorState.create({ schema, doc: flatBandDocument(), plugins });
    const after = state.apply(state.tr.insertText("字", state.doc.content.size - 2));

    expect(headerIsFlat(after.doc)).toBe(false);
  });

  it("defers the normalisation while a composition is in flight, and runs it on `compositionend`", () => {
    const state = EditorState.create({ schema, doc: flatBandDocument(), plugins });

    // The IME takes over: a transaction carrying only the flag, exactly what the plugin dispatches from
    // `compositionstart`.
    const composing = state.apply(state.tr.setMeta(FURNITURE_COMPOSITION_META, true));

    // The user's composing text arrives while the band is still malformed: the normaliser must not act, since
    // replacing the band would cancel the composition.
    const during = composing.apply(composing.tr.insertText("拼", composing.doc.content.size - 2));
    expect(headerIsFlat(during.doc)).toBe(true);

    // `compositionend` clears the flag — and the composition's own commit is a document change, which is
    // exactly what lets the deferred normalisation run now.
    const ended = during.apply(during.tr.setMeta(FURNITURE_COMPOSITION_META, false));
    expect(furnitureComposing(ended)).toBe(false);

    const committed = ended.apply(ended.tr.insertText("中", ended.doc.content.size - 2));
    expect(headerIsFlat(committed.doc)).toBe(false);
  });
});

describe("the stuck column-resize guard", () => {
  /** A state holding the table extension's `columnResizing` plugin, so its state shape is the real one. */
  function resizeState(): EditorState {
    return EditorState.create({
      schema,
      doc: tableDocument(),
      plugins: [columnResizing({})]
    });
  }

  it("reports a drag that is in flight and one that never finished", () => {
    const state = resizeState();
    expect(hasUnfinishedResize(state)).toBe(false);

    const dragging = state.apply(
      state.tr.setMeta(columnResizingPluginKey, { setDragging: { startX: 10, startWidth: 100 } })
    );
    expect(hasUnfinishedResize(dragging)).toBe(true);
  });

  it("clears a drag the table plugin failed to clear, and leaves a healthy state alone", () => {
    const state = resizeState();
    let current = state;
    const view = {
      isDestroyed: false,
      get state() {
        return current;
      },
      dispatch: (tr: Parameters<EditorState["apply"]>[0]) => {
        current = current.apply(tr);
      }
    } as unknown as EditorView;

    // Nothing was dragging: the guard must not dispatch anything.
    expect(endUnfinishedResize(view)).toBe(false);

    current = state.apply(
      state.tr.setMeta(columnResizingPluginKey, { setDragging: { startX: 10, startWidth: 100 } })
    );
    expect(endUnfinishedResize(view)).toBe(true);
    expect(hasUnfinishedResize(current)).toBe(false);
  });

  it("recognises the class the table plugin puts on the cells of a dragged column", () => {
    const dom = document.createElement("div");
    const view = { dom } as unknown as EditorView;

    expect(isDraggingColumn(view)).toBe(false);
    dom.innerHTML = `<table><tr class="${COLUMN_RESIZE_DRAGGING_CLASS}"><td>x</td></tr></table>`;
    expect(isDraggingColumn(view)).toBe(true);
    dom.innerHTML = "<table><tr><td>x</td></tr></table>";
    expect(isDraggingColumn(view)).toBe(false);
  });
});
