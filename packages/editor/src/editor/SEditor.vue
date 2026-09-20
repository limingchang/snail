<template>
  <div class="s-editor s-editor-scope" :class="{ 's-editor-fill': mode === 'fill' }" :aria-label="t.editor">
    <!-- Design mode: the ribbon. Fill mode: no ribbon at all — a print operator cannot
         change the template, so offering the controls would be a lie (see the mode table
         in `typings/editor.ts`). -->
    <EditorToolbar
      v-if="mode === 'design' && showToolbar"
      :editor="editor"
      :tools="props.tools"
      :extensions="enabledExtensions"
      :locale="props.locale"
      :watermark="props.watermark"
      :print="props.print"
      :on-insert-variable="() => openVariableDialog()"
      :on-edit-variable="openVariableDialog"
    />

    <div class="s-editor-workspace">
      <!-- A failed template request must not destroy the editor: the alert sits above the
           document, the editor keeps whatever it holds, and 重试 re-runs the request. The
           legacy component had no error state at all. -->
      <div v-if="templateError !== ''" class="s-editor-error">
        <el-alert type="error" :title="templateError" :closable="false" show-icon />
        <el-button size="small" @click="retryTemplate">{{ t.retry }}</el-button>
      </div>

      <TemplatePicker
        v-if="isListSource"
        class="s-editor-template-picker"
        :items="templateItems"
        :loading="listLoading"
        :error="listError"
        :load="loadPolicy"
        :model-value="selectedTemplateId"
        :locale="props.locale"
        @update:model-value="(id: string) => (selectedTemplateId = id)"
        @load="(id: string) => void selectTemplate(id)"
        @retry="() => void loadTemplateList()"
      />

      <EditorContent class="s-editor-content" :editor="editor" />
    </div>

    <div class="s-editor-actions">
      <template v-if="mode === 'design'">
        <el-button type="primary" size="small" @click="() => void handleSave()">{{ t.save }}</el-button>
      </template>
      <template v-else>
        <el-button type="primary" size="small" @click="openFillDialog">{{ t.fillAction }}</el-button>
        <el-button size="small" class="s-editor-print-action" @click="printDocument">{{ t.printAction }}</el-button>
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
  </div>
</template>

<script setup lang="ts">
/**
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
import { ElMessage } from "element-plus";

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
  TemplateWatermark
} from "../typings/editor";
import type { VariableAttrs, VariableFillData, VariableType } from "../typings/variable";

import { collectDocumentVariables, getVariableValues, setVariableValues } from "../extensions/variable";

import EditorToolbar from "../components/EditorToolbar.vue";
import FillVariableDialog from "../components/FillVariableDialog.vue";
import TemplatePicker from "../components/TemplatePicker.vue";
import VariableDialog from "../components/VariableDialog.vue";

import { findNodes } from "./documentNodes";
import { describeTemplateError, mergeEditorLocale } from "./locale";
import type { SEditorEmits, SEditorProps } from "./props";
import {
  buildTemplateDocument,
  fetchTemplate,
  fetchTemplateList,
  isRemoteListSource,
  parseTemplateInput,
  resolveTemplateContentUrl,
  saveTemplateToTarget,
  templateErrorCode,
  templateLoadPolicy
} from "./template";
import type { FetchLike, StorageLike, TemplateListResult } from "./template";
import { useEditorRuntime } from "./useEditorRuntime";

defineOptions({ name: "SEditor" });

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
  onSave: undefined,
  onChange: undefined
});

const emits = defineEmits<SEditorEmits>();

const t = computed(() => mergeEditorLocale(props.locale));

/** The effective mode. `design: false` is the deprecated way of asking for fill mode. */
const mode = computed<EditorMode>(() => {
  if (props.mode !== undefined) return props.mode;
  return props.design === false ? "fill" : "design";
});

/** Bumped on every document change so the computeds below re-read the editor. */
const changeToken = ref(0);

/** `true` once the editor exists. Watched, never read from the runtime's `onReady`. */
const ready = ref(false);

const variableDialogOpen = ref(false);
const editingVariableAttrs = ref<VariableAttrs | undefined>(undefined);
const editingVariablePos = ref<number | undefined>(undefined);
const fillDialogOpen = ref(false);

/** The document a `local` template supplies, if any. */
const localTemplateContent = computed<TemplateContent | undefined>(() =>
  props.template?.kind === "local" ? props.template.content : undefined
);

const { editor, enabledExtensions, hasExtension, setContent, values: readValues } = useEditorRuntime({
  mode,
  content: computed<TemplateContent | undefined>(() => localTemplateContent.value ?? props.doc),
  data: computed(() => props.data),
  multiPage: computed(() => props.multiPage),
  extensions: computed(() => props.extensions),
  page: computed(() => props.page),
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
  }
});

/** Whether the ribbon has anything to show. An empty `tools` hides it entirely. */
const showToolbar = computed(() => (props.tools ?? DEFAULT_TOOLS).length > 0);

// ---------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------

/** The injected `fetch`, or `undefined` outside a browser. */
function fetchImpl(): FetchLike | undefined {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return undefined;
  // Bound: some browsers throw `Illegal invocation` for an unbound `fetch`.
  return window.fetch.bind(window) as unknown as FetchLike;
}

/** The environment's storage, or nothing where it is unavailable or blocked. */
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

/** The watermark extension's live settings, or `undefined` when it is not registered. */
function watermarkSettings(): TemplateWatermark | undefined {
  const instance = editor.value;
  if (!instance || !hasExtension("watermark")) return undefined;

  // Read through the extension's storage, not through a module: the extension owns the
  // shape, and a host that has not registered it has no such storage at all.
  const value = (instance.storage as unknown as { watermark?: { settings?: TemplateWatermark } }).watermark;
  return value?.settings;
}

/**
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

/** Push a stored page setup onto the live document. */
function applyPageSetup(setup: TemplatePageSetup | undefined): void {
  const instance = editor.value;
  if (!setup || !instance || !hasExtension("page")) return;

  instance.chain().focus().setPageFormat(setup.paperFormat).run();
  instance.chain().focus().setPageOrientation(setup.orientation).run();
  if (setup.margins !== undefined) instance.chain().focus().setPageMargins(setup.margins).run();
}

/** Push a stored watermark onto the live editor. */
function applyWatermark(watermark: TemplateWatermark | undefined): void {
  const instance = editor.value;
  if (!instance || !hasExtension("watermark")) return;

  if (watermark?.enabled === true) instance.chain().focus().setWatermark({ ...watermark }).run();
  else instance.chain().focus().removeWatermark().run();
}

/** Render a parsed template: content first, then the page setup and the watermark. */
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

/** Documents that arrived inline with the list, so selecting one needs no request. */
let inlineTemplates = new Map<string, TemplateContent>();

/** Apply whatever the `template` prop asks for. Runs once the editor is ready. */
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

/** Fetch and render one entry. */
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

/** Re-run the initial request after a failure. */
function retryTemplate(): void {
  void applyTemplateSource();
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

/** Every variable in the document, for the fill dialog and the duplicate-key check. */
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

/** The current fill data, straight off the extension that owns it. */
const fillValues = computed<VariableFillData>(() => {
  void changeToken.value;
  return readValues();
});

/** The live page count, read from the document rather than from a cached storage value. */
const pageCount = computed(() => {
  void changeToken.value;
  const instance = editor.value;
  return instance ? Math.max(1, findNodes(instance, "page").length) : 1;
});

/** Open the design dialog, empty or on an existing variable. */
function openVariableDialog(attrs?: VariableAttrs, pos?: number): void {
  editingVariableAttrs.value = attrs;
  editingVariablePos.value = pos;
  variableDialogOpen.value = true;
}

/**
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

/** Replace the fill data and repaint. */
function fill(next: VariableFillData): void {
  const instance = editor.value;
  if (!instance || !hasExtension("variable")) return;
  // Merged, not replaced: the dialog submits the fields it showed, and a key the caller
  // seeded through `data` must survive a partial submission.
  setVariableValues(instance, { ...getVariableValues(instance), ...next });
}

/** The fill dialog's result. */
function applyFill(next: VariableFillData): void {
  fill(next);
}

// ---------------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------------

/** Build the change payload and tell everyone who asked. */
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

/** The toolbar's 保存: save and report the outcome, never throwing into a template. */
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

/** Print through the print extension's own command. Printing is never implemented here. */
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

function getJSON(): TemplateDocument["doc"] {
  const instance = editor.value;
  return instance ? instance.getJSON() : { type: "doc", content: [] };
}

function getHTML(): string {
  return editor.value?.getHTML() ?? "";
}

function setTemplate(content: TemplateContent | TemplateDocument): void {
  const parsed = parseTemplateInput(content);
  renderTemplate(parsed.content, parsed.template.page, parsed.template.watermark);
}

function openFillDialog(): void {
  fillDialogOpen.value = true;
}

function focus(): void {
  editor.value?.chain().focus().run();
}

/**
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
