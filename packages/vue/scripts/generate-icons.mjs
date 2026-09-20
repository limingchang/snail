#!/usr/bin/env node
/**
 * Generate `src/icon/icons/index.ts` from the `.vue` files in that directory.
 *
 * The barrel is generated rather than hand-written for the obvious reason (it is
 * currently 70 entries and three statements each), but it is deliberately **not**
 * replaced by Vite's `import.meta.glob`: an eager glob would import every icon into
 * every consumer's bundle, which is exactly the tree-shaking failure this package is
 * being rewritten to avoid. An explicit barrel lets a bundler keep only the icons an
 * application actually imports.
 *
 * Run from the package root after adding or removing an icon:
 *
 * ```bash
 * node ./scripts/generate-icons.mjs
 * ```
 *
 * The emitted `iconComponents` object also produces the `IconName` union, which is
 * what gives `SIcon`'s `icon` prop autocomplete when it is passed a string.
 */
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const iconsDir = join(packageRoot, "src", "icon", "icons");
const target = join(iconsDir, "index.ts");

/** `AddColumnAfter.vue` -> `IconAddColumnAfter`. */
function componentName(file) {
  return `Icon${file.replace(/\.vue$/, "")}`;
}

const files = (await readdir(iconsDir))
  .filter((name) => name.endsWith(".vue"))
  .sort((a, b) => a.localeCompare(b, "en"));

if (files.length === 0) {
  console.error("[snail] no icons found in src/icon/icons");
  process.exit(1);
}

const entries = files.map((file) => ({ file, name: componentName(file) }));

const imports = entries
  .map(({ file, name }) => `import ${name} from "./${file}";`)
  .join("\n");

const exports = entries.map(({ name }) => `  ${name}`).join(",\n");
const mapEntries = entries.map(({ name }) => `  ${name}`).join(",\n");

const contents = `/**
 * The bundled icon set — generated, do not edit by hand.
 *
 * Regenerate with \`node ./scripts/generate-icons.mjs\` after adding or removing a
 * file in this directory.
 *
 * ## Why a barrel and not a glob
 *
 * Vite's \`import.meta.glob({ eager: true })\` would pull **every** icon into every
 * consumer's bundle. This explicit list keeps the module graph narrow, so a bundler
 * drops the icons an application never imports.
 *
 * ## Why these icons exist at all
 *
 * Each one is a glyph that \`@element-plus/icons-vue\` does not provide — table and
 * column controls, the contract-specific marks (variable, QR code, page setup) and
 * the brand marks. Icons Element Plus already ships were deliberately removed, so
 * the two sets are complementary rather than overlapping.
 *
 * Every icon carries \`width="1em" height="1em"\` and \`fill="currentColor"\`, so it is
 * correctly sized and recolourable with no stylesheet.
 */
import type { Component } from "vue";

${imports}

export {
${exports}
};

/**
 * Every bundled icon, keyed by its component name.
 *
 * Used by the plugin to register the set, and by \`IconName\` below.
 */
export const iconComponents = {
${mapEntries}
} as const;

/** The name of any bundled icon — what \`<SIcon icon="…">\` accepts as a string. */
export type IconName = keyof typeof iconComponents;

/** A component map, structurally, for consumers that iterate the set. */
export type IconComponentMap = Readonly<Record<string, Component>>;
`;

await writeFile(target, contents, "utf8");
console.log(`[snail] generated src/icon/icons/index.ts with ${entries.length} icons`);
