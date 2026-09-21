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
 * 内置图标集 —— 由脚本生成，请勿手工修改。
 *
 * 在本目录新增或删除图标文件后，用 \`node ./scripts/generate-icons.mjs\` 重新生成。
 *
 * ## 为什么用 barrel 而不是 glob
 *
 * Vite 的 \`import.meta.glob({ eager: true })\` 会把**每一个**图标都塞进每一个使用方的
 * 产物里。这份显式列表让模块图保持狭窄，打包器因此可以丢掉应用从未导入的图标。
 *
 * ## 为什么这些图标会存在
 *
 * 每一个都是 \`@element-plus/icons-vue\` 没有提供的字形 —— 表格与列控制、合同场景特有的
 * 标记（变量、二维码、页面设置）以及品牌标识。Element Plus 已经提供的图标被刻意移除，
 * 因此这两套图标是互补而非重叠的关系。
 *
 * 每个图标都带有 \`width="1em" height="1em"\` 和 \`fill="currentColor"\`，所以不需要样式表
 * 就能正确确定尺寸和颜色。
 *
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
 * 每一个内置图标，按组件名索引。
 *
 * 供插件注册整套图标使用，也被下面的 \`IconName\` 使用。
 *
 * Every bundled icon, keyed by its component name.
 *
 * Used by the plugin to register the set, and by \`IconName\` below.
 */
export const iconComponents = {
${mapEntries}
} as const;

/**
 * 任意内置图标的名字 —— \`<SIcon icon="…">\` 以字符串形式接受的就是它。
 *
 * The name of any bundled icon — what \`<SIcon icon="…">\` accepts as a string.
 */
export type IconName = keyof typeof iconComponents;

/**
 * 一个结构化表示的组件映射，供需要遍历整套图标的使用方使用。
 *
 * A component map, structurally, for consumers that iterate the set.
 */
export type IconComponentMap = Readonly<Record<string, Component>>;
`;

await writeFile(target, contents, "utf8");
console.log(`[snail] generated src/icon/icons/index.ts with ${entries.length} icons`);
