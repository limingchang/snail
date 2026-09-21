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
            <ToolInsert :editor="editor" :locale="locale" @insert-variable="onInsertVariable?.()" />
          </template>

          <template v-else-if="section.name === 'table'">
            <ToolTable :editor="editor" :locale="locale" />
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
 * `EditorToolbar` —— 功能区。
 *
 * ## 两道闸门，而不是一道
 *
 * 一个区块只有在使用方于 `tools` 里点名它**并且**它的扩展确实已注册时才会渲染。旧版工具栏
 * 只看 `tools`（`v-if="tools?.includes('page')"`），于是区块可能在没有对应节点类型的情况下
 * 渲染出来，里面每条命令都解析为 `false` —— 反过来，扩展也可能注册了却无从触达（决策 11 /
 * 缺陷：字符串清单式闸门）。
 *
 * ## 活动标签从*可用*的东西里挑
 *
 * 旧版 `initActiveTab` 回退到数字 `0`，它不匹配任何面板名，所以既没有 `style` 也没有
 * `insert` 和 `page` 的工具集 —— 比如只有二维码的集合 —— 会渲染出一个空工具栏。这里的回退是
 * 第一个真正启用的区块，并且在集合变化时重新挑标签。
 *
 * ## 一个区块一个组件
 *
 * 每个面板都是独立的 SFC，所以从不打开水印区块的使用方不必为它付出代价：旧版工具栏把所有
 * 工具硬导入，使 tree-shaking 无从谈起。
 *
 * ## `template`
 *
 * `ToolName` 有十个成员，功能区有九个面板。`"template"` 根本不是功能区的面板：模板列表是
 * `TemplatePicker`，它属于文档所在的工作区，而不是一个用户为了载入文档还得先打开的工具栏。
 *
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
 * ## `template`
 *
 * `ToolName` has ten members and the ribbon has nine panes. `"template"` is not a ribbon pane
 * at all: the template list is `TemplatePicker`, which belongs in the workspace where the
 * document is, not in a toolbar the user has to open to load a document.
 */

import { computed, ref, watch } from "vue";

import type { Editor } from "@tiptap/core";

import type { ToolName } from "../typings/editor";
import { DEFAULT_TOOLS } from "../typings/editor";
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
import ToolTable from "./tools/ToolTable.vue";
import ToolVariable from "./tools/ToolVariable.vue";
import ToolWatermark from "./tools/ToolWatermark.vue";
import { ElTabs, ElTabPane } from "element-plus";

defineOptions({ name: "EditorToolbar" });

const props = withDefaults(
  defineProps<{
    /**
     * 编辑器。在它被创建之前为 `undefined`。
     *
     * The editor. `undefined` before it has been created.
     */
    editor?: Editor;

    /**
     * 调用方想要哪些区块。默认为 {@link DEFAULT_TOOLS}。
     *
     * Which sections the caller wants. Defaults to {@link DEFAULT_TOOLS}.
     */
    tools?: readonly ToolName[];

    /**
     * 运行时的已注册扩展名。
     *
     * 可选：不提供时工具栏会从编辑器上读取，所以单独渲染工具栏的使用方也能得到同样的闸门。
     *
     * The registered extension names, from the runtime.
     *
     * Optional: when it is not supplied the toolbar reads them off the editor, so a
     * consumer that renders the toolbar on its own still gets the same gate.
     */
    extensions?: ReadonlySet<string>;

    /** 部分语言覆盖。 / Partial locale overrides. */
    locale?: Partial<EditorLocale>;

    /** 水印默认值，转发给水印面板。 / Watermark defaults, forwarded to the watermark panel. */
    watermark?: WatermarkOptions;

    /** 打印默认值，转发给打印面板。 / Print defaults, forwarded to the print panel. */
    print?: PrintOptions;

    /** 为新变量打开设计对话框。 / Open the design dialog for a new variable. */
    onInsertVariable?: () => void;

    /** 为已有变量打开设计对话框。 / Open the design dialog for an existing variable. */
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

/**
 * 调用方要求的区块。
 *
 * 默认为 {@link DEFAULT_TOOLS}，那是 `typings/editor.ts` 里写明的契约，也是文档承诺的东西。
 * 它在这里解析而不是交给 `withDefaults`，有两个原因：`readonly` 数组默认值会打败 Vue 的
 * `InferDefault`（它会遍历数组的键，然后要求一个工厂函数），而显式默认值与 `SEditor` 自己的
 * `props.tools ?? DEFAULT_TOOLS` 写法一致，两者因此不会漂移。
 *
 * 显式的 `[]` 仍然表示「不要任何区块」—— `requested()` 只是什么都找不到。
 *
 * The sections the caller asked for.
 *
 * Defaults to {@link DEFAULT_TOOLS}, which is the documented contract in
 * `typings/editor.ts` and what the docs promise. It is resolved here rather than
 * through `withDefaults` for two reasons: a `readonly` array default defeats Vue's
 * `InferDefault` (it maps over the array's keys and then demands a factory function),
 * and an explicit default reads the same as `SEditor`'s own
 * `props.tools ?? DEFAULT_TOOLS`, so the two cannot drift.
 *
 * An explicit `[]` still means "no sections" — `requested()` simply finds nothing.
 */
const requestedTools = computed<readonly ToolName[]>(() => props.tools ?? DEFAULT_TOOLS);

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * 功能区的面板，按显示顺序排列。
 *
 * `aliases` 是能选中同一个面板的其他 `ToolName`。`extensions` 是让该面板有意义的已注册扩展
 * 名 —— 至少需要一个存在。
 *
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
  // The insert pane is backed by any of the extensions whose tools it holds, so it appears
  // as soon as one of them is registered — a watermark-only setup has no insert pane, a
  // variable-only one does.
  { name: "insert", aliases: [], extensions: ["variable", "qrcode", "page", "image"] },
  // `table` is its own section. It used to be an alias of `insert`, which meant the eight
  // table operations sat in a pane named after a different job.
  { name: "table", aliases: [], extensions: ["table"] },
  { name: "page", aliases: [], extensions: ["page"] },
  { name: "variable", aliases: [], extensions: ["variable"] },
  { name: "qrcode", aliases: [], extensions: ["qrcode"] },
  { name: "watermark", aliases: [], extensions: ["watermark"] },
  { name: "print", aliases: [], extensions: ["print"] }
];

/**
 * 已注册的扩展名：给了 prop 就用 prop，否则从编辑器读取。
 *
 * The registered extension names: the prop when given, the editor otherwise.
 */
const registered = computed<ReadonlySet<string>>(() => {
  if (props.extensions) return props.extensions;
  const names = new Set<string>();
  for (const extension of props.editor?.extensionManager.extensions ?? []) names.add(extension.name);
  return names;
});

/**
 * 调用方点名了该区块或它的某个别名时为 `true`。
 *
 * `true` when the caller named the section or one of its aliases.
 */
function requested(section: (typeof RIBBON)[number]): boolean {
  const tools = requestedTools.value;
  return tools.includes(section.name) || section.aliases.some((alias) => tools.includes(alias));
}

/**
 * 既被要求、又有已注册扩展支撑的每一个区块。
 *
 * Every section that is both requested and backed by a registered extension.
 */
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
 * 让活动标签始终指向一个存在的区块。
 *
 * 两种情况，一条规则：首次渲染时没有标签，而后来的渲染可能让当前标签失效（扩展集合变了，
 * 或使用方收窄了 `tools`）。两者都回退到第一个可用区块 —— 绝不回退到下标，旧版工具栏正是
 * 因此对只有二维码的工具集显示空白。
 *
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

/**
 * 切换标签时把光标放回文档，与旧版工具栏一致。
 *
 * Moving between tabs puts the caret back in the document, as the legacy toolbar did.
 */
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
