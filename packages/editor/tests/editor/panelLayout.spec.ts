/**
 * 面板与控件的排布 —— 钉在源码上。
 *
 * 中文：这一组断言覆盖的是那些「只有眼睛能看出来」的修复里、可以用文字守住的部分：页面页签里几个
 * 下拉的宽度与分组顺序、插入页签里变量与二维码是一列而不是一行、二维码只提供 mm/cm、字体颜色与
 * 背景色的字符 A 控件、二维码在设计模式是手型而填写模式是箭头、变量徽标左侧不再有空隙。要读计算
 * 样式需要真实浏览器，本套件没有，所以读的是源码。
 *
 * Panel and control layout — pinned at the source.
 *
 * What these assertions cover is the part of the eye-level fixes that text can hold: the widths and the
 * group order of the page tab's selects, the insert pane's variable-and-QR column, the mm/cm-only unit
 * list, the capital-"A" colour controls, the QR code's hand cursor in design mode versus the arrow in
 * fill mode, and the variable badge's tightened left side. Reading computed styles would need a real
 * browser, so these read the source instead.
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

/**
 * 去掉注释的源码：对声明做断言时必须先剥掉注释，否则散文里的「position:」也会被匹配到。
 *
 * Source with its comments removed: a declaration assertion has to strip comments first, or prose that
 * happens to contain `position:` is matched as if it were a declaration.
 */
function declarations(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the page tab", () => {
  const page = source("components/tools/ToolPage.vue");

  it("gives every select an explicit width instead of Element Plus's 100%", () => {
    // Both placement selects (page number and logo) share one class, and the format select has its
    // own; without a width they stretch across the pane.
    const placement = page.match(/class="s-tool-page__placement"/g) ?? [];
    expect(placement).toHaveLength(2);
    expect(page).toContain("&__placement {");
    expect(page).toContain("width: 120px");
    expect(page).toContain("&__page-number {");
    expect(page).toContain("width: 140px");
  });

  it("bounds the margins and the header/footer groups with a vertical divider on their right", () => {
    const sections = page.match(/class="s-tool-page__section"/g) ?? [];
    expect(sections, "there are two bounded groups").toHaveLength(2);

    // Each divider is the last child of its section, so it wraps together with the group it closes
    // and can never be left alone on a line.
    const dividers = page.match(/<el-divider direction="vertical" class="s-tool-page__divider" \/>/g) ?? [];
    expect(dividers).toHaveLength(2);
    expect(/<div class="s-tool-page__section">[\s\S]*?<\/div>\s*<\/div>/.test(page)).toBe(true);
    for (const section of page.split('class="s-tool-page__section"').slice(1)) {
      expect(section.slice(0, section.indexOf("</div>\n    </div>"))).toContain("s-tool-page__divider");
    }
  });

  it("puts the header/footer group and the page-number + logo groups after the margins", () => {
    const margins = page.indexOf("t.page.margins");
    const bandHeight = page.indexOf("t.page.headerFooterHeight");
    const pageNumber = page.indexOf("t.page.pageNumber");
    const logo = page.indexOf("t.page.logo");

    for (const later of [bandHeight, pageNumber, logo]) {
      expect(later).toBeGreaterThan(margins);
    }
    expect(pageNumber).toBeGreaterThan(bandHeight);
  });
});

describe("the insert pane", () => {
  const insert = source("components/tools/ToolInsert.vue");

  it("stacks the variable and the QR code in one column rather than one row", () => {
    // Both buttons live in the pane's first group, and that group is the column variant.
    const group = insert.slice(insert.indexOf('class="s-tool-insert__group'));
    expect(group.slice(0, group.indexOf("</div>"))).toContain("--column");
    expect(group.indexOf("insertVariable")).toBeLessThan(group.indexOf("insertQrcode"));
  });

  it("asks the host for the QR options once a code was inserted", () => {
    expect(insert).toContain('emits("insertQrcode")');
    // Only after the command was accepted: a refused insertion opens nothing.
    expect(insert.indexOf("if (!accepted)")).toBeLessThan(insert.indexOf('emits("insertQrcode")'));
  });
});

describe("the QR code's units and cursor", () => {
  it("offers millimetres and centimetres only", () => {
    const constants = source("components/tools/constants.ts");
    const list = constants.slice(constants.indexOf("export const QRCODE_UNITS"));
    expect(list).toContain('value: "mm"');
    expect(list).toContain('value: "cm"');
    expect(list).not.toContain('value: "px"');
  });

  it("is a hand in design mode and the default arrow in fill mode", () => {
    const base = source("theme/base.scss");
    const qr = base.indexOf(".s-editor-qrcode,");
    expect(qr).toBeGreaterThanOrEqual(0);
    expect(base.slice(qr, base.indexOf("\n}", qr))).toContain("cursor: pointer");

    const fill = base.indexOf("&.s-editor-fill .s-editor-qrcode,");
    expect(fill, "the fill-mode override must exist").toBeGreaterThan(qr);
    expect(base.slice(fill, base.indexOf("\n}", fill))).toContain("cursor: default");
  });
});

describe("the two colour controls", () => {
  const font = source("components/tools/ToolFont.vue");

  it("is a real button-shaped tree: an A plus one coloured bar", () => {
    // The report's requirement, verbatim: the "A" and the coloured rectangle are *elements*, not a
    // pseudo-element hung on Element Plus's trigger.
    const swatches = font.match(/class="s-tool-font__swatch"/g) ?? [];
    expect(swatches, "both variants carry a swatch layer").toHaveLength(2);
    expect((font.match(/class="s-tool-font__glyph">A</g) ?? []).length).toBe(2);
    expect((font.match(/class="s-tool-font__bar"/g) ?? []).length).toBe(2);
    // `data-color` makes the value readable off the DOM, and the inline style is what paints it.
    expect((font.match(/:data-color="/g) ?? []).length).toBe(2);
    expect(font).toContain(":style=\"{ backgroundColor:");
  });

  it("defaults to black ink and a white block, and follows the picked colour", () => {
    // Black for the text bar and white for the background block, or a white block under a black "A"
    // would be invisible.
    expect(font).toContain('const DEFAULT_TEXT_COLOR = "#000000"');
    expect(font).toContain('const DEFAULT_BACKGROUND_COLOR = "#ffffff"');
    expect(font).toContain("color || DEFAULT_TEXT_COLOR");
    expect(font).toContain("backgroundColor || DEFAULT_BACKGROUND_COLOR");
  });

  it("covers Element Plus's own trigger instead of styling it", () => {
    // The picker keeps the click, the focus and the panel; everything visible belongs to us, so no
    // Element Plus internal (its swatch, its caret, its `empty` **close icon**) can leak through.
    expect(font).toContain("class=\"s-tool-font__color-input\"");
    expect(font).toContain("&-input {");
    expect(font).toMatch(/&-input \{[^}]*opacity: 0/);
    // The visible layer must never take the click away from the picker on top of it.
    expect(font).toMatch(/&__swatch \{[^}]*pointer-events: none/);
    // …and the invisible control still shows where the keyboard is.
    expect(font).toContain("&:focus-within &__swatch");
    // No rule depends on the trigger's children or pseudo-elements any more.
    expect(font).not.toContain("el-color-picker__trigger");
  });
});

describe("the template tab", () => {
  const template = source("components/tools/ToolTemplate.vue");
  const toolbar = source("components/EditorToolbar.vue");

  it("is the first section, before 格式, and carries no extension gate", () => {
    const ribbon = toolbar.slice(toolbar.indexOf("const RIBBON"));
    expect(ribbon.indexOf('name: "template"')).toBeGreaterThanOrEqual(0);
    expect(ribbon.indexOf('name: "template"')).toBeLessThan(ribbon.indexOf('name: "font"'));
    // `extensions: []` is what makes `tools` its only gate: the pipeline is not an extension.
    expect(ribbon.slice(ribbon.indexOf('name: "template"'), ribbon.indexOf('name: "font"'))).toContain(
      "extensions: []"
    );
    // …and the empty list is honoured by the gate itself.
    expect(toolbar).toContain("section.extensions.length === 0");
  });

  it("offers the remote list and 新建 in design mode, and the local template in fill mode", () => {
    // Design mode is the `v-if` half…
    expect(template).toContain('v-if="design"');
    expect(template).toContain('@click="emits(\'refresh\')"');
    expect(template).toContain('@click="emits(\'create\')"');
    // …with the list only when a remote list is configured, and a hint instead of an empty picker.
    expect(template).toContain('<TemplatePicker');
    expect(template).toContain(':items="items"');
    expect(template).toContain("t.template.noSource");
    // Fill mode is the other half: one button, loading the template saved on this machine.
    expect(template).toContain('@click="emits(\'pick-local\')"');
    expect(template).toContain("t.template.localHint");
  });

  it("is in the default set, last, so the watermark tab is reachable without naming it", () => {
    const typings = source("typings/editor.ts");
    const list = typings.slice(typings.indexOf("export const DEFAULT_TOOLS"));
    const array = list.slice(list.indexOf("= ["), list.indexOf("];"));
    const entries = array.match(/"[a-z]+"/g) ?? [];

    expect(entries).toContain('"template"');
    expect(entries).toContain('"watermark"');
    // First is the template tab; last is the watermark: the two ends the report asked for.
    expect(entries[0]).toBe('"template"');
    expect(entries[entries.length - 1]).toBe('"watermark"');
  });

  it("is hidden in fill mode once the remote template is configured", () => {
    const editor = source("editor/SEditor.vue");
    expect(editor).toContain("const fillTemplateTab = computed(");
    const fill = editor.slice(editor.indexOf("const fillTemplateTab"));
    expect(fill.slice(0, fill.indexOf(");"))).toContain("!isRemoteSource(props.template)");
    // The ribbon renders in fill mode only for that one tab, and only that tab is passed on.
    expect(editor).toContain("showToolbar && (mode === 'design' || fillTemplateTab)");
    expect(editor).toContain('mode.value === "design" ? (props.tools ?? DEFAULT_TOOLS) : ["template"]');
  });

  it("loads the locally saved template from the same slot the save wrote to", () => {
    const editor = source("editor/SEditor.vue");
    const pick = editor.slice(editor.indexOf("function pickLocalTemplate"));
    expect(pick).toContain("readStoredTemplate(");
    // A local `save` target wins, so the two halves cannot point at different keys.
    expect(pick).toContain('props.save?.kind === "local" ? props.save : { kind: "local" }');
  });
});

describe("the watermark tab", () => {
  const pane = source("components/tools/ToolWatermark.vue");

  it("carries an enable switch and the settings the report asked for", () => {
    // 开关 + 文字 + 角度 + 透明度, plus the two optional renderers.
    expect(pane).toContain('<el-switch v-model="state.enabled" />');
    expect(pane).toContain("t.watermark.text");
    expect(pane).toContain('v-model="state.angle"');
    expect(pane).toContain("t.watermark.opacity");
    expect(pane).toContain("<el-slider");
    expect(pane).toContain("t.watermark.greyscale");
    expect(pane).toContain("t.watermark.tiled");
  });

  it("defaults to the documented 45° mark instead of a blank, upright one", () => {
    const settings = source("extensions/watermark/settings.ts");
    expect(settings).toContain("export const WATERMARK_DEFAULT_ANGLE = -45");
    expect(settings).toContain('export const WATERMARK_DEFAULT_TEXT = "水印"');
    // The extension starts from those two constants, so a fresh editor shows the mark at once.
    const extension = source("extensions/watermark/index.ts");
    expect(extension).toContain("text: WATERMARK_DEFAULT_TEXT");
    expect(extension).toContain("angle: WATERMARK_DEFAULT_ANGLE");
  });
});

describe("the header and footer bands", () => {
  it("explains a locked region, and syncs a band edit across every page", () => {
    const editor = source("editor/SEditor.vue");
    // A double-click into a region holding a page number or a logo has to say why nothing happens.
    expect(editor).toContain("onLockedFurniture:");
    expect(editor).toContain("t.value.page.lockedRegionHint");

    // The page extension registers both page-level plugins: normalise the structure, then keep every page's
    // copy of what the user edited, and route a locked double-click to the host.
    const page = source("extensions/page/page.ts");
    expect(page).toContain("createFurnitureRegionsPlugin()");
    expect(page).toContain("createFurnitureSyncPlugin()");
    expect(page).toContain("onLockedRegion: (region) => this.options.onLockedFurniture?.(region)");
  });

  it("never lets the paginator move content while a table column is being dragged", () => {
    // The drag remembers an absolute position and applies it on `mouseup`; a pagination pass in between is
    // what made that position stale and left the resize plugin stuck.
    const paginator = source("extensions/page/pageContent/paginator.ts");
    expect(paginator).toContain("isDraggingColumn(view)");
    expect(paginator).toContain("COLUMN_RESIZE_DRAGGING_CLASS");
  });
});

describe("the variable badge", () => {
  const base = source("theme/base.scss");

  it("does not leave a hole in front of the name", () => {
    const start = base.indexOf(".s-editor-variable {");
    expect(start).toBeGreaterThanOrEqual(0);
    const badge = base.slice(start, base.indexOf("\n    }", start));
    expect(badge).toContain("margin: 0 2px");
    expect(badge).toContain("padding: 2px 5px");
    /**
     * The real cause of "a lot of blank space on the left": `text-indent` is inherited, and the badge
     * is an inline-block, so a clause's `text-indent: 2em` indented the variable's *own* first line.
     * Padding could never have explained 2em.
     */
    expect(badge).toContain("text-indent: 0");
    // A badge that starts a line needs no gap on its left at all.
    expect(base).toContain("&[data-first-inline=\"true\"]");
    expect(base).toContain("margin-left: 0");
  });

  it("is plain text in fill mode: no background, the paragraph's own colour and size", () => {
    // The rule has to sit *after* the per-type table, because both selectors have the same
    // specificity and the later one wins.
    const fill = base.lastIndexOf('&[data-variable-mode="fill"] {');
    const lastType = base.lastIndexOf('&[data-variable-key-source="inner"] {');
    expect(fill, "the fill-mode rule must exist").toBeGreaterThan(lastType);

    const rule = base.slice(fill, base.indexOf("\n    }", fill));
    expect(rule).toContain("color: inherit");
    expect(rule).toContain("background-color: transparent");
    // The badge is a 0.8em *label* in design mode; in fill mode the value is prose, so its size and line
    // height have to come from the paragraph too — otherwise a contract number is visibly smaller.
    expect(rule).toContain("font-size: inherit");
    expect(rule).toContain("line-height: inherit");
    // The one state that keeps a muted colour: filled, then cleared, which paints (未填写).
    expect(rule).toContain('&[data-variable-painted="empty"]');
    expect(rule).toContain("--el-text-color-placeholder");
  });

  it("paints the hover tip in the variable's own colour, left-aligned and separated", () => {
    const tip = base.slice(base.indexOf(".s-editor-variable-tip {"));
    expect(tip).toContain("background-color: var(--se-variable-surface");
    // `text-align` is inherited, so a variable in a centred heading used to centre its own tip.
    expect(tip).toContain("text-align: left");
    // The three rows are distinct fields, separated by a line rather than by a measured gap.
    expect(tip).toContain("border-top: 1px solid rgb(255 255 255 / 28%)");
    // Every type publishes the surface the tip reuses.
    expect((base.match(/--se-variable-surface: var\(--se-variable-/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });
});

describe("the QR code's page-relative coordinates", () => {
  it("leaves nothing between the page and the code positioned, so the page is the containing block", () => {
    const page = source("extensions/page/style/page.scss");
    // Comments stripped: prose that contains "position:" must not be read as a declaration.
    const css = declarations(page);
    // Neither the body nor its inner wrapper may be a containing block *with padding*: a browser resolves an
    // absolutely positioned descendant against the content edge of the containing block, so a padded
    // containing block folds the page margin into the code's position.
    expect(css).not.toMatch(/\.s-editor-page-content-inner\s*\{[^}]*position:/);
    const content = css.slice(css.indexOf(".s-editor-page-content {"));
    expect(content.slice(0, content.indexOf("}")), "the positioned body box must not be padded").not.toContain(
      "padding:"
    );
    // The sheet itself is positioned, which is what makes it the one the QR resolves against.
    expect(css).toMatch(/\.s-editor-page-inner\s*\{[^}]*position:\s*relative/);

    /**
     * …and the theme's own rule has to except the inner wrapper, which is the one that actually broke it:
     * `.s-editor-page-content > *` used to give *every* direct child `position: relative`, and the wrapper's
     * left edge sits on the body's *content* edge — 20 mm inside the sheet. The QR's `left: 10mm` then
     * landed at "margin + 10mm" while the CSS asserted here looked correct.
     */
    const base = source("theme/base.scss");
    expect(base).toContain("> *:not(.s-editor-page-content-inner)");
    expect(base).not.toMatch(/> \*\s*\{[^}]*position: relative/);

    // …and the margins themselves live on the *inner* wrapper, so the positioned outer element carries no
    // padding at all: its content edge and its padding edge are then the same line, and the origin is the
    // sheet whichever of the two the browser takes for the containing block.
    const inner = declarations(page).slice(css.indexOf(".s-editor-page-content-inner {"));
    expect(inner.slice(0, inner.indexOf("}"))).toContain("padding:");
  });

  it("rasterises a code that has a payload but no raster when the document opens", () => {
    const extension = source("extensions/qrcode/index.ts");
    // `onCreate` is the fix for "the demo shows a broken image until 更新 is pressed".
    expect(extension).toMatch(/onCreate\(\) \{[\s\S]*?generateAndApply\(/);
    expect(extension).toContain("attrs.src.length > 0 || attrs.text.trim().length === 0");
    // …and the write re-finds the node after the await instead of giving up on a stale offset.
    expect(extension).toContain("resolveQRCodePosition(editor.state, pos, attrs.text)");
  });
});
