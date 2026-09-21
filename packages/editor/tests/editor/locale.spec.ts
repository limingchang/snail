/**
 * The default locale, as a contract.
 *
 * Two of the labels here were requested explicitly and are easy to undo by accident: the
 * page-number token documentation has to name `{page}` / `{total}` / `#` / `&` without ever
 * calling them "旧版别名" (the wording the tooltip was asked to drop), and the panels that
 * gained controls — font colour, background colour, indent-in-characters, the table tab —
 * need their labels to exist rather than fall back to a raw key.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_EDITOR_LOCALE } from "../../src/editor/locale";

describe("DEFAULT_EDITOR_LOCALE", () => {
  it("documents the page-number tokens in the tooltip", () => {
    const tokens = DEFAULT_EDITOR_LOCALE.page.pageNumberTokens;

    for (const token of ["{page}", "{total}", "#", "&"]) {
      expect(tokens).toContain(token);
    }
    expect(tokens).toContain("当前页");
    expect(tokens).toContain("总页数");
  });

  it("never calls those tokens a legacy alias in user-facing text", () => {
    const text = JSON.stringify(DEFAULT_EDITOR_LOCALE);
    expect(text).not.toContain("旧版别名");
    expect(text).not.toContain("别名");
  });

  it("explains the missing-furniture case instead of blaming the footer", () => {
    const missing = DEFAULT_EDITOR_LOCALE.page.pageNumberMissing;
    expect(missing).toContain("页眉");
    expect(missing).toContain("页脚");
  });

  it("has labels for the controls the panels gained", () => {
    expect(DEFAULT_EDITOR_LOCALE.font.color).not.toBe("");
    expect(DEFAULT_EDITOR_LOCALE.font.backgroundColor).not.toBe("");
    expect(DEFAULT_EDITOR_LOCALE.paragraph.indentUnit).toBe("字符");
    expect(DEFAULT_EDITOR_LOCALE.table.table).not.toBe("");
    expect(DEFAULT_EDITOR_LOCALE.table.layoutTable).not.toBe("");
    expect(DEFAULT_EDITOR_LOCALE.insert.variable).not.toBe("");
    expect(DEFAULT_EDITOR_LOCALE.insert.qrcode).not.toBe("");
  });
});
