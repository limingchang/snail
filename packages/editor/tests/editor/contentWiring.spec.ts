/**
 * `v-model` must reach the editor's initial content.
 *
 * This is a **wiring** contract, and it is the kind that fails silently: `SEditor` built its editor
 * content from `props.doc` — the deprecated alias — while the public contract is `modelValue`. Every
 * `v-model` caller therefore got an *empty* document (one blank paragraph), with no error, no warning
 * and nothing in the DOM to explain it. The documentation site's demos were the visible symptom.
 *
 * A behaviour test would need a mounted editor and a DOM, so the guarantee is asserted at the source
 * level: the precedence expression itself, and the fact that the runtime receives it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));

describe("SEditor content wiring", () => {
  const sfc = readFileSync(join(sourceRoot, "editor", "SEditor.vue"), "utf8");

  it("reads `modelValue` (the `v-model` contract), not only the deprecated `doc` alias", () => {
    expect(sfc).toContain("props.modelValue ?? props.doc");
  });

  it("keeps the documented precedence: local template, then v-model, then the alias", () => {
    expect(sfc).toContain(
      "localTemplateContent.value ?? props.modelValue ?? props.doc"
    );
  });

  it("hands that computed to the runtime as its `content`", () => {
    // The computed has to be the value the runtime is given; a renamed local that nothing passes on
    // would satisfy the assertions above and change nothing.
    expect(sfc).toMatch(/const runtimeContent = computed<TemplateContent \| undefined>/);
    expect(sfc).toMatch(/useEditorRuntime\(\{[\s\S]{0,200}?content: runtimeContent,/);
  });
});
