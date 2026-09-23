/**
 * 布局表的边线规则 —— 钉在样式源码上。
 *
 * 布局表是无框网格：设计模式把它的线画成虚线提示，好让设计者看清分栏；填写模式输出的是给填写者看
 * 的成品，一条线都不画。这两处样式都只住在 `theme/base.scss` 一个文件里，所以这里读的就是它。换成
 * 计算样式需要真实浏览器，而本套件没有 —— 因此静态断言是唯一能在 CI 里守住的写法。
 *
 * The layout table's edge rules, pinned at the style source.
 *
 * A layout table is an unframed grid: design mode draws its lines as dashed hints so the designer
 * can see the columns, while what fill mode outputs is the finished document for the person
 * filling it and draws no line at all. Both live in one file, `theme/base.scss`, which is what
 * these assertions read. Asking for the computed style would need a real browser and this suite
 * has none, so a static assertion is the only guard CI can hold.
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

describe("the layout table's lines", () => {
  const base = source("theme/base.scss");

  it("draws the design-mode grid as dashed hints", () => {
    // The dashed switch hangs off the layout row, so an ordinary table keeps its solid borders.
    const row = base.indexOf("tr.layout-mode");
    const dashed = base.indexOf("border-style: var(--se-layout-line-style, dashed);");

    expect(row, "the layout row must be styled").toBeGreaterThanOrEqual(0);
    expect(dashed, "the grid hint must be dashed").toBeGreaterThanOrEqual(0);
    expect(dashed).toBeGreaterThan(row);
    // Both hooks the extension renders are covered: the class and the attribute.
    expect(base.slice(row, dashed)).toContain("tr[data-layout]");
  });

  it("draws no line at all in fill mode, and at screen level rather than only for print", () => {
    const fill = base.indexOf(".s-editor-scope.s-editor-fill");

    expect(fill, "the fill-mode rule must exist").toBeGreaterThanOrEqual(0);

    // The rule ends at the first top-level `}` after it, so the slice is exactly its block.
    const rule = base.slice(fill, base.indexOf("\n}", fill) + 2);
    expect(rule).toContain("tr.layout-mode");
    expect(rule).toContain("border-style: none;");

    // The print layer already hides the lines on paper; this is the on-screen rule, so it sits
    // before the `@media print` block rather than inside it.
    expect(fill).toBeLessThan(base.indexOf("@media print"));
  });
});
