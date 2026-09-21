/**
 * The two Element Plus integration rules that are invisible until they break.
 *
 * ## 1. An overlay that leaves the editor's scope loses its palette
 *
 * Element Plus teleports popovers, dropdown panels, colour panels and dialogs into a
 * `<body>`-level container. Those elements are therefore **not** descendants of `.s-editor-scope`,
 * and every `--se-*` token the editor's CSS relies on resolves to nothing inside them. CSS treats
 * `border: 1px solid var(--missing)` as *invalid at computed-value time* — the whole declaration is
 * dropped — so the table-insertion grid shipped with no cell borders and no hover highlight, which
 * is exactly the bug this pins down.
 *
 * The fix has two halves and both are asserted here: the palette is available at `:root` (so any
 * teleported panel inherits the private `--se-*` values), and the editor's own overlays opt into
 * `.s-editor-popper` for the Element Plus tokens as well.
 *
 * ## 2. The colour controls are Word's "A", drawn as CSS
 *
 * `el-color-picker` has no trigger slot, so an SVG icon could only be shown by overlaying an
 * invisible picker. The "A" is therefore a pseudo-element on the picker's *own* trigger, and the
 * picked colour reaches it through one custom property. A regression here is silent too: the
 * control still works, it just stops looking like the thing it does.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));

/** Read a source file of the package. */
function source(relativePath: string): string {
  return readFileSync(join(sourceRoot, relativePath), "utf8");
}

describe("Element Plus overlays keep the editor's palette", () => {
  it("publishes the private palette at `:root`, so a teleported panel inherits it", () => {
    const variables = source("theme/variables.scss");

    // The palette is a mixin with two entry points: the editor's own scope, and `:root` for the
    // panels Element Plus moves out of it.
    expect(variables).toContain("@mixin editor-palette");
    expect(variables).toContain(":root {");
    expect(variables).toMatch(/:root\s*\{\s*@include editor-palette;/);

    // The Element Plus tokens stay scoped: they cascade into every component on the page, and
    // publishing those globally would restyle the consumer's application.
    expect(variables).toContain("@mixin editor-element-tokens");
    expect(variables).toMatch(/\.s-editor-scope\s*\{[^}]*@include editor-element-tokens;/s);
    expect(variables).toMatch(/\.s-editor-popper\s*\{[^}]*@include editor-element-tokens;/s);
  });

  it("gives the table-insertion popovers the popper class", () => {
    const table = source("components/tools/ToolTable.vue");

    // Two popovers: the normal grid and the layout grid. Matched as an *attribute line*, because
    // the file also mentions the class by name in the comment that explains why it is needed.
    const popperClasses = table.match(/^\s*popper-class="s-editor-popper"/gm) ?? [];
    expect(popperClasses).toHaveLength(2);

    // The width is derived from the cell size rather than hard-coded: the old panel asked for
    // 220px around a 135px grid and left 85px of empty space on the right.
    expect(table).toContain("const CELL_SIZE = 18;");
    expect(table).toContain("POPOVER_WIDTH");
    expect(table).not.toContain(':width="220"');
  });

  it("gives the colour panels the popper class", () => {
    const font = source("components/tools/ToolFont.vue");
    const popperClasses = font.match(/popper-class="s-editor-popper"/g) ?? [];
    expect(popperClasses).toHaveLength(2);
  });
});

describe("the colour controls are Word's capital A", () => {
  const font = source("components/tools/ToolFont.vue");

  it("draws the A on the picker's own trigger, with a bar and a block variant", () => {
    expect(font).toContain("--s-tool-color-value");
    expect(font).toContain("--s-tool-color-glyph");
    expect(font).toContain("&--text");
    expect(font).toContain("&--background");

    // The glyph itself, and the bar the text colour fills.
    expect(font).toMatch(/content: "A";/);
    expect(font).toContain("background-color: var(--s-tool-color-value);");
  });

  it("hides *every* Element Plus element inside the trigger", () => {
    // Hiding a hand-picked list is what shipped a cross: Element Plus renders an `empty` marker for
    // "no colour", and it was not on the list. The whole subtree goes.
    expect(font).toMatch(/:deep\(\.el-color-picker__trigger\)\s*\{[^}]*>\s*\*\s*\{[^}]*display:\s*none/s);
    expect(font).not.toContain(".el-color-picker__color)");
  });

  it("defaults to black for text and white for the highlight block", () => {
    // Black is what "no colour chosen" means for text; a white block for the highlight, because a
    // black block under a black glyph is invisible.
    expect(font).toContain("--s-tool-color-value: #000000;");
    expect(font).toContain("--s-tool-color-glyph: #000000;");
    expect(font).toMatch(/&--background\s*\{[^}]*--s-tool-color-value: #ffffff;/s);
  });

  it("binds the picked colour to the trigger, and only when there is one", () => {
    // One binding per picker, and no `|| 'transparent'`: writing the property for "not set" would
    // override the stylesheet's defaults and leave both controls looking dead.
    const bindings = font.match(/'--s-tool-color-value': /g) ?? [];
    expect(bindings).toHaveLength(2);
    expect(font).toContain(":style=\"color ? { '--s-tool-color-value': color } : undefined\"");
    expect(font).not.toContain("transparent'");
  });
});
