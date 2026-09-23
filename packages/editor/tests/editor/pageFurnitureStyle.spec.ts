/**
 * 页眉页脚压在正文之上 —— 钉在样式源码上。
 *
 * 中文：这一组样式修的是三个看得见的缺陷。开启页眉后，正文的上边距变成了「页面边距 + 页眉高度」，
 * 因为页眉与正文一起参与流布局；`s-editor-page-furniture-content` 没有撑满，三个区域够不到带子的
 * 右边缘；未打开的区域把点击也吞了，于是页眉永远进不去。三者都只住在
 * `extensions/page/style/page.scss` 里，所以这里读的就是它。要问计算样式就需要真实浏览器，而本套件
 * 没有。
 *
 * The header and footer painted over the body — pinned at the style source.
 *
 * This group of rules closes three visible defects: with a header enabled the body's top margin read
 * as "page margin + header height", because the band shared the flow with the body; the
 * `s-editor-page-furniture-content` was not full width, so the three regions never reached the band's
 * right edge; and an unopened region swallowed the click too, so a band could never be entered. All
 * three live in `extensions/page/style/page.scss`, which is what these assertions read; the computed
 * style would need a real browser and this suite has none.
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

/** The block `selector { … }` starts at, up to the first closing brace that follows it. */
function blockAfter(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `the rule for ${selector} must exist`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

describe("the header and footer bands", () => {
  const page = source("extensions/page/style/page.scss");

  it("are painted over the margins instead of sharing the flow with the body", () => {
    const bands = blockAfter(page, ".s-editor-page-header,\n.s-editor-page-footer");
    expect(bands).toContain("position: absolute");
    // Left and right are pinned so the band spans the sheet; the vertical edge is per band.
    expect(bands).toContain("left: 0");
    expect(bands).toContain("right: 0");
    // The vertical edge is per band, and the rule has to be the standalone one: the shared selector
    // above ends with the same `{`, and later rules reuse the same selector for other properties.
    expect(/\n\.s-editor-page-header\s*\{[^}]*top:\s*0/.test(page)).toBe(true);
    expect(/\n\.s-editor-page-footer\s*\{[^}]*bottom:\s*0/.test(page)).toBe(true);
  });

  it("lets the body own the whole sheet, with the margins on the wrapper inside it", () => {
    const content = blockAfter(page, ".s-editor-page-content {");
    expect(content).toContain("height: 100%");
    // The margins are **not** this element's padding: it is positioned, and a browser resolves an absolutely
    // positioned descendant against its *content* edge, which would fold the margin into the QR code's
    // position. They live one level down, on an element that is not a containing block.
    expect(content).not.toContain("padding:");

    const inner = blockAfter(page, ".s-editor-page-content-inner {");
    expect(inner).toContain("height: 100%");
    expect(inner).toContain("padding:");
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(inner).toContain(`var(--snail-page-margin-${side},`);
    }
    // Absolute bands need a positioned ancestor that is exactly the sheet.
    expect(blockAfter(page, ".s-editor-page-inner {")).toContain("position: relative");
  });

  it("makes the band's inner row full width, so all three regions are reachable", () => {
    const start = page.indexOf(".s-editor-page-furniture-content");
    expect(start).toBeGreaterThanOrEqual(0);
    // `[^}]*` spans the nested `> *` block on purpose: the width comes before it.
    expect(/\.s-editor-page-furniture-content\s*\{[^}]*width:\s*100%/.test(page)).toBe(true);
    expect(page.slice(start)).toContain("display: flex");
  });
});

describe("the three regions inside a band", () => {
  const page = source("extensions/page/style/page.scss");

  it("refuse the caret through their children, never the click on the region itself", () => {
    // On the *children*: `pointer-events: none` on the region swallowed the double-click that opens
    // it, which is why an unopened header could never be entered at all.
    expect(page).toContain("&:not(.is-editing) > *");
    expect(page).toContain("&.is-locked > *");
    expect(blockAfter(page, "&:not(.is-editing) > *,\n  &.is-locked > * {")).toContain("pointer-events: none");
  });

  it("show every third as a dashed frame, and the one under the pointer as a solid one", () => {
    const hover = page.indexOf(".s-editor-page-header:hover &");
    expect(hover, "hovering a band outlines its regions").toBeGreaterThanOrEqual(0);
    expect(page.slice(hover)).toContain("outline: 1px dashed");
    // The highlight is a *style* change on the hovered region, so the frame is the same box.
    expect(page).toContain("outline-style: solid");
    expect(page).toContain("--el-color-primary");
  });
});
