<template>
  <div class="s-tool-page">
    <!-- Paper ------------------------------------------------------------------ -->
    <div class="s-tool-page__group">
      <el-select v-model="paperFormat" size="small" class="s-tool-page__select" @change="applyPaperFormat">
        <template #prefix><SIcon :icon="IconPageSize" /></template>
        <el-option v-for="option in PAPER_FORMAT_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>

      <el-select v-model="orientation" size="small" class="s-tool-page__select" @change="applyOrientation">
        <template #prefix><SIcon :icon="IconPageOrientation" /></template>
        <el-option v-for="option in ORIENTATION_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
    </div>

    <!-- Margins --------------------------------------------------------------- -->
    <div class="s-tool-page__group">
      <el-dropdown trigger="click" @command="applyMarginPreset">
        <el-button size="small">
          <SIcon :icon="IconPageMargin" />
          <span class="s-tool-page__label">{{ t.page.margins }}</span>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="preset in MARGIN_PRESETS" :key="preset.label" :command="preset.label">
              <span class="s-tool-page__preset">{{ preset.label }}</span>
              <span class="s-tool-page__preset-values">
                {{ t.page.top }}:{{ preset.value.top }} {{ t.page.bottom }}:{{ preset.value.bottom }}
                {{ t.page.left }}:{{ preset.value.left }} {{ t.page.right }}:{{ preset.value.right }}
              </span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- Custom margins, in the model's own unit (mm) and initialised from the
           document. The legacy panel held centimetres against a millimetre model
           (defect 42), which displayed 2.54 cm for a 2 cm page. -->
      <div class="s-tool-page__margins">
        <div v-for="side in MARGIN_SIDES" :key="side.key" class="s-tool-page__margin">
          <span class="s-tool-page__side">{{ side.label }}</span>
          <el-input-number
            v-model="margins[side.key]"
            size="small"
            :min="0"
            :step="1"
            :precision="1"
            :controls="false"
            class="s-tool-page__number"
            @change="applyMargins"
          />
          <span class="s-tool-page__unit">mm</span>
        </div>
      </div>
    </div>

    <!-- Header / footer -------------------------------------------------------- -->
    <div class="s-tool-page__group s-tool-page__group--column">
      <div class="s-tool-page__row">
        <el-switch :model-value="hasHeader" size="small" :active-text="t.page.header" @change="toggleHeader" />
        <el-switch :model-value="hasFooter" size="small" :active-text="t.page.footer" @change="toggleFooter" />
      </div>
      <div class="s-tool-page__row">
        <span class="s-tool-page__side">{{ t.page.headerFooterHeight }}</span>
        <el-input-number
          v-model="regionHeight"
          size="small"
          :min="0"
          :step="4"
          :controls="false"
          :disabled="!hasHeader && !hasFooter"
          class="s-tool-page__number"
          @change="applyRegionHeight"
        />
        <span class="s-tool-page__unit">px</span>
        <span class="s-tool-page__side">{{ t.page.alignment }}</span>
        <el-select
          v-model="regionAlign"
          size="small"
          class="s-tool-page__align"
          :disabled="!hasHeader && !hasFooter"
          @change="applyRegionAlign"
        >
          <el-option v-for="option in ALIGN_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </div>
    </div>

    <!-- Page number ------------------------------------------------------------ -->
    <div class="s-tool-page__group s-tool-page__group--column">
      <div class="s-tool-page__row">
        <span class="s-tool-page__side">{{ t.page.pageNumber }}</span>
        <!-- `allow-create` is what makes a custom pattern possible: the stored value is
             one string on the `pageNumber` node, so a preset and a hand-written pattern
             are the same kind of thing. -->
        <el-select
          v-model="pageNumberFormat"
          size="small"
          class="s-tool-page__page-number"
          filterable
          allow-create
          default-first-option
          :disabled="!hasFooter"
          @change="applyPageNumberFormat"
        >
          <el-option v-for="preset in PAGE_NUMBER_PRESETS" :key="preset.value" :label="preset.label" :value="preset.value" />
        </el-select>
      </div>
      <p class="s-tool-page__hint">{{ t.page.pageNumberTokens }}</p>
    </div>

    <!-- Page break and logo ---------------------------------------------------- -->
    <div class="s-tool-page__group s-tool-page__group--column">
      <el-button size="small" @click="insertPageBreak">
        <el-icon><Scissor /></el-icon>
        <span class="s-tool-page__label">{{ t.page.insertPageBreak }}</span>
      </el-button>

      <div class="s-tool-page__row">
        <el-switch :model-value="hasLogo" size="small" :active-text="t.page.logo" @change="toggleLogo" />
        <el-select v-model="logoPosition" size="small" class="s-tool-page__align" :disabled="!hasLogo" @change="applyLogoPosition">
          <el-option v-for="option in LOGO_POSITIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolPage` — paper, margins, header/footer, page numbering and the page logo.
 *
 * ## Everything is read from the document when it opens
 *
 * The legacy panel created its own `pageSettings` with Word's defaults and never read the
 * document (defect 42), so it described a page it had not looked at, and its first edit
 * silently reset the real page to those defaults. `sync()` below reads the first `page`
 * node, the first `pageHeader`/`pageFooter` and the first `pageNumber` on every selection
 * change, so the controls always describe the document.
 *
 * ## Why the region height is written by position
 *
 * `updateAttributes` only touches the current selection, and the caret is inside the page
 * *content* — never on the header node — so it would silently do nothing (the same class
 * of bug as defect 22). `updateNodesOfType` addresses every header in one transaction, so
 * "the header height" means all of them.
 *
 * ## Attribute-name tolerance
 *
 * Defect 20 is a spelling drift between a node attribute and an extension option
 * (`headerLing`/`headerLine`). Since the region attribute names are not part of the
 * published contract, the panel *reads* every plausible spelling and *writes* the two
 * canonical ones; ProseMirror drops an attribute the schema does not declare, so a
 * mismatch is a no-op rather than a corruption.
 */

import { computed, reactive, ref } from "vue";

import { Scissor } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

import { SIcon } from "@snail-js/vue";
import { IconPageMargin, IconPageOrientation, IconPageSize } from "@snail-js/vue";

import { DEFAULT_MARGINS, resolveMargins } from "../../typings/paper";
import type { NamedPaperFormat, ResolvedMargins } from "../../typings/paper";
import { formatCssLength, toMillimetres } from "../../editor/cssLength";
import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import {
  findNodes,
  readDocumentPageSetup,
  readPageNumberFormat,
  updateNodesOfType
} from "../../editor/documentNodes";
import { useEditorSelection } from "../../editor/useEditorSelection";
import { ALIGN_OPTIONS, LOGO_POSITIONS, MARGIN_PRESETS, ORIENTATION_OPTIONS, PAGE_NUMBER_PRESETS, PAPER_FORMAT_OPTIONS } from "./constants";

defineOptions({ name: "ToolPage" });

const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

/** `true` for a named paper size. `PAPER_SIZES` is the model's own table. */
function asPaperFormat(value: unknown): NamedPaperFormat | undefined {
  const names = PAPER_FORMAT_OPTIONS.map((option) => option.value as string);
  return typeof value === "string" && names.includes(value) ? (value as NamedPaperFormat) : undefined;
}

/** `true` for one of the two orientations. */
function asOrientation(value: unknown): "portrait" | "landscape" | undefined {
  return value === "portrait" || value === "landscape" ? value : undefined;
}

/** Read a `Margins` value — either a CSS shorthand string or the per-side object. */
function asMargins(value: unknown): ResolvedMargins {
  if (typeof value === "string") return resolveMargins(value);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (
      typeof record.top === "string" &&
      typeof record.right === "string" &&
      typeof record.bottom === "string" &&
      typeof record.left === "string"
    ) {
      return resolveMargins({
        top: record.top,
        right: record.right,
        bottom: record.bottom,
        left: record.left
      });
    }
  }
  return { ...DEFAULT_MARGINS };
}

/** Millimetres, as a number, for an `el-input-number`. */
function millimetres(value: string | undefined, fallback: number): number {
  const millimetres = toMillimetres(value);
  return millimetres === undefined ? fallback : Math.round(millimetres * 10) / 10;
}

const paperFormat = ref<NamedPaperFormat>("A4");
const orientation = ref<"portrait" | "landscape">("portrait");
const margins = reactive<Record<"top" | "right" | "bottom" | "left", number>>({
  top: millimetres(DEFAULT_MARGINS.top, 20),
  right: millimetres(DEFAULT_MARGINS.right, 20),
  bottom: millimetres(DEFAULT_MARGINS.bottom, 20),
  left: millimetres(DEFAULT_MARGINS.left, 20)
});

const hasHeader = ref(false);
const hasFooter = ref(false);
// The furniture box height is a **number of CSS pixels** in the model, not a CSS length:
// it is the value the layout solver feeds back into the available-height computation.
const regionHeight = ref(0);
const regionAlign = ref<"left" | "center" | "right" | "justify">("center");
const pageNumberFormat = ref("- # -");
const hasLogo = ref(false);
const logoPosition = ref<"left" | "center" | "right">("left");

/** The four margin sides, as data, so the template is one `v-for`. */
const MARGIN_SIDES = computed(() => [
  { key: "top" as const, label: t.value.page.top },
  { key: "bottom" as const, label: t.value.page.bottom },
  { key: "left" as const, label: t.value.page.left },
  { key: "right" as const, label: t.value.page.right }
]);

/** Re-read the whole panel from the document. */
function sync(): void {
  const editor = props.editor;
  if (!editor) return;

  const setup = readDocumentPageSetup(editor);
  paperFormat.value = asPaperFormat(setup.paperFormat) ?? paperFormat.value;
  orientation.value = asOrientation(setup.orientation) ?? orientation.value;

  const resolved = asMargins(setup.margins);
  margins.top = millimetres(resolved.top, margins.top);
  margins.right = millimetres(resolved.right, margins.right);
  margins.bottom = millimetres(resolved.bottom, margins.bottom);
  margins.left = millimetres(resolved.left, margins.left);

  const header = findNodes(editor, "pageHeader")[0];
  const footer = findNodes(editor, "pageFooter")[0];
  hasHeader.value = header !== undefined;
  hasFooter.value = footer !== undefined;
  hasLogo.value = findNodes(editor, "pageLogo").length > 0;

  // The region height and alignment live on whichever region exists; the header wins
  // because it is the one the user sees first. Both are read from the **node**, never from
  // the extension's options — reading `this.options.height` instead of `node.attrs.height`
  // is exactly what made a per-node height uneditable in the legacy build (defect 20).
  const height = header?.attrs.height ?? footer?.attrs.height;
  if (typeof height === "number") regionHeight.value = height;

  const align = header?.attrs.align ?? footer?.attrs.align;
  if (align === "left" || align === "center" || align === "right" || align === "justify") {
    regionAlign.value = align;
  }

  const logo = findNodes(editor, "pageLogo")[0]?.attrs.position;
  if (logo === "left" || logo === "right") logoPosition.value = logo;

  pageNumberFormat.value = readPageNumberFormat(editor) ?? pageNumberFormat.value;
}

useEditorSelection(() => props.editor, sync);

/** `true` when the page extension is registered, so its commands exist. */
const pageReady = computed(
  () => props.editor?.extensionManager.extensions.some((extension) => extension.name === "page") ?? false
);

function applyPaperFormat(value: NamedPaperFormat): void {
  props.editor?.chain().focus().setPageFormat(value).run();
}

function applyOrientation(value: "portrait" | "landscape"): void {
  props.editor?.chain().focus().setPageOrientation(value).run();
}

/** A preset writes each side as a millimetre length, which is the model's own unit. */
function applyMarginPreset(label: string): void {
  const preset = MARGIN_PRESETS.find((candidate) => candidate.label === label);
  if (!preset) return;

  margins.top = millimetres(preset.value.top, margins.top);
  margins.right = millimetres(preset.value.right, margins.right);
  margins.bottom = millimetres(preset.value.bottom, margins.bottom);
  margins.left = millimetres(preset.value.left, margins.left);
  applyMargins();
}

/** Apply all four custom margins in one transaction. */
function applyMargins(): void {
  props.editor
    ?.chain()
    .focus()
    .setPageMargins({
      top: formatCssLength(margins.top, "mm"),
      right: formatCssLength(margins.right, "mm"),
      bottom: formatCssLength(margins.bottom, "mm"),
      left: formatCssLength(margins.left, "mm")
    })
    .run();
}

function ensurePage(): boolean {
  if (pageReady.value) return true;
  ElMessage.warning(t.value.notReady);
  return false;
}

function toggleHeader(enabled: boolean | string | number): void {
  if (!ensurePage()) return;
  if (enabled === true) props.editor?.chain().focus().addHeader().run();
  else props.editor?.chain().focus().removeHeader().run();
}

function toggleFooter(enabled: boolean | string | number): void {
  if (!ensurePage()) return;
  if (enabled === true) props.editor?.chain().focus().addFooter().run();
  else props.editor?.chain().focus().removeFooter().run();
}

function applyRegionHeight(): void {
  // The extension's own commands, not a raw attribute write: they know the value is a
  // pixel number, and they return `false` when nothing changed (defect 17's contract).
  props.editor?.chain().focus().setHeaderHeight(regionHeight.value).run();
  props.editor?.chain().focus().setFooterHeight(regionHeight.value).run();
}

function applyRegionAlign(): void {
  props.editor?.chain().focus().setHeaderAlign(regionAlign.value).run();
  props.editor?.chain().focus().setFooterAlign(regionAlign.value).run();
}

/** Write the pattern onto every `pageNumber` node in the document. */
function applyPageNumberFormat(value: string): void {
  if (value === "") return;
  const changed = updateNodesOfType(props.editor, "pageNumber", { format: value });
  if (changed === 0) {
    // No page-number node exists yet — creating one is the footer's own job, so the panel
    // says what it did rather than leaving the user to wonder why nothing changed.
    ElMessage.warning(t.value.page.pageNumberMissing);
  }
}

function insertPageBreak(): void {
  if (!ensurePage()) return;
  props.editor?.chain().focus().insertPageBreak().run();
}

function toggleLogo(enabled: boolean | string | number): void {
  if (!ensurePage()) return;
  if (enabled === true) {
    // `addLogo` both creates and updates, so the position is part of the same call.
    props.editor?.chain().focus().addLogo({ position: logoPosition.value }).run();
    return;
  }
  props.editor?.chain().focus().removeLogo().run();
}

function applyLogoPosition(): void {
  props.editor?.chain().focus().setLogoPosition(logoPosition.value).run();
}
</script>

<style scoped lang="scss">
.s-tool-page {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;

  &__group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    &--column {
      min-width: 250px;
    }
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  &__select {
    width: 190px;
  }

  &__align {
    width: 110px;
  }

  &__page-number {
    width: 200px;
  }

  &__margins {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 250px;
  }

  &__margin {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  &__number {
    width: 70px;
  }

  &__side,
  &__unit {
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }

  &__label {
    margin-left: 4px;
  }

  &__hint {
    margin: 0;
    max-width: 260px;
    color: var(--se-color-text-secondary);
    font-size: 12px;
    line-height: 1.4;
  }

  &__preset {
    display: block;
  }

  &__preset-values {
    display: block;
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }
}
</style>
