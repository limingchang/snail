/**
 * `@snail-js/editor` 的公开入口。
 *
 * 使用者需要的四样东西：**样式表**（在这里而不是在组件里导入，打包器才会产出
 * `dist/style.css`，`package.json` 的 `sideEffects` 列出了每个 CSS 文件，因此摇树构建
 * 也会保留它）、**`SEditor`** 组件（具名导出与默认导出都有）、**插件** `SnailEditor`
 * （把 `SEditor` 全局注册为 `SEditor`），以及**契约**——`export * from "./typings"`
 * 再导出整个模型（`TemplateDocument`、`VariableAttrs`、`PaperFormat`、
 * `SEditorExposed` 等），各个扩展桶文件也再导出自己的选项与命令。
 *
 * 扩展之所以在根部再导出：想用水印的使用者必须从
 * `@snail-js/editor/extensions/watermark` 导入 `Watermark` 才能把它放进 schema，
 * 但它配置的**选项类型**属于同一个包的公开 API，再给它一个导入说明符就等于有了
 * 第二份事实来源。桶文件也保住了那条有文档的「按需启用」规则：导入某个扩展才会出现
 * 它的工具栏分区，而分区的开关就是注册的扩展名。
 *
 * `@snail-js/editor` — public entry.
 *
 * ## The four things a consumer needs
 *
 * 1. **The stylesheet.** Imported here, not in a component, so the bundler emits
 *    `dist/style.css` and a consumer that installs the package gets the theme with it.
 *    `sideEffects` in `package.json` lists every CSS file, so a tree-shaking build keeps
 *    it.
 * 2. **`SEditor`** — the component, as a named and as the default export, so both
 *    `import SEditor from` and `import { SEditor } from` work.
 * 3. **The plugin** — `SnailEditor`, which registers `SEditor` globally as `SEditor`.
 * 4. **The contracts** — `export * from "./typings"` re-exports the whole model
 *    (`TemplateDocument`, `VariableAttrs`, `PaperFormat`, `SEditorExposed`, …), and every
 *    extension barrel re-exports its own options and commands.
 *
 * ## Why the extensions are re-exported at the root
 *
 * A consumer that wants the watermark has to `import { Watermark } from
 * "@snail-js/editor/extensions/watermark"` to put it in the schema — but the *option type*
 * it configures is part of the same package's public API, and a second import specifier
 * for it would be a second version of the truth. The barrels also keep the documented
 * opt-in rule reachable: importing an extension is what makes its toolbar section appear,
 * and the section's gate is the registered extension name.
 */

import type { App, Plugin } from "vue";

import "./theme/index.scss";

import SEditor from "./editor/SEditor.vue";

// ---------------------------------------------------------------------------------
// The component and its parts
// ---------------------------------------------------------------------------------

export { default as SEditor } from "./editor/SEditor.vue";

export { default as EditorToolbar } from "./components/EditorToolbar.vue";
export { default as VariableDialog } from "./components/VariableDialog.vue";
export { default as FillVariableDialog } from "./components/FillVariableDialog.vue";
export { default as TemplatePicker } from "./components/TemplatePicker.vue";

export { default as ToolFont } from "./components/tools/ToolFont.vue";
export { default as ToolParagraph } from "./components/tools/ToolParagraph.vue";
export { default as ToolInsert } from "./components/tools/ToolInsert.vue";
export { default as ToolTable } from "./components/tools/ToolTable.vue";
export { default as ToolPage } from "./components/tools/ToolPage.vue";
export { default as ToolVariable } from "./components/tools/ToolVariable.vue";
export { default as ToolQrcode } from "./components/tools/ToolQrcode.vue";
export { default as ToolWatermark } from "./components/tools/ToolWatermark.vue";
export { default as ToolPrint } from "./components/tools/ToolPrint.vue";

/**
 * 编辑器自有的字形：Element Plus 与 `@snail-js/vue` 都没有提供的那部分。
 *
 * 日后值得提升进 `@snail-js/vue`——它们是通用的富文本标记，并非编辑器专属——但
 * 目前留在这里，因为它们只通过这个工具栏可达，而迁移会构成另一个包里的破坏性变更。
 *
 * The editor's own glyphs: the ones Element Plus and `@snail-js/vue` do not ship.
 *
 * Worth graduating into `@snail-js/vue` later — they are generic rich-text marks, not
 * editor-specific — but they live here for now because they are only reachable through
 * this toolbar, and moving them would be a breaking change in the other package.
 */
export {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconStrike,
  IconUnderline
} from "./components/icons";

// ---------------------------------------------------------------------------------
// The contracts, and the composables a host may reuse
// ---------------------------------------------------------------------------------

export * from "./typings";

export type { EditorRuntime, UseEditorRuntimeOptions } from "./editor/useEditorRuntime";
export { useEditorRuntime } from "./editor/useEditorRuntime";
export { useEditorSelection } from "./editor/useEditorSelection";
export * from "./editor/locale";
export * from "./editor/props";
export * from "./editor/starter";
export * from "./editor/template";
export {
  countPages,
  readPageSetup,
  summariseVariables
} from "./editor/template";
export {
  findNodes,
  hasNodeType,
  readDocumentPageSetup,
  readPageNumberFormat,
  updateNodesOfType
} from "./editor/documentNodes";
export { parseCssLength, formatCssLength, toMillimetres, fromMillimetres } from "./editor/cssLength";

// ---------------------------------------------------------------------------------
// The extension barrels
// ---------------------------------------------------------------------------------

export * from "./extensions/page";
export * from "./extensions/variable";
export * from "./extensions/qrcode";
export * from "./extensions/watermark";
export * from "./extensions/print";
export * from "./extensions/paragraphStyle";
export * from "./extensions/layoutMode";
export * from "./extensions/document";

/**
 * `readPaperFormat` 同时被 page 与 print 两个模块导出，且签名略有不同（page 的版本
 * 是全函数，print 的版本会返回 `| undefined`）。按 ES 模块规则，一个名字若能经由两个
 * `export *` 到达，就会从包的公开表面上被丢弃，那会无声地删掉一个公开辅助函数，所以
 * 这里显式再导出 page 模块的版本——即契约是「总是返回一个格式」的那个。
 *
 * `readPaperFormat` is exported by both the page and the print modules, with slightly
 * different signatures (the page one is total, the print one returns `| undefined`). A name
 * reachable from two `export *`s is dropped from the package's surface by the ES module
 * rules, which would silently remove a public helper, so the page module's version — the
 * one whose contract is "always a format" — is re-exported explicitly.
 */
export { readPaperFormat } from "./extensions/page";

// ---------------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------------

/**
 * 把 `SEditor` 全局注册，这样模板里不用导入就能写 `<SEditor>`。
 *
 * 做成插件对象而不是函数：Vue 使用者期望的用法就是 `app.use(SnailEditor)`，
 * 对象形态也让这次注册在测试中可被检视。
 *
 * Registers `SEditor` globally, so a template can use `<SEditor>` without an import.
 *
 * A plugin object rather than a function: `app.use(SnailEditor)` is what a Vue consumer
 * expects, and the object shape also makes the registration inspectable in a test.
 */
export const SnailEditor: Plugin = {
  install(app: App): void {
    app.component("SEditor", SEditor);
  }
};

export default SEditor;
