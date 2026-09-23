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
 * ## 2. The colour controls are Word's "A", drawn as markup
 *
 * `el-color-picker` has no trigger slot, so its own trigger is used as an invisible layer and the "A"
 * plus its coloured bar are elements this component owns. A regression here is silent too: the control
 * still works, it just stops looking like the thing it does — and Element Plus's `empty` marker (a
 * *close icon*) reappears the moment the invisible layer stops covering it.
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

  it("draws the A and the coloured bar as elements, one pair per variant", () => {
    // A real tree — `swatch > (glyph "A", bar)` — not a pseudo-element on the picker's trigger.
    expect((font.match(/class="s-tool-font__glyph">A</g) ?? []).length).toBe(2);
    expect((font.match(/class="s-tool-font__bar"/g) ?? []).length).toBe(2);
    // The bar's colour is the model value (or its default) written as an inline style.
    expect(font).toContain(":style=\"{ backgroundColor: color || DEFAULT_TEXT_COLOR }\"");
    expect(font).toContain(":style=\"{ backgroundColor: backgroundColor || DEFAULT_BACKGROUND_COLOR }\"");
    // The two variants differ only in where the bar sits.
    expect(font).toContain("&__color--text &__bar");
    expect(font).toContain("&__color--background {");
  });

  it("is the same size as Element Plus's small trigger, so no pixel is dead", () => {
    // The invisible picker only opens its panel when the click lands on its own trigger, and EP's
    // `--small` trigger is 24×24 filling its root. A control of the same size cannot leave an edge
    // where a click hits the picker's root instead and nothing happens.
    expect(font).toMatch(/&__color \{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/);
    expect(font).toMatch(/&__color \{[\s\S]*?flex: none;/);
    // The visible layer must never take the click away from the picker on top of it.
    expect(font).toMatch(/&__swatch \{[\s\S]*?pointer-events: none/);
  });

  it("hides every Element Plus element by covering the whole control", () => {
    // The layer fills the control, so nothing of EP's trigger can show through anywhere.
    expect(font).toMatch(/&-input \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?opacity: 0/);
    // A visible focus ring: the real control is invisible, so it has to come from the layer below.
    expect(font).toContain("&:focus-within &__swatch");
  });

  it("defaults to black for text and white for the highlight block", () => {
    // Black is what "no colour chosen" means for text; a white block for the highlight, because a
    // black block under a black glyph is invisible.
    expect(font).toContain('const DEFAULT_TEXT_COLOR = "#000000";');
    expect(font).toContain('const DEFAULT_BACKGROUND_COLOR = "#ffffff";');
    // Those two defaults reach both the inline style and `data-color`.
    expect((font.match(/:data-color="/g) ?? []).length).toBe(2);
  });

  it("binds every visible part to the picked colour, with the default as the fallback", () => {
    // Two controls, two style bindings and two data attributes — and no `transparent` fallback,
    // which is what once left both controls looking dead.
    expect((font.match(/:style="\{ backgroundColor:/g) ?? []).length).toBe(2);
    expect(font).not.toContain("transparent'");
    expect(font).not.toContain("--s-tool-color-value");
  });
});
