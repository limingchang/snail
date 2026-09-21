import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";

import { createStarterDocument, STARTER_QR_TEXT } from "../../src/editor/starter";

/**
 * The starter document is a *fixture* the whole first-run experience depends on, and a
 * fixture that silently stops covering a node type is worse than no fixture: the docs demo
 * would quietly lose the table, or the QR code, and nobody would notice until a user did.
 *
 * These assertions are therefore structural — every node type the editor advertises has to
 * be present — rather than a snapshot, so adding a node to the document cannot invalidate
 * them and removing one cannot slip through.
 */

/** Every `type` in a document JSON tree. */
function typesOf(node: JSONContent | undefined, found: string[] = []): string[] {
  if (!node) return found;
  if (typeof node.type === "string") found.push(node.type);
  for (const child of node.content ?? []) typesOf(child, found);
  return found;
}

/** Every node with a given type, depth-first. */
function nodesOfType(node: JSONContent | undefined, type: string, found: JSONContent[] = []): JSONContent[] {
  if (!node) return found;
  if (node.type === type) found.push(node);
  for (const child of node.content ?? []) nodesOfType(child, type, found);
  return found;
}

describe("createStarterDocument", () => {
  it("is a `page+` document with exactly one page and a pageContent", () => {
    const doc = createStarterDocument();

    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]?.type).toBe("page");

    const bodies = doc.content?.[0]?.content ?? [];
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.type).toBe("pageContent");
    expect((bodies[0]?.content ?? []).length).toBeGreaterThan(5);
  });

  it("covers every node type the demo is supposed to show", () => {
    const types = typesOf(createStarterDocument());

    // The list the customer asked for: a main title, a second-level title, body text, a QR
    // code, a variable, a layout table and a normal table.
    for (const required of ["heading", "paragraph", "qrcode", "variable", "table", "tableRow", "tableCell"]) {
      expect(types, `starter document is missing a ${required}`).toContain(required);
    }

    expect(types).toContain("tableHeader");
  });

  it("has a level-1 and a level-2 heading", () => {
    const headings = nodesOfType(createStarterDocument(), "heading");
    const levels = headings.map((heading) => heading.attrs?.level);

    expect(levels).toContain(1);
    expect(levels).toContain(2);
  });

  it("marks the layout table and every one of its rows", () => {
    const tables = nodesOfType(createStarterDocument(), "table");
    const layout = tables.find((table) => table.attrs?.layoutMode === true);

    expect(layout, "expected one layout table").toBeDefined();

    const rows = layout?.content ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // The layout-mode extension reads the attribute on the table *and* on each row; a row
      // without it keeps the theme's cell borders and the "borderless" table is not one.
      expect(row.attrs?.layoutMode, "every layout-table row needs layoutMode").toBe(true);
    }

    // …and there is a normal, non-layout table as well.
    expect(tables.some((table) => table.attrs?.layoutMode !== true)).toBe(true);
  });

  it("carries a QR payload but no raster", () => {
    const [qrcode] = nodesOfType(createStarterDocument(), "qrcode");

    expect(qrcode?.attrs?.text).toBe(STARTER_QR_TEXT);
    // The bitmap is generated asynchronously and deliberately not baked into the fixture.
    expect(qrcode?.attrs?.src ?? "").toBe("");
  });

  it("declares variables with the types the fill dialog understands", () => {
    const variables = nodesOfType(createStarterDocument(), "variable");
    expect(variables.length).toBeGreaterThanOrEqual(2);

    for (const variable of variables) {
      expect(typeof variable.attrs?.key).toBe("string");
      expect(typeof variable.attrs?.label).toBe("string");
      // The type *is* the discriminant of the configuration, so a variable without one is a
      // variable the resolver cannot render.
      expect(typeof variable.attrs?.data?.type).toBe("string");
    }

    // Both renderings of the same amount are present, which is the point of the pair.
    const money = variables.filter((variable) => variable.attrs?.data?.type === "money");
    expect(money.some((variable) => variable.attrs?.data?.chineseUppercase === true)).toBe(true);
    expect(money.some((variable) => variable.attrs?.data?.chineseUppercase !== true)).toBe(true);
  });

  it("returns a flat block document for a single-page editor", () => {
    const doc = createStarterDocument({ multiPage: false });

    // Feeding a `page` to a `block+` document is rejected by ProseMirror, so the shape has to
    // follow the top node.
    expect(typesOf(doc)).not.toContain("page");
    expect(typesOf(doc)).toContain("paragraph");
  });

  it("centres the title and flushes each clause number left", () => {
    const headings = nodesOfType(createStarterDocument(), "heading");
    const [title] = headings.filter((heading) => heading.attrs?.level === 1);
    const clauses = headings.filter((heading) => heading.attrs?.level === 2);

    expect(title?.attrs?.textAlign).toBe("center");
    // An explicit zero, so a heading cannot inherit a first-line indent from the stylesheet.
    expect(title?.attrs?.textIndent).toBe("0");

    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause.attrs?.textAlign).toBe("left");
    }
  });

  it("indents the first line of prose by two characters and puts a variable in that paragraph", () => {
    const paragraphs = nodesOfType(createStarterDocument(), "paragraph");

    // The paragraph that holds a variable is the one the toolbar's indent control must show
    // "2 字符" for; if the fixture stopped indenting it, the docs demo would show a paragraph
    // whose indent control reads "not set" while the document looks indented.
    const withVariable = paragraphs.find((paragraph) =>
      (paragraph.content ?? []).some((child) => child.type === "variable")
    );

    expect(withVariable, "expected a paragraph containing a variable").toBeDefined();
    expect(withVariable?.attrs?.textIndent).toBe("2em");
    expect(withVariable?.attrs?.textAlign).toBe("justify");

    // The QR caption is centred and not indented — the contrast is deliberate.
    const caption = paragraphs.find((paragraph) =>
      (paragraph.content ?? []).some((child) => child.text?.includes("二维码"))
    );
    expect(caption?.attrs?.textAlign).toBe("center");
    expect(caption?.attrs?.textIndent).toBe("0");

    // A table cell is not prose: indenting one would push the text out of a narrow column.
    for (const cell of nodesOfType(createStarterDocument(), "tableCell")) {
      for (const paragraph of cell.content ?? []) {
        expect(paragraph.attrs?.textIndent ?? null).toBeNull();
      }
    }
  });

  it("carries the legacy typography as `textStyle` marks", () => {
    const doc = createStarterDocument();
    const [title] = nodesOfType(doc, "heading");

    const marks = title?.content?.[0]?.marks ?? [];
    expect(marks.map((mark) => mark.type)).toContain("bold");

    const titleStyle = marks.find((mark) => mark.type === "textStyle");
    expect(titleStyle?.attrs?.fontSize).toBe("18pt");

    // Body prose is 14pt/28pt Song, the same roles the legacy template used.
    const body = nodesOfType(doc, "paragraph").find((paragraph) =>
      paragraph.content?.some((child) => child.marks?.some((mark) => mark.type === "textStyle"))
    );
    const bodyStyle = body?.content
      ?.flatMap((child) => child.marks ?? [])
      .find((mark) => mark.type === "textStyle");
    expect(bodyStyle?.attrs?.fontSize).toBe("14pt");
  });

  it("honours the title and QR overrides", () => {
    const doc = createStarterDocument({ title: "秘密协议", qrText: "https://example.com" });

    const [heading] = nodesOfType(doc, "heading");
    expect(heading?.content?.[0]?.text).toBe("秘密协议");

    const [qrcode] = nodesOfType(doc, "qrcode");
    expect(qrcode?.attrs?.text).toBe("https://example.com");
  });
});
