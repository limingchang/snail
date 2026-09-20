<template>
  <div class="s-editor-toolbar">
    <el-tabs v-model="activeTab" class="s-editor-toolbar__tabs" @tab-change="focusEditor">
      <el-tab-pane
        v-for="section in availableSections"
        :key="section.name"
        :name="section.name"
        :label="section.title"
      >
        <div class="s-editor-toolbar-pane">
          <template v-if="section.name === 'font'">
            <ToolFont :editor="editor" :locale="locale" />
          </template>

          <template v-else-if="section.name === 'paragraph'">
            <ToolParagraph :editor="editor" :locale="locale" />
          </template>

          <template v-else-if="section.name === 'insert'">
            <ToolInsert :editor="editor" :locale="locale" />
          </template>

          <template v-else-if="section.name === 'page'">
            <ToolPage :editor="editor" :locale="locale" />
          </template>

          <template v-else-if="section.name === 'variable'">
            <ToolVariable
              :editor="editor"
              :locale="locale"
              @insert="onInsertVariable?.()"
              @edit="(attrs, pos) => onEditVariable?.(attrs, pos)"
            />
          </template>

          <template v-else-if="section.name === 'qrcode'">
            <ToolQrcode :editor="editor" :locale="locale" />
          </template>

          <template v-else-if="section.name === 'watermark'">
            <ToolWatermark :editor="editor" :locale="locale" :watermark="watermark" />
          </template>

          <template v-else-if="section.name === 'print'">
            <ToolPrint :editor="editor" :locale="locale" :print="print" />
          </template>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
/**
 * `EditorToolbar` — the ribbon.
 *
 * ## Two gates, not one
 *
 * A section renders only when the caller names it in `tools` **and** its extension is
 * actually registered. The legacy toolbar gated on `tools` alone
 * (`v-if="tools?.includes('page')"`), so a section could render with no node types behind
 * it and every command in it resolved to `false` — and, symmetrically, an extension could
 * be registered with no way to reach it (decision 11 / defect: the string-list gate).
 *
 * ## The active tab is chosen from what is *available*
 *
 * The legacy `initActiveTab` fell back to the number `0`, which matched no pane name, so
 * a tool set with neither `style` nor `insert` nor `page` — a QR-code-only set, say —
 * rendered an empty toolbar. Here the fallback is the first section that is genuinely
 * enabled, and the tab is re-chosen whenever the set changes.
 *
 * ## One component per section
 *
 * Each pane is its own SFC, so a consumer that never opens the watermark section does not
 * pay for it: the legacy toolbar hard-imported every tool, which made tree-shaking
 * impossible.
 *
 * ## `table` and `template`
 *
 * `ToolName` has nine members and the ribbon has eight panes. `"table"` is an alias of
 * `"insert"` — the table grid lives there, so naming either shows the same pane and
 * naming both shows it once. `"template"` is not a ribbon pane at all: the template list
 * is `TemplatePicker`, which belongs in the workspace where the document is, not in a
 * toolbar the user has to open to load a document.
 */

import { computed, ref, watch } from "vue";

import type { Editor } from "@tiptap/core";

import type { ToolName } from "../typings/editor";
import type { VariableAttrs } from "../typings/variable";
import type { PrintOptions, WatermarkOptions } from "../typings/editor";

import { mergeEditorLocale, sectionLabel } from "../editor/locale";
import type { EditorLocale } from "../editor/locale";

import ToolFont from "./tools/ToolFont.vue";
import ToolInsert from "./tools/ToolInsert.vue";
import ToolPage from "./tools/ToolPage.vue";
import ToolParagraph from "./tools/ToolParagraph.vue";
import ToolPrint from "./tools/ToolPrint.vue";
import ToolQrcode from "./tools/ToolQrcode.vue";
import ToolVariable from "./tools/ToolVariable.vue";
import ToolWatermark from "./tools/ToolWatermark.vue";

defineOptions({ name: "EditorToolbar" });

const props = withDefaults(
  defineProps<{
    /** The editor. `undefined` before it has been created. */
    editor?: Editor;

    /** Which sections the caller wants. */
    tools?: readonly ToolName[];

    /**
     * The registered extension names, from the runtime.
     *
     * Optional: when it is not supplied the toolbar reads them off the editor, so a
     * consumer that renders the toolbar on its own still gets the same gate.
     */
    extensions?: ReadonlySet<string>;

    /** Partial locale overrides. */
    locale?: Partial<EditorLocale>;

    /** Watermark defaults, forwarded to the watermark panel. */
    watermark?: WatermarkOptions;

    /** Print defaults, forwarded to the print panel. */
    print?: PrintOptions;

    /** Open the design dialog for a new variable. */
    onInsertVariable?: () => void;

    /** Open the design dialog for an existing variable. */
    onEditVariable?: (attrs: VariableAttrs, pos: number) => void;
  }>(),
  {
    editor: undefined,
    tools: undefined,
    extensions: undefined,
    locale: undefined,
    watermark: undefined,
    print: undefined,
    onInsertVariable: undefined,
    onEditVariable: undefined
  }
);

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * The ribbon's panes, in the order they are shown.
 *
 * `aliases` are other `ToolName`s that select the same pane. `extensions` are the
 * registered extension names that make the pane meaningful — at least one must be
 * present.
 */
const RIBBON: readonly {
  name: ToolName;
  aliases: readonly ToolName[];
  extensions: readonly string[];
}[] = [
  { name: "font", aliases: [], extensions: ["textStyle"] },
  { name: "paragraph", aliases: [], extensions: ["paragraphStyle"] },
  { name: "insert", aliases: ["table"], extensions: ["table"] },
  { name: "page", aliases: [], extensions: ["page"] },
  { name: "variable", aliases: [], extensions: ["variable"] },
  { name: "qrcode", aliases: [], extensions: ["qrcode"] },
  { name: "watermark", aliases: [], extensions: ["watermark"] },
  { name: "print", aliases: [], extensions: ["print"] }
];

/** The registered extension names: the prop when given, the editor otherwise. */
const registered = computed<ReadonlySet<string>>(() => {
  if (props.extensions) return props.extensions;
  const names = new Set<string>();
  for (const extension of props.editor?.extensionManager.extensions ?? []) names.add(extension.name);
  return names;
});

/** `true` when the caller named the section or one of its aliases. */
function requested(section: (typeof RIBBON)[number]): boolean {
  const tools = props.tools;
  if (!tools) return false;
  return tools.includes(section.name) || section.aliases.some((alias) => tools.includes(alias));
}

/** Every section that is both requested and backed by a registered extension. */
const availableSections = computed(() =>
  RIBBON.filter(
    (section) =>
      requested(section) && section.extensions.some((name) => registered.value.has(name))
  ).map((section) => ({
    name: section.name,
    title: sectionLabel(t.value, section.name)
  }))
);

const activeTab = ref<string>("");

/**
 * Keep the active tab pointing at a section that exists.
 *
 * Two cases, one rule: the first render has no tab, and a later render can invalidate the
 * current one (the extension set changed, or a consumer narrowed `tools`). Both fall back
 * to the first available section — never to an index, which is how the legacy toolbar
 * ended up blank for a QR-code-only tool set.
 */
watch(
  availableSections,
  (sections) => {
    const names: string[] = sections.map((section) => section.name);
    if (activeTab.value !== "" && names.includes(activeTab.value)) return;
    activeTab.value = names[0] ?? "";
  },
  { immediate: true }
);

/** Moving between tabs puts the caret back in the document, as the legacy toolbar did. */
function focusEditor(): void {
  props.editor?.chain().focus().run();
}
</script>

<style scoped lang="scss">
.s-editor-toolbar {
  flex: none;

  &__tabs {
    :deep(.el-tabs__header) {
      margin-bottom: 8px;
    }
  }
}
</style>
