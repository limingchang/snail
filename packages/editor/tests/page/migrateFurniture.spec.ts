/**
 * The migration that keeps a template written before the three-region furniture openable.
 *
 * Two shapes need it, and they fail differently — which is why this is a document-level migration
 * rather than a schema rule:
 *
 * - a **page-level logo** makes the old document *invalid* for the new page content expression
 *   (`pageHeader? pageContent pageFooter?`), so without this the template would not open at all;
 * - a **flat band** is legal but unstyled, and the last moment its `align` attribute can still say
 *   which third its text belonged in is here — at runtime the hint is gone.
 */

import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { migrateFurnitureContent, migrateFurnitureDocument } from "../../src/extensions/page/utils/migrateFurniture";

function paragraph(value?: string): JSONContent {
  return value === undefined
    ? { type: "paragraph" }
    : { type: "paragraph", content: [{ type: "text", text: value }] };
}

function number(format: string): JSONContent {
  return { type: "pageNumber", attrs: { format } };
}

function doc(...content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function page(...content: JSONContent[]): JSONContent {
  return { type: "page", content };
}

function body(...content: JSONContent[]): JSONContent {
  return { type: "pageContent", content };
}

/** The region slots of a band, in order. */
function slotsOf(band: JSONContent): string[] {
  return (band.content ?? []).map((child) => String(child.attrs?.slot ?? ""));
}

/** The band of a type in a page. */
function bandOf(pageNode: JSONContent, type: string): JSONContent | undefined {
  return (pageNode.content ?? []).find((child) => child.type === type);
}

describe("migrateFurnitureDocument", () => {
  it("returns the same object when there is nothing to migrate", () => {
    const content = doc(
      page(
        body(paragraph("正文")),
        {
          type: "pageFooter",
          content: [
            { type: "pageRegion", attrs: { slot: "left" }, content: [paragraph()] },
            { type: "pageRegion", attrs: { slot: "center" }, content: [paragraph()] },
            { type: "pageRegion", attrs: { slot: "right" }, content: [paragraph()] }
          ]
        }
      )
    );

    expect(migrateFurnitureDocument(content)).toBe(content);
    expect(migrateFurnitureContent(content).migrated).toBe(false);
  });

  it("reorders a page saved with the footer before the header", () => {
    // The first version of this rebuild inserted both bands at `page.pos + 1`, which produced
    // exactly this: a footer above a header, i.e. a page that is not a document.
    const content = doc(
      page(
        { type: "pageFooter", content: [paragraph()] },
        body(paragraph("正文")),
        { type: "pageHeader", content: [paragraph()] }
      )
    );

    const result = migrateFurnitureContent(content);
    expect(result.migrated).toBe(true);

    const types = (result.content.content?.[0]?.content ?? []).map((child) => child.type);
    expect(types).toEqual(["pageHeader", "pageContent", "pageFooter"]);
  });

  it("moves a page-level logo into the third its legacy position names", () => {
    const content = doc(
      page(
        body(paragraph("正文")),
        {
          type: "pageLogo",
          attrs: { src: "data:image/png;base64,AAA", width: "30mm", height: "auto", position: "right", offsetX: 3, offsetY: 4 }
        }
      )
    );

    const { content: migrated, migrated: changed } = migrateFurnitureContent(content);
    expect(changed).toBe(true);

    const pageNode = migrated.content?.[0]!;
    // A band had to be created for it, and the page no longer has a `pageLogo` child of its own.
    expect((pageNode.content ?? []).map((child) => child.type)).toEqual(["pageHeader", "pageContent"]);

    const header = bandOf(pageNode, "pageHeader")!;
    expect(slotsOf(header)).toEqual(["left", "center", "right"]);

    const right = (header.content ?? []).find((child) => child.attrs?.slot === "right")!;
    const logo = (right.content ?? []).find((child) => child.type === "pageLogo")!;
    expect(logo.attrs?.src).toBe("data:image/png;base64,AAA");
    // The offsets are gone: a region has nothing to offset from.
    expect(logo.attrs?.position).toBeUndefined();
    expect(logo.attrs?.offsetX).toBeUndefined();
  });

  it("keeps a logo in the header that already exists", () => {
    const content = doc(
      page(
        { type: "pageHeader", content: [paragraph("页眉文字")] },
        body(paragraph("正文")),
        { type: "pageLogo", attrs: { src: "data:image/png;base64,AAA", position: "center" } }
      )
    );

    const pageNode = migrateFurnitureDocument(content).content?.[0]!;
    const header = bandOf(pageNode, "pageHeader")!;
    expect(slotsOf(header)).toEqual(["left", "center", "right"]);

    const centre = (header.content ?? []).find((child) => child.attrs?.slot === "center")!;
    expect((centre.content ?? []).some((child) => child.type === "pageLogo")).toBe(true);
    // The legacy header text is still there, in the third its `align` defaulted to.
    expect(JSON.stringify(header)).toContain("页眉文字");
  });

  it("turns a flat band into three regions, honouring the legacy alignment", () => {
    // The legacy header defaulted to right-aligned, which is where its page number appeared.
    const content = doc(
      page(
        body(paragraph("正文")),
        {
          type: "pageHeader",
          attrs: { align: "right" },
          content: [paragraph(), number("{page}")]
        }
      )
    );

    const pageNode = migrateFurnitureDocument(content).content?.[0]!;
    const header = bandOf(pageNode, "pageHeader")!;
    expect(slotsOf(header)).toEqual(["left", "center", "right"]);

    const right = (header.content ?? []).find((child) => child.attrs?.slot === "right")!;
    expect(JSON.stringify(right)).toContain("pageNumber");
  });

  it("folds a duplicated region into its slot instead of dropping the content", () => {
    const content = doc(
      page(
        body(paragraph("正文")),
        {
          type: "pageFooter",
          content: [
            { type: "pageRegion", attrs: { slot: "center" }, content: [paragraph("一")] },
            { type: "pageRegion", attrs: { slot: "center" }, content: [paragraph("二")] }
          ]
        }
      )
    );

    const pageNode = migrateFurnitureDocument(content).content?.[0]!;
    const footer = bandOf(pageNode, "pageFooter")!;
    expect(slotsOf(footer)).toEqual(["left", "center", "right"]);

    const centre = (footer.content ?? []).find((child) => child.attrs?.slot === "center")!;
    const text = JSON.stringify(centre);
    expect(text).toContain("一");
    expect(text).toContain("二");
  });
});
