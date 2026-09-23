<template>
  <!--
    `el-config-provider` is renderless: it contributes the locale (and nothing else) to this
    component's tree, including the panels Element Plus teleports to `<body>`, because Vue's
    provide/inject follows the component tree rather than the DOM.
  -->
  <el-config-provider :locale="elementLocale">
    <div class="s-editor s-editor-scope" :class="{ 's-editor-fill': mode === 'fill' }" :aria-label="t.editor">
      <!-- Design mode: the ribbon. Fill mode: one tab only, and only when it has something to
           offer — a print operator cannot change the template, so a full ribbon would be a lie
           (see the mode table in `typings/editor.ts`). The 模板 tab stays reachable in fill mode
           because choosing *which* template to fill is exactly what an operator does, and it
           disappears when the remote template is configured: there is then nothing to choose. -->
      <EditorToolbar
        v-if="showToolbar && (mode === 'design' || fillTemplateTab)"
        :editor="editor"
        :tools="ribbonTools"
        :extensions="enabledExtensions"
        :locale="props.locale"
        :watermark="props.watermark"
        :print="props.print"
        :on-insert-variable="() => openVariableDialog()"
        :on-insert-qrcode="openQrcodeDialog"
        :on-edit-variable="openVariableDialog"
        :template-items="templateItems"
        :template-loading="listLoading"
        :template-error="listError"
        :template-policy="loadPolicy"
        :template-selected="selectedTemplateId"
        :template-design="mode === 'design'"
        :template-list-source="isListSource"
        :on-refresh-templates="() => void loadTemplateList()"
        :on-select-template="(id: string) => (selectedTemplateId = id)"
        :on-load-template="(id: string) => void selectTemplate(id)"
        :on-retry-templates="retryTemplate"
        :on-create-template="createNewTemplate"
        :on-pick-local-template="pickLocalTemplate"
      />

      <div class="s-editor-workspace">
        <!-- A failed template request must not destroy the editor: the alert sits above the
             document, the editor keeps whatever it holds, and 重试 re-runs the request. The
             legacy component had no error state at all. -->
        <div v-if="templateError !== ''" class="s-editor-error">
          <el-alert type="error" :title="templateError" :closable="false" show-icon />
          <el-button size="small" @click="retryTemplate">{{ t.retry }}</el-button>
        </div>

        <EditorContent class="s-editor-content" :editor="editor" />
      </div>

      <div class="s-editor-actions">
        <template v-if="mode === 'design'">
          <el-button type="primary" size="small" @click="() => void handleSave()">{{ t.save }}</el-button>
        </template>
        <template v-else>
          <el-button type="primary" size="small" @click="openFillDialog">{{ t.fillAction }}</el-button>
          <el-button size="small" class="s-editor-print-action" @click="printDocument">
            {{ t.printAction }}
          </el-button>
        </template>
      </div>

      <!-- The design dialog lives here, not in the toolbar: the variable node view's own
           click callback opens it too, and two owners is exactly how the legacy dialog ended
           up shared and leaking the previous variable's state (defect 27). -->
      <VariableDialog
        v-model:open="variableDialogOpen"
        :attrs="editingVariableAttrs"
        :pos="editingVariablePos"
        :inner-variable="innerVariable"
        :exclude="variableExclude"
        :existing-keys="existingKeys"
        :locale="props.locale"
        @save="applyVariable"
      />

      <FillVariableDialog
        v-model:open="fillDialogOpen"
        :variables="fillVariables"
        :values="fillValues"
        :page="1"
        :total="pageCount"
        :locale="props.locale"
        @submit="applyFill"
      />

      <!-- The QR dialog has the same two owners as the variable dialog: a click on the code
           itself, and the 插入 section's button. Owning it here is what keeps them from
           becoming two dialog states that disagree. -->
      <QrcodeDialog
        v-model:open="qrcodeDialogOpen"
        :editor="editor"
        :locale="props.locale"
      />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
/**
 * `SEditor` —— 顶层组件。
 *
 * ## 这个文件是什么
 *
 * 接线，几乎别无其他。它满足的契约是 `SEditorProps`、`SEditorEmits` 与 `SEditorExposed`；
 * 模板管线在 `editor/template.ts`；扩展装配在 `editor/useEditorRuntime.ts`；面板在
 * `components/`。这里任何长出了自己决策的东西都该归到上述某一处。
 *
 * ## 两种模式
 *
 * | | `design` | `fill` |
 * | --- | --- | --- |
 * | 文档 | 可编辑 | 只读 |
 * | 工具栏 | 显示 | 隐藏 |
 * | 操作 | 保存 | 填写 + 打印 |
 *
 * 模式来自 `props.mode`，并接受旧版的 `design?: boolean` 作为废弃别名。它是被运行时
 * *watch* 的，而不是只读一次：旧组件在构造时就冻结了模式、文档与扩展集合，因为它完全没有
 * watcher（缺陷 38）。
 *
 * ## 模板管线
 *
 * - `local` 渲染 `content`（以及随之而来的任何页面设置与水印）。
 * - `remote` 在就绪时取一次；失败会在文档上方显示一个 alert，而不是销毁编辑器。
 * - `remote-list` 取列表；`load: "auto"` 还会取并渲染**第一项**，`load: "manual"`（默认）
 *   在按下载入按钮之前什么都不渲染。
 * - `save` 写入 `localStorage`/`sessionStorage`，或者 POST/PUT 那份
 *   {@link TemplateDocument}（`structured === false` 时则是 HTML）。`onSave` 总会被调用，
 *   所以通过自己的 API 持久化的使用方根本不需要 `save` 目标。
 *
 * ## 顺序
 *
 * 编辑器是在 `useEditorRuntime` 的 `setup` 里创建的，所以 `onReady` 会在该 composable 还在
 * 运行时触发 —— 早于本组件自己的解构引用存在。任何触碰它们的代码都不能从这个回调里运行。
 * 它设置的就绪标志改由 watch 观察，这也意味着模板请求发生在视图挂载之后。
 *
 * `SEditor` — the top-level component.
 *
 * ## What this file is
 *
 * Wiring, and little else. The contracts it satisfies are `SEditorProps`, `SEditorEmits`
 * and `SEditorExposed`; the template plumbing is `editor/template.ts`; the extension
 * assembly is `editor/useEditorRuntime.ts`; the panels are in `components/`. Anything here
 * that grows a decision of its own belongs in one of those.
 *
 * ## The two modes
 *
 * | | `design` | `fill` |
 * | --- | --- | --- |
 * | document | editable | read-only |
 * | toolbar | shown | hidden |
 * | actions | 保存 | 填写 + 打印 |
 *
 * The mode comes from `props.mode`, with the legacy `design?: boolean` accepted as a
 * deprecated alias. It is *watched* by the runtime rather than read once: the legacy
 * component froze the mode, the document and the extension set at construction because it
 * had no watchers (defect 38).
 *
 * ## Template plumbing
 *
 * - `local` renders `content` (and any page setup/watermark that travelled with it).
 * - `remote` fetches once on ready; a failure shows an alert above the document instead of
 *   destroying the editor.
 * - `remote-list` fetches the list; `load: "auto"` also fetches and renders the **first**
 *   entry, `load: "manual"` (the default) renders nothing until the load button is pressed.
 * - `save` writes to `localStorage`/`sessionStorage`, or POSTs/PUTs the
 *   {@link TemplateDocument} (or the HTML when `structured === false`). `onSave` is always
 *   called, so a consumer that persists through its own API needs no `save` target at all.
 *
 * ## Ordering
 *
 * The editor is created inside `useEditorRuntime`'s `setup`, so `onReady` fires *while*
 * the composable is still running — before this component's own destructured refs exist.
 * Nothing that touches them may run from that callback. The ready flag it sets is watched
 * instead, which also means the template request happens after the view is mounted.
 */

import { computed, ref, watch } from "vue";

import { EditorContent } from "@tiptap/vue-3";
import type { Editor } from "@tiptap/core";
// `element-plus/es/locale/index`, never `element-plus/es/locale`: the package's `exports` map sends
// `./es/*` to `./es/*.mjs`, and there is no `es/locale.mjs` — only `es/locale/index.mjs`. The bare
// directory form still type-checks (the map's `types` arm falls back to `./es/*/index.d.ts`), and
// then fails inside the *consumer's* bundler, the worst possible place to discover it.
import { zhCn } from "element-plus/es/locale/index";
import type { Language } from "element-plus/es/locale/index";

import { DEFAULT_TOOLS } from "../typings/editor";
import type {
  EditorChangeEvent,
  EditorMode,
  SaveResult,
  SEditorExposed,
  TemplateContent,
  TemplateDocument,
  TemplateListItem,
  TemplatePageSetup,
  TemplateSaveTarget,
  TemplateWatermark,
  ToolName
} from "../typings/editor";
import type { VariableAttrs, VariableFillData, VariableType } from "../typings/variable";

import { collectDocumentVariables, getVariableValues, setVariableValues } from "../extensions/variable";
import type { PageOptions } from "../extensions/page";

import EditorToolbar from "../components/EditorToolbar.vue";
import FillVariableDialog from "../components/FillVariableDialog.vue";
import QrcodeDialog from "../components/QrcodeDialog.vue";
import VariableDialog from "../components/VariableDialog.vue";

import { findNodes } from "./documentNodes";
import { describeTemplateError, mergeEditorLocale } from "./locale";
import type { SEditorEmits, SEditorProps } from "./props";
import {
  buildTemplateDocument,
  emptyDocument,
  fetchTemplate,
  fetchTemplateList,
  isRemoteListSource,
  isRemoteSource,
  parseTemplateInput,
  readStoredTemplate,
  resolveTemplateContentUrl,
  saveTemplateToTarget,
  templateErrorCode,
  templateLoadPolicy
} from "./template";
import type { FetchLike, StorageLike, TemplateListResult } from "./template";
import { useEditorRuntime } from "./useEditorRuntime";
import { ElConfigProvider, ElMessage, ElAlert, ElButton } from "element-plus";

defineOptions({ name: "SEditor" });

/**
 * 组件的 props，来自 `SEditorProps`（见 `./props`）。`multiPage` 默认为 `true`，其余每个
 * prop 默认都是 `undefined`。
 *
 * The component's props, from `SEditorProps` (see `./props`). `multiPage` defaults to `true`;
 * every other prop defaults to `undefined`.
 */
const props = withDefaults(defineProps<SEditorProps>(), {
  modelValue: undefined,
  mode: undefined,
  design: undefined,
  doc: undefined,
  data: undefined,
  tools: undefined,
  multiPage: true,
  template: undefined,
  save: undefined,
  page: undefined,
  variable: undefined,
  watermark: undefined,
  print: undefined,
  qrcode: undefined,
  extensions: undefined,
  locale: undefined,
  elementLocale: undefined,
  onSave: undefined,
  onChange: undefined
});

/**
 * 组件的事件，来自 `SEditorEmits`（见 `./props`）。
 *
 * The component's emits, from `SEditorEmits` (see `./props`).
 */
const emits = defineEmits<SEditorEmits>();

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * 编辑器自身组件渲染时使用的 Element Plus 语言包。
 *
 * Element Plus 默认是**英文**，所以没有它，颜色选择器的按钮会显示 "OK / Clear"、下拉的
 * 空状态会显示 "No data" —— 在一个其余部分都是中文的编辑器里。在这里提供它（而不是要求
 * `app.use(ElementPlus, { locale })`）也让它保持*作用域内*：config provider 只包裹本组件
 * 的树，因此它无法改变使用方自己的 Element Plus 组件的语言。
 *
 * The Element Plus locale the editor's own components render with.
 *
 * Element Plus defaults to **English**, so without this the colour picker's buttons read
 * "OK / Clear" and a select's empty state reads "No data" — in an otherwise Chinese editor.
 * Providing it here (rather than requiring `app.use(ElementPlus, { locale })`) also keeps it
 * *scoped*: the config provider wraps this component's tree only, so it cannot change the
 * language of the consumer's own Element Plus components.
 */
const elementLocale = computed<Language>(() => props.elementLocale ?? zhCn);

/**
 * 生效的模式。`design: false` 是请求填写模式的废弃写法。
 *
 * The effective mode. `design: false` is the deprecated way of asking for fill mode.
 */
const mode = computed<EditorMode>(() => {
  if (props.mode !== undefined) return props.mode;
  return props.design === false ? "fill" : "design";
});

/**
 * 每次文档变更时自增，好让下面的 computed 重新读编辑器。
 *
 * Bumped on every document change so the computeds below re-read the editor.
 */
const changeToken = ref(0);

/**
 * 编辑器存在之后为 `true`。只被 watch，从不由运行时的 `onReady` 读取。
 *
 * `true` once the editor exists. Watched, never read from the runtime's `onReady`.
 */
const ready = ref(false);

const variableDialogOpen = ref(false);
const editingVariableAttrs = ref<VariableAttrs | undefined>(undefined);
const editingVariablePos = ref<number | undefined>(undefined);
const fillDialogOpen = ref(false);
const qrcodeDialogOpen = ref(false);

/** `local` 模板提供的文档，如果有的话。 / The document a `local` template supplies, if any. */
const localTemplateContent = computed<TemplateContent | undefined>(() =>
  props.template?.kind === "local" ? props.template.content : undefined
);

/**
 * 编辑器要打开的文档。
 *
 * 中文：优先级是 `template`（`kind: "local"`）→ `v-model`（`modelValue`）→ 旧别名 `doc`。
 * `modelValue` 必须在这里出现：它是公开契约（`v-model`），而 `doc` 只是为旧组件保留的别名 ——
 * 只读 `doc` 会让所有用 `v-model` 的调用方（包括文档站的示例）永远打开一份空文档，而且不报错。
 *
 * The document the editor opens. Precedence: a `local` `template`, then `v-model`
 * (`modelValue`), then the deprecated `doc` alias. `modelValue` has to appear here because it *is*
 * the public contract — reading only `doc` left every `v-model` caller (the documentation site's
 * demos included) with an empty document, and no error to explain it.
 */
const runtimeContent = computed<TemplateContent | undefined>(
  () => localTemplateContent.value ?? props.modelValue ?? props.doc
);

const { editor, enabledExtensions, hasExtension, setContent, values: readValues } = useEditorRuntime({
  mode,
  content: runtimeContent,
  data: computed(() => props.data),
  multiPage: computed(() => props.multiPage),
  extensions: computed(() => props.extensions),
  // The cast: the runtime merges whatever is missing from `Page.addOptions()`, so a partial object here
  // is what a caller passes and what the extension expects at run time.
  page: computed(
    () =>
      ({
        ...props.page,
        // A locked region is not editable by design; the host is the only one who can explain why.
        onLockedFurniture: () => ElMessage.warning(t.value.page.lockedRegionHint)
      }) as PageOptions
  ),
  variable: computed(() => props.variable),
  qrcode: computed(() => props.qrcode),
  watermark: computed(() => props.watermark),
  print: computed(() => props.print),

  onUpdate: () => announceChange(),

  // Only the flag and the emit: see the ordering note in the module comment. The callback
  // receives the editor, so nothing here closes over the destructured ref.
  onReady: (instance: Editor) => {
    ready.value = true;
    emits("ready", instance);
  },

  onModeChange: (next) => {
    emits("update:mode", next);
  },

  onRequestVariableEdit: (attrs, pos) => {
    openVariableDialog(attrs, pos);
  },

  onRequestQrcodeEdit: () => {
    openQrcodeDialog();
  }
});

/**
 * 功能区是否有东西可显示。空的 `tools` 会把它整个隐藏。
 *
 * Whether the ribbon has anything to show. An empty `tools` hides it entirely.
 */
const showToolbar = computed(() => (props.tools ?? DEFAULT_TOOLS).length > 0);

/**
 * 模板区块是否需要向使用方索要（即 `tools` 里点名了它）。
 *
 * Whether the caller asked for the template section at all — that is, named it in `tools`.
 */
const wantsTemplateTab = computed(() => (props.tools ?? DEFAULT_TOOLS).includes("template"));

/**
 * 填写模式下是否还显示模板区块。
 *
 * 中文：填写模式下整条功能区都是隐藏的，唯一的例外是模板 —— 但只在「远程模板地址已经配好」之外
 * 的情况下出现。配好了地址就意味着模板已经确定，此时再提供选择才是骗人；没有配则是打印员自己
 * 挑一份本机模板来填，那是真实存在的操作。
 *
 * Whether the template section is still shown in fill mode.
 *
 * In fill mode the whole ribbon is hidden, with the template as the one exception — and only when
 * a remote template URL is *not* configured. A configured URL already decides the template, so
 * offering a choice would be a lie; without one, the print operator picking a local template to
 * fill is a real action.
 */
const fillTemplateTab = computed(() => mode.value === "fill" && wantsTemplateTab.value && !isRemoteSource(props.template));

/**
 * 传给功能区的区块清单。
 *
 * 设计模式用使用方自己的清单；填写模式只放模板 —— 那时功能区里唯一有意义的区块就是它。
 *
 * The section list handed to the ribbon.
 *
 * Design mode uses the caller's own list; fill mode carries the template alone, which is the only
 * section that means anything there.
 */
const ribbonTools = computed<readonly ToolName[]>(() =>
  mode.value === "design" ? (props.tools ?? DEFAULT_TOOLS) : ["template"]
);

// ---------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------

/**
 * 注入的 `fetch`；在浏览器之外为 `undefined`。
 *
 * The injected `fetch`, or `undefined` outside a browser.
 */
function fetchImpl(): FetchLike | undefined {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return undefined;
  // Bound: some browsers throw `Illegal invocation` for an unbound `fetch`.
  return window.fetch.bind(window) as unknown as FetchLike;
}

/**
 * 环境自己的存储；不可用或被阻止的地方就没有。
 *
 * The environment's storage, or nothing where it is unavailable or blocked.
 */
function environmentStorage(): { local?: StorageLike; session?: StorageLike } {
  if (typeof window === "undefined") return {};
  try {
    return { local: window.localStorage, session: window.sessionStorage };
  } catch {
    // A privacy mode can throw on *access*, not only on write.
    return {};
  }
}

// ---------------------------------------------------------------------------------
// The stored artefact
// ---------------------------------------------------------------------------------

/**
 * 水印扩展的实时设置；未注册时为 `undefined`。
 *
 * The watermark extension's live settings, or `undefined` when it is not registered.
 */
function watermarkSettings(): TemplateWatermark | undefined {
  const instance = editor.value;
  if (!instance || !hasExtension("watermark")) return undefined;

  // Read through the extension's storage, not through a module: the extension owns the
  // shape, and a host that has not registered it has no such storage at all.
  const value = (instance.storage as unknown as { watermark?: { settings?: TemplateWatermark } }).watermark;
  return value?.settings;
}

/**
 * 构建被存储的模板。
 *
 * `version` 始终存在，易变属性永远不会被序列化 —— 见 `editor/template.ts`。页面设置与变量
 * 摘要都从**文档**读出，所以用户在改了纸张大小之后保存的模板记录的是页面上真实的尺寸，
 * 而不是某个 prop 仍然持有的尺寸。
 *
 * Build the stored template.
 *
 * `version` is always present and no volatile attribute is ever serialised — see
 * `editor/template.ts`. The page setup and the variable summary are read from the
 * **document**, so a template saved after the user changed the paper size records the size
 * that is actually on the page rather than the one a prop still holds.
 */
function getTemplate(): TemplateDocument {
  const instance = editor.value;
  const doc = instance ? instance.getJSON() : { type: "doc", content: [] };
  return buildTemplateDocument({ doc, watermark: watermarkSettings() });
}

/** 把一份已存储的页面设置推给活的文档。 / Push a stored page setup onto the live document. */
function applyPageSetup(setup: TemplatePageSetup | undefined): void {
  const instance = editor.value;
  if (!setup || !instance || !hasExtension("page")) return;

  instance.chain().focus().setPageFormat(setup.paperFormat).run();
  instance.chain().focus().setPageOrientation(setup.orientation).run();
  if (setup.margins !== undefined) instance.chain().focus().setPageMargins(setup.margins).run();
}

/** 把一份已存储的水印推给活的编辑器。 / Push a stored watermark onto the live editor. */
function applyWatermark(watermark: TemplateWatermark | undefined): void {
  const instance = editor.value;
  if (!instance || !hasExtension("watermark")) return;

  if (watermark?.enabled === true) instance.chain().focus().setWatermark({ ...watermark }).run();
  else instance.chain().focus().removeWatermark().run();
}

/**
 * 渲染一份解析后的模板：先内容，再页面设置与水印。
 *
 * Render a parsed template: content first, then the page setup and the watermark.
 */
function renderTemplate(
  content: TemplateContent,
  setup?: TemplatePageSetup,
  watermark?: TemplateWatermark
): void {
  setContent(content);
  applyPageSetup(setup);
  applyWatermark(watermark);
}

// ---------------------------------------------------------------------------------
// The template source
// ---------------------------------------------------------------------------------

const templateItems = ref<TemplateListItem[]>([]);
const templateError = ref("");
const listError = ref("");
const listLoading = ref(false);
const selectedTemplateId = ref("");

const isListSource = computed(() => isRemoteListSource(props.template));
const loadPolicy = computed(() => templateLoadPolicy(props.template));

/**
 * 随列表一起内联到达的文档，选中其中一个就不必再发请求。
 *
 * Documents that arrived inline with the list, so selecting one needs no request.
 */
let inlineTemplates = new Map<string, TemplateContent>();

/**
 * 应用 `template` prop 要求的一切。编辑器就绪后运行。
 *
 * Apply whatever the `template` prop asks for. Runs once the editor is ready.
 */
async function applyTemplateSource(): Promise<void> {
  const source = props.template;
  templateError.value = "";
  listError.value = "";

  if (!source) return;

  if (source.kind === "local") {
    if (source.content === undefined) return;
    const parsed = parseTemplateInput(source.content);
    renderTemplate(parsed.content, parsed.template.page, parsed.template.watermark);
    return;
  }

  if (source.kind === "remote") {
    try {
      const parsed = await fetchTemplate(source.url, source.headers, fetchImpl());
      renderTemplate(parsed.content, parsed.template.page, parsed.template.watermark);
    } catch (error) {
      // The editor is untouched: the user can still type, and the alert explains why the
      // requested template is not on screen.
      templateError.value = describeTemplateError(t.value, templateErrorCode(error));
    }
    return;
  }

  await loadTemplateList();
}

/**
 * 取模板列表。
 *
 * 列表在**两种**加载策略下都会被取：手动情况下，载入按钮就排在列表*后面*，所以列表必须
 * 存在，按钮才有东西可排在后面。`load` 决定的是某个模板的**内容**是否被请求并渲染 ——
 * 这才是契约所陈述的行为。
 *
 * Fetch the template list.
 *
 * The list is fetched under **both** load policies: in the manual case the load button sits
 * *after* the list, so the list has to exist for the button to sit after anything. What
 * `load` decides is whether a template's **content** is requested and rendered — which is
 * the behaviour the contract states.
 */
async function loadTemplateList(): Promise<TemplateListItem[]> {
  const source = props.template;
  if (!isRemoteListSource(source)) return [];

  listLoading.value = true;
  listError.value = "";
  try {
    const result: TemplateListResult = await fetchTemplateList(source.url, source.headers, fetchImpl());
    templateItems.value = result.items;
    inlineTemplates = new Map(result.inline);

    if (templateLoadPolicy(source) === "auto") {
      const first = result.items[0];
      // The first entry in the order the backend returned: "the newest" is a backend
      // decision, and re-sorting here would silently disagree with the list's own order.
      if (first) await selectTemplate(first.id);
    }
    return result.items;
  } catch (error) {
    listError.value = describeTemplateError(t.value, templateErrorCode(error));
    return [];
  } finally {
    listLoading.value = false;
  }
}

/** 取并渲染一个条目。 / Fetch and render one entry. */
async function selectTemplate(id: string): Promise<void> {
  selectedTemplateId.value = id;

  const inline = inlineTemplates.get(id);
  if (inline !== undefined) {
    const parsed = parseTemplateInput(inline);
    templateError.value = "";
    renderTemplate(parsed.content, parsed.template.page, parsed.template.watermark);
    return;
  }

  const source = props.template;
  if (!isRemoteListSource(source)) return;

  try {
    const url = resolveTemplateContentUrl(source, { id, name: id });
    const parsed = await fetchTemplate(url, source.headers, fetchImpl());
    templateError.value = "";
    renderTemplate(parsed.content, parsed.template.page, parsed.template.watermark);
  } catch (error) {
    templateError.value = describeTemplateError(t.value, templateErrorCode(error));
  }
}

/** 失败之后重新执行最初的请求。 / Re-run the initial request after a failure. */
function retryTemplate(): void {
  void applyTemplateSource();
}

/**
 * 从编辑器自己的空白文档新建一份模板。
 *
 * 用的是**编辑器**在没有内容时使用的那份文档（{@link emptyDocument}），而不是另一份「新建
 * 模板」的样子：两处各有一份空文档，是它们迟早会不一样的原因。选择也被清掉，因为屏幕上这份
 * 东西已经不是列表里的任何一项了。
 *
 * Start a new template from the editor's own empty document.
 *
 * It is the document the *editor* uses when it has no content ({@link emptyDocument}) rather than a
 * second idea of what a new template looks like: two empty documents are how they end up different.
 * The selection is cleared too, because what is on screen is no longer any entry in the list.
 */
function createNewTemplate(): void {
  selectedTemplateId.value = "";
  templateError.value = "";
  renderTemplate(emptyDocument());
  ElMessage.success(t.value.template.created);
}

/**
 * 载入本机保存下来的那份模板。
 *
 * 目标是使用方为保存配置的本地目标（`save: { kind: "local" }`），没有配置时就是默认的
 * `localStorage` 槽位 —— 与 {@link save} 写的是同一处，这正是「保存到本地、填写时再载入」这条
 * 路径能成立的原因。
 *
 * Load the template saved on this machine.
 *
 * The target is the local one the caller configured for saving (`save: { kind: "local" }`), and the
 * default `localStorage` slot when there is none — the same place {@link save} writes, which is what
 * makes "save locally, load it while filling" one path rather than two.
 */
function pickLocalTemplate(): void {
  const target: Extract<TemplateSaveTarget, { kind: "local" }> =
    props.save?.kind === "local" ? props.save : { kind: "local" };
  const stored = readStoredTemplate(target, environmentStorage().local);

  if (!stored) {
    ElMessage.warning(t.value.template.noLocal);
    return;
  }

  templateError.value = "";
  renderTemplate(stored.doc, stored.page, stored.watermark);
  ElMessage.success(t.value.template.localLoaded);
}

// The template request waits for the editor, and re-runs when the source prop changes.
// `ready` flipping is what makes this work: the runtime's `onReady` fires before this
// component's refs exist, so the work cannot live in that callback.
watch(
  [ready, () => props.template],
  ([isReady]) => {
    if (isReady) void applyTemplateSource();
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------------

/**
 * 文档里的每一个变量，供填写对话框与重复 key 检查使用。
 *
 * Every variable in the document, for the fill dialog and the duplicate-key check.
 */
const fillVariables = computed(() => {
  // `changeToken` is read because `collectDocumentVariables` walks a ProseMirror document,
  // which is not reactive on its own.
  void changeToken.value;
  const instance = editor.value;
  return instance ? collectDocumentVariables(instance) : [];
});

const existingKeys = computed(() => fillVariables.value.map((variable) => variable.attrs.key));

const innerVariable = computed(() => props.variable?.innerVariable ?? []);
const variableExclude = computed<readonly VariableType[]>(() => props.variable?.exclude ?? []);

/**
 * 当前的填充数据，直接从拥有它的扩展上读。
 *
 * The current fill data, straight off the extension that owns it.
 */
const fillValues = computed<VariableFillData>(() => {
  void changeToken.value;
  return readValues();
});

/**
 * 实时的页面数量，从文档读出，而不是读某个缓存的 storage 值。
 *
 * The live page count, read from the document rather than from a cached storage value.
 */
const pageCount = computed(() => {
  void changeToken.value;
  const instance = editor.value;
  return instance ? Math.max(1, findNodes(instance, "page").length) : 1;
});

/**
 * 打开设计对话框，空白或落在已有变量上。
 *
 * Open the design dialog, empty or on an existing variable.
 */
function openVariableDialog(attrs?: VariableAttrs, pos?: number): void {
  editingVariableAttrs.value = attrs;
  editingVariablePos.value = pos;
  variableDialogOpen.value = true;
}

/**
 * 打开二维码的选项弹窗。
 *
 * 没有参数也不找节点：表单从**文档**里读，所以弹窗不需要知道「编辑哪一个码」—— 节点视图在
 * 调用之前已经把它选中了，命令据此定位。从「插入」区块插入一个码之后，这个函数也会被调用。
 *
 * Open the QR code's options dialog.
 *
 * No arguments and no node lookup: the form reads from the **document**, so the dialog needs no
 * notion of "which code" — the node view has already selected it by the time this is called, and
 * the commands address it through that selection. It is also what the 插入 section calls after
 * inserting a code.
 */
function openQrcodeDialog(): void {
  qrcodeDialogOpen.value = true;
}

/**
 * 应用设计对话框的结果。
 *
 * 按位置寻址，绝不按选区：`updateVariable(pos, attrs)` 改动的是用户点的那一个变量，这正是
 * 对旧编辑路径的修复 —— 除非 `NodeSelection` 恰好落在节点上，它否则会静默地什么都不做
 * （缺陷 22）。
 *
 * Apply the design dialog's result.
 *
 * Addressed by position, never by selection: `updateVariable(pos, attrs)` touches the
 * variable the user clicked, which is the fix for the legacy edit path that silently did
 * nothing unless a `NodeSelection` happened to sit on the node (defect 22).
 */
function applyVariable(attrs: VariableAttrs, pos: number | undefined): void {
  const instance = editor.value;
  if (!instance) return;

  if (pos === undefined) {
    instance.chain().focus().insertVariable(attrs).run();
    return;
  }

  instance.chain().focus().updateVariable(pos, attrs).run();
}

/** 替换填充数据并重绘。 / Replace the fill data and repaint. */
function fill(next: VariableFillData): void {
  const instance = editor.value;
  if (!instance || !hasExtension("variable")) return;
  // Merged, not replaced: the dialog submits the fields it showed, and a key the caller
  // seeded through `data` must survive a partial submission.
  setVariableValues(instance, { ...getVariableValues(instance), ...next });
}

/** 填写对话框的结果。 / The fill dialog's result. */
function applyFill(next: VariableFillData): void {
  fill(next);
}

// ---------------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------------

/**
 * 构建变更载荷，并告知每一个问过的人。
 *
 * Build the change payload and tell everyone who asked.
 */
function announceChange(): void {
  changeToken.value += 1;

  const instance = editor.value;
  if (!instance) return;

  const template = getTemplate();
  const html = instance.getHTML();
  const event: EditorChangeEvent = { template, html };

  emits("update:modelValue", template.doc);
  emits("change", event);
  props.onChange?.(event);
}

// ---------------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------------

/**
 * 通过配置的目标保存。
 *
 * `onSave` 与 `save` emit 都在失败被重新抛出**之前**运行，所以即便失败了使用方也能听到这次
 * 尝试，而 `SaveResult.error` 为捕获它的调用方携带着原因。
 *
 * Save through the configured target.
 *
 * `onSave` and the `save` emit run **before** a failure is re-raised, so a consumer hears
 * about the attempt even when it failed, and `SaveResult.error` carries the reason for a
 * caller that catches.
 */
async function save(): Promise<SaveResult> {
  const instance = editor.value;
  const template = getTemplate();
  const html = instance ? instance.getHTML() : "";

  if (!props.save) {
    // No target: there is nothing that can fail, but `onSave` is still the caller's hook.
    const result: SaveResult = { kind: "local", template };
    props.onSave?.({ template, design: mode.value === "design" });
    emits("save", result);
    return result;
  }

  const result = await saveTemplateToTarget(props.save, {
    template,
    html,
    storage: environmentStorage(),
    fetch: fetchImpl()
  });

  props.onSave?.({ template, design: mode.value === "design" });
  emits("save", result);

  if (result.error !== undefined) throw result.error;
  return result;
}

/**
 * 工具栏的保存：保存并报告结果，绝不把异常抛进模板。
 *
 * The toolbar's 保存: save and report the outcome, never throwing into a template.
 */
async function handleSave(): Promise<void> {
  try {
    await save();
    ElMessage.success(t.value.saved);
  } catch {
    ElMessage.error(t.value.saveFailed);
  }
}

// ---------------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------------

/**
 * 通过打印扩展自己的命令打印。打印从不在这里实现。
 *
 * Print through the print extension's own command. Printing is never implemented here.
 */
function printDocument(): void {
  const instance = editor.value;
  if (!instance) {
    ElMessage.warning(t.value.notReady);
    return;
  }
  if (!hasExtension("print")) {
    // Without the print extension there are no `@page` rules and no page-break handling,
    // so the browser's own Ctrl+P is the honest answer.
    ElMessage.warning(t.value.loadFailed);
    return;
  }
  instance.chain().focus().printDocument().run();
}

// ---------------------------------------------------------------------------------
// The exposed surface
// ---------------------------------------------------------------------------------

/** 文档的 ProseMirror JSON 形式。 / The document as ProseMirror JSON. */
function getJSON(): TemplateDocument["doc"] {
  const instance = editor.value;
  return instance ? instance.getJSON() : { type: "doc", content: [] };
}

/** 文档的 HTML 形式。 / The document as HTML. */
function getHTML(): string {
  return editor.value?.getHTML() ?? "";
}

/**
 * 替换文档。接受 JSON、HTML 或完整模板。
 *
 * Replace the document. Accepts JSON, HTML, or a full template.
 */
function setTemplate(content: TemplateContent | TemplateDocument): void {
  const parsed = parseTemplateInput(content);
  renderTemplate(parsed.content, parsed.template.page, parsed.template.watermark);
}

/** 打开填写对话框。 / Open the fill dialog. */
function openFillDialog(): void {
  fillDialogOpen.value = true;
}

/** 把焦点移入文档。 / Move focus into the document. */
function focus(): void {
  editor.value?.chain().focus().run();
}

/**
 * 暴露出来的接口面，按契约标注类型。
 *
 * `editor` 暴露的是那个 ref 而不是它当前的值：这里运行时编辑器还不存在，而 `defineExpose`
 * 会在访问时解包 ref，所以调用方看到的始终是活的实例（或在它存在之前的 `undefined`，契约
 * 允许这一点）。
 *
 * The exposed surface, typed against the contract.
 *
 * `editor` is exposed as the ref rather than its current value: the editor does not exist
 * yet when this runs, and `defineExpose` unwraps a ref on access, so a caller always sees
 * the live instance (or `undefined` before it exists, which the contract allows).
 */
const exposed: SEditorExposed = {
  editor,
  getJSON,
  getHTML,
  getTemplate,
  setTemplate,
  fill,
  openFillDialog,
  print: printDocument,
  save,
  loadTemplateList,
  selectTemplate,
  focus
};

/** 把这份契约暴露到使用方的模板 ref 上。 / Expose that contract on the consumer's template ref. */
defineExpose(exposed);
</script>

<style scoped lang="scss">
.s-editor-actions {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: 10px;
  padding: 5px;
}

.s-editor-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px var(--se-workspace-padding);
  background-color: var(--se-color-paper);
}

.s-editor-print-action {
  // The legacy print button's own red, which is neither the primary blue nor
  // `--el-color-danger`. Pointing the button's tokens at the palette value keeps its hover
  // and active states consistent with the base.
  --el-button-bg-color: var(--se-color-print);
  --el-button-border-color: var(--se-color-print);
  --el-button-text-color: var(--se-color-paper);
  --el-button-hover-bg-color: var(--se-color-print);
  --el-button-hover-border-color: var(--se-color-print);
  --el-button-active-bg-color: var(--se-color-print);
  --el-button-active-border-color: var(--se-color-print);
}
</style>
