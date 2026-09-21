/**
 * Placing a logo: which region it goes in, and what happens to the image on the way.
 *
 * The bug this file pins down is easy to miss by reading the code and impossible to miss in use:
 * moving a logo deletes the node and creates a new one in the target region, so unless the *existing*
 * node's attributes are carried over, "put it in the footer's left third" silently replaces the
 * picture with an empty `<img>`. The picture is the whole point of the node, and it lives in the
 * document — so a move must preserve `src`/`width`/`height` unless the caller supplies new ones.
 *
 * The commands are invoked through the extension's own config, the way Tiptap does it, so no DOM and
 * no editor instance is needed.
 */

import { getSchema } from "@tiptap/core";
import type { CommandProps, JSONContent } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createDocument } from "../../src/extensions/document";
import { Page, PageLogo } from "../../src/extensions/page";
import type { LogoAttributes, LogoPlacement } from "../../src/extensions/page";
import { collectPages } from "../../src/extensions/page/utils/nodes";
import { collectRegions, regionHoldsType, regionMap } from "../../src/extensions/page/utils/regions";

const schema = getSchema([createDocument(), Paragraph, Text, Heading, Page]);

const LOGO_SRC = "data:image/png;base64,AAAA";

function block(value: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text: value }] };
}

function emptyBlock(): JSONContent {
  return { type: "paragraph" };
}

function region(slot: string, content: JSONContent[] = [emptyBlock()]): JSONContent {
  return { type: "pageRegion", attrs: { slot }, content };
}

function logo(attrs: Record<string, unknown>): JSONContent {
  return { type: "pageLogo", attrs };
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

/** The extension's command object, built the way Tiptap builds it. */
function logoCommands(): {
  setLogo: (
    placement: LogoPlacement,
    attributes?: Partial<LogoAttributes>,
    pageIndex?: number
  ) => (props: CommandProps) => boolean;
  removeLogo: (pageIndex?: number) => (props: CommandProps) => boolean;
  setLogoSize: (
    attributes: Partial<LogoAttributes>,
    pageIndex?: number
  ) => (props: CommandProps) => boolean;
} {
  const factory = PageLogo.config.addCommands as unknown as (this: typeof PageLogo) => ReturnType<
    typeof logoCommands
  >;
  return factory.call(PageLogo);
}

/** Run one command against a state. */
function run(
  current: EditorState,
  build: (commands: ReturnType<typeof logoCommands>) => (props: CommandProps) => boolean
): { changed: boolean; state: EditorState } {
  const commands = logoCommands();
  const transaction = current.tr;
  let next = current;
  const props = {
    state: current,
    tr: transaction,
    dispatch: (dispatched: Transaction) => {
      next = current.apply(dispatched);
    }
  } as unknown as CommandProps;

  const changed = build(commands)(props);
  return { changed, state: changed ? next : current };
}

/** The logo node anywhere in a document. */
function anyLogo(document: PMNode): PMNode | null {
  let found: PMNode | null = null;
  document.descendants((node) => {
    if (node.type.name !== "pageLogo") return true;
    found = node;
    return false;
  });
  return found;
}

/** The slot the logo sits in, or `null`. */
function logoSlot(document: PMNode): string | null {
  for (const pageRef of collectPages(document)) {
    for (const side of ["top", "bottom"] as const) {
      const band = pageRef.children.find(
        (child) => child.node.type.name === (side === "top" ? "pageHeader" : "pageFooter")
      );
      if (!band) continue;
      // `findLogo` walks a *band* and hands back the region holding the node; here the regions are
      // already in hand, so the membership test is the direct one.
      for (const entry of collectRegions(band.node, band.pos)) {
        if (regionHoldsType(entry.node, "pageLogo")) return `${side}:${entry.slot}`;
      }
    }
  }
  return null;
}

describe("setLogo", () => {
  it("creates the band it is told to use and puts the image in that third", () => {
    const base = state(page(body(block("正文"))));

    const { changed, state: next } = run(base, (commands) =>
      commands.setLogo({ side: "top", slot: "left" }, { src: LOGO_SRC })
    );

    expect(changed).toBe(true);
    expect(logoSlot(next.doc)).toBe("top:left");
    expect(anyLogo(next.doc)?.attrs.src).toBe(LOGO_SRC);

    // The band it created is a complete one.
    const pageRef = collectPages(next.doc)[0];
    const band = pageRef.children.find((child) => child.node.type.name === "pageHeader")!;
    expect(collectRegions(band.node, band.pos)).toHaveLength(3);
  });

  it("keeps the image when the logo only moves", () => {
    const base = state(
      page(
        body(block("正文")),
        {
          type: "pageFooter",
          content: [
            region("left", [logo({ src: LOGO_SRC, width: "42mm", height: "auto" })]),
            region("center"),
            region("right")
          ]
        }
      )
    );

    const { changed, state: next } = run(base, (commands) =>
      commands.setLogo({ side: "bottom", slot: "right" })
    );

    expect(changed).toBe(true);
    expect(logoSlot(next.doc)).toBe("bottom:right");
    // …and the picture survived the move, with its size.
    const moved = anyLogo(next.doc);
    expect(moved?.attrs.src).toBe(LOGO_SRC);
    expect(moved?.attrs.width).toBe("42mm");

    // Exactly one logo: the move is a move, not a copy.
    let count = 0;
    next.doc.descendants((node) => {
      if (node.type.name === "pageLogo") count += 1;
      return true;
    });
    expect(count).toBe(1);
  });

  it("replaces the image when a new source is given for the same region", () => {
    const base = state(
      page(
        body(block("正文")),
        {
          type: "pageFooter",
          content: [region("left", [logo({ src: LOGO_SRC })]), region("center"), region("right")]
        }
      )
    );

    const next = run(base, (commands) =>
      commands.setLogo({ side: "bottom", slot: "left" }, { src: "data:image/png;base64,BBBB" })
    );

    expect(next.changed).toBe(true);
    expect(anyLogo(next.state.doc)?.attrs.src).toBe("data:image/png;base64,BBBB");
  });

  it("does nothing when the logo is already exactly there", () => {
    const base = state(
      page(
        body(block("正文")),
        {
          type: "pageFooter",
          content: [
            region("center", [logo({ src: LOGO_SRC, width: "30mm", height: "auto" })]),
            region("left"),
            region("right")
          ]
        }
      )
    );

    const result = run(base, (commands) => commands.setLogo({ side: "bottom", slot: "center" }));
    expect(result.changed).toBe(false);
  });
});

describe("setLogoSize and removeLogo", () => {
  it("resizes the placed logo", () => {
    const base = state(
      page(
        body(block("正文")),
        { type: "pageFooter", content: [region("left", [logo({ src: LOGO_SRC })]), region("center"), region("right")] }
      )
    );

    const { changed, state: next } = run(base, (commands) =>
      commands.setLogoSize({ width: "50mm" })
    );

    expect(changed).toBe(true);
    expect(anyLogo(next.doc)?.attrs.width).toBe("50mm");
    // The source is untouched by a resize.
    expect(anyLogo(next.doc)?.attrs.src).toBe(LOGO_SRC);
  });

  it("removes the logo, leaving the region usable", () => {
    const base = state(
      page(
        body(block("正文")),
        { type: "pageFooter", content: [region("left", [logo({ src: LOGO_SRC })]), region("center"), region("right")] }
      )
    );

    const { changed, state: next } = run(base, (commands) => commands.removeLogo());

    expect(changed).toBe(true);
    expect(anyLogo(next.doc)).toBeNull();
    // The region is empty at the command level: a paragraph is put back by the *plugin's* normaliser
    // on the next transaction (covered by `tests/page/regions.spec.ts`), not by this command.
    const pageRef = collectPages(next.doc)[0];
    const band = pageRef.children.find((child) => child.node.type.name === "pageFooter")!;
    expect(regionMap(collectRegions(band.node, band.pos)).left?.node.childCount).toBe(0);
  });

  it("returns `false` when there is nothing to remove", () => {
    const base = state(page(body(block("正文"))));
    expect(run(base, (commands) => commands.removeLogo()).changed).toBe(false);
  });
});
