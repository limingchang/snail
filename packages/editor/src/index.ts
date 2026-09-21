/**
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
