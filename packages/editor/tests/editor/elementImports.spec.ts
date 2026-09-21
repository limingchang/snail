/**
 * Every Element Plus component a template uses must be imported by that template's own script.
 *
 * ## Why this is a test and not a convention
 *
 * `element-plus` is a **peer** dependency: the consumer provides it, and the editor must not need
 * `app.use(ElementPlus)` to render. A `<script setup>` component that imports `ElButton` registers
 * it locally, so the templates keep working with no global registration at all — but the failure
 * mode of forgetting one import is invisible: the tag resolves to nothing, Vue logs a warning to
 * the console, and the control simply does not appear. Nothing in the type system, the bundler or a
 * DOM-less test catches that.
 *
 * This test reads the source of every `.vue` file in the package and checks the two halves against
 * each other. It is deliberately static: it is the only check that covers a dialog that is never
 * opened during a test run.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** The package root, from this file's location. */
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = join(packageRoot, "src");

/** Every `.vue` file under `src/`, recursively. */
function componentFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...componentFiles(full));
    else if (entry.name.endsWith(".vue")) found.push(full);
  }
  return found;
}

/** `el-color-picker` → `ElColorPicker`. */
function componentName(tag: string): string {
  const pascal = tag
    .replace(/^el-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `El${pascal}`;
}

describe("Element Plus components are imported locally", () => {
  const files = componentFiles(sourceRoot);

  it("finds the components of this package", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [relative(packageRoot, file).replace(/\\/g, "/"), file] as const))(
    "%s imports every `el-*` component its template uses",
    (label, file) => {
      const source = readFileSync(file, "utf8");

      // The **last** `</template>`, not the first: these files use `<template #reference>` slots
      // inside their own template, and stopping at the first closing tag truncated the scan exactly
      // where the interesting controls live — which is how `ToolTable` shipped a `<el-divider>` with
      // no `ElDivider` import and this test still passed.
      const templateEnd = source.lastIndexOf("</template>");
      const template = templateEnd >= 0 ? source.slice(0, templateEnd) : "";
      const scriptStart = source.indexOf("<script");
      const script = scriptStart >= 0 ? source.slice(scriptStart) : "";

      const tags = new Set(
        Array.from(template.matchAll(/<(el-[a-z0-9-]+)/g), (match) => match[1] ?? "")
      );

      const missing = Array.from(tags)
        .map(componentName)
        .filter((name) => !new RegExp(`\\b${name}\\b`).test(script));

      // A tag with no import renders nothing at all: no error, no control, just a console warning
      // a consumer never reads.
      expect(missing, `${label} uses ${missing.join(", ")} without importing it`).toEqual([]);
    }
  );
});

describe("Element Plus styles are shipped with the package", () => {
  it("imports the stylesheet of every component the editor uses", () => {
    // The styles live in the **CSS** graph (`theme/element.scss`), not in a TypeScript module:
    // `import "element-plus/es/components/<x>/style/css"` is an import of an *external* module, and
    // the bundler's tree-shaking treats those as side-effect-free — it dropped every one of them, so
    // the package shipped without the component CSS and a consumer's controls rendered unstyled.
    // `@import`ed CSS cannot be dropped: it is the file.
    const styles = readFileSync(join(sourceRoot, "theme", "element.scss"), "utf8");

    for (const component of REQUIRED_STYLES) {
      // `base.css` is the one file without the `el-` prefix: it is the variable sheet, not a component.
      const specifier =
        component === "base"
          ? "element-plus/theme-chalk/base.css"
          : `element-plus/theme-chalk/el-${component}.css`;
      expect(styles, `element.scss is missing ${component}`).toContain(specifier);
    }
  });

  it("imports the base stylesheet, which declares the `--el-*` variables", () => {
    // Importing the component CSS *directly* skips `base.css`, where every `--el-*` custom property is
    // declared. A missing custom property resolves to nothing, which showed up as a transparent
    // popover background and button labels that were not white.
    const styles = readFileSync(join(sourceRoot, "theme", "element.scss"), "utf8");
    const base = styles.indexOf('@import "element-plus/theme-chalk/base.css";');
    expect(base, "element.scss must import theme-chalk/base.css").toBeGreaterThanOrEqual(0);
    // …and before the components that read those variables.
    expect(base).toBeLessThan(styles.indexOf("element-plus/theme-chalk/el-"));
  });

  it("pulls that stylesheet into the package entry, before its own rules", () => {
    const theme = readFileSync(join(sourceRoot, "theme", "index.scss"), "utf8");

    // `@use` order is load-bearing twice over: Sass requires every `@use` before any other rule, and
    // the Element Plus CSS has to come first so this package's overrides win.
    const element = theme.indexOf('@use "./element"');
    expect(element).toBeGreaterThanOrEqual(0);
    expect(element).toBeLessThan(theme.indexOf('@use "./variables"'));
    expect(element).toBeLessThan(theme.indexOf('@use "./base"'));
  });
});

/**
 * The component styles the editor cannot render without.
 *
 * The list is the **transitive closure** Element Plus's own on-demand entries declare (each
 * `es/components/<name>/style/css.mjs` names its component's CSS and its dependencies), recomputed by
 * `scripts/derive-element-styles.mjs`, plus `icon` — whose on-demand entry pulls only `base`, while
 * the file itself carries the spacing and spin rules the editor's `<el-icon>` uses.
 *
 * Hand-picking this list is what shipped a broken panel twice: without `switch` the 页眉/页脚 switches
 * drew as nothing, and without `slider` / `date-picker` the watermark and fill panels lost controls.
 * Keeping it here means adding a component to the editor fails this test until its CSS — and its
 * dependencies' CSS — are declared.
 */
const REQUIRED_STYLES = [
  "alert",
  "badge",
  "base",
  "button",
  "button-group",
  "cascader",
  "cascader-panel",
  "checkbox",
  "color-picker",
  "color-picker-panel",
  "config-provider",
  "date-picker",
  "date-picker-panel",
  "dialog",
  "divider",
  "dropdown",
  "dropdown-item",
  "dropdown-menu",
  "empty",
  "form",
  "form-item",
  "icon",
  "input",
  "input-number",
  "message",
  "option",
  "option-group",
  "overlay",
  "popover",
  "popper",
  "progress",
  "radio",
  "radio-group",
  "scrollbar",
  "select",
  "skeleton",
  "skeleton-item",
  "slider",
  "switch",
  "tab-pane",
  "tabs",
  "tag",
  "tooltip",
  "upload",
  "virtual-list"
];
