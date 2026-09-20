<template>
  <!--
    `@submit.prevent`: `el-form` renders a real `<form>`, and Enter inside the title
    input would otherwise submit it and navigate the host page away instead of printing.
  -->
  <el-form class="s-tool-print" label-width="auto" size="small" @submit.prevent>
    <el-form-item :label="t.print.paper">
      <el-select v-model="paperFormat" class="s-tool-print__select">
        <el-option :label="t.print.usingDocumentSetup" value="" />
        <el-option v-for="format in PAPER_FORMATS" :key="format" :label="format" :value="format" />
      </el-select>
    </el-form-item>

    <el-form-item :label="t.print.orientation">
      <el-select v-model="orientation" class="s-tool-print__select">
        <el-option :label="t.print.usingDocumentSetup" value="" />
        <el-option :label="t.page.portrait" value="portrait" />
        <el-option :label="t.page.landscape" value="landscape" />
      </el-select>
    </el-form-item>

    <!--
      The margins are edited in **millimetres** and handed to the command as CSS lengths
      (`"20mm"`). The legacy page panel edited centimetres against a model whose default
      was 20 mm, so a page really using 20 mm was displayed as 2.54 cm and written back
      wrong (defect 42).
    -->
    <el-form-item :label="t.print.margins">
      <div class="s-tool-print__margins">
        <label class="s-tool-print__margin">
          <span class="s-tool-print__margin-label">{{ t.page.top }}</span>
          <el-input-number
            v-model="margins.top"
            class="s-tool-print__margin-input"
            :min="0"
            :precision="1"
            :step="1"
            :controls="false"
          />
          <span class="s-tool-print__unit">mm</span>
        </label>

        <label class="s-tool-print__margin">
          <span class="s-tool-print__margin-label">{{ t.page.bottom }}</span>
          <el-input-number
            v-model="margins.bottom"
            class="s-tool-print__margin-input"
            :min="0"
            :precision="1"
            :step="1"
            :controls="false"
          />
          <span class="s-tool-print__unit">mm</span>
        </label>

        <label class="s-tool-print__margin">
          <span class="s-tool-print__margin-label">{{ t.page.left }}</span>
          <el-input-number
            v-model="margins.left"
            class="s-tool-print__margin-input"
            :min="0"
            :precision="1"
            :step="1"
            :controls="false"
          />
          <span class="s-tool-print__unit">mm</span>
        </label>

        <label class="s-tool-print__margin">
          <span class="s-tool-print__margin-label">{{ t.page.right }}</span>
          <el-input-number
            v-model="margins.right"
            class="s-tool-print__margin-input"
            :min="0"
            :precision="1"
            :step="1"
            :controls="false"
          />
          <span class="s-tool-print__unit">mm</span>
        </label>
      </div>
    </el-form-item>

    <el-form-item :label="t.print.marginBoxes">
      <el-switch v-model="marginBoxes" />
    </el-form-item>

    <!--
      A visible hint rather than a tooltip's hidden content: the sentence is a
      *capability* warning (`@page` margin boxes are Chromium 131+ only), and a warning
      the user has to hover to discover is a warning most users never read. It also
      states the fallback, which is what makes the switch safe to leave on.
    -->
    <p class="s-tool-print__hint">{{ t.print.marginBoxesHint }}</p>

    <el-form-item :label="t.print.documentTitle">
      <el-input v-model="documentTitle" />
    </el-form-item>

    <div class="s-tool-print__actions">
      <el-button class="s-tool-print__action" size="small" @click="print">
        <SIcon :icon="IconPrintFill" />
        <span>{{ t.print.action }}</span>
      </el-button>
    </div>
  </el-form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { Editor } from "@tiptap/core";
import { ElMessage } from "element-plus";
import { IconPrintFill, SIcon } from "@snail-js/vue";

import { formatCssLength, parseCssLength, toMillimetres } from "../../editor/cssLength";
import { mergeEditorLocale } from "../../editor/locale";
import type { EditorLocale } from "../../editor/locale";
import { DEFAULT_MARGINS, PAPER_SIZES, resolveMargins } from "../../typings/paper";
import type { CssLength, NamedPaperFormat, Orientation, PaperFormat } from "../../typings/paper";
import type { PrintOptions } from "../../typings/editor";

/**
 * `ToolPrint` — the print section of the toolbar.
 *
 * ## The one rule this panel exists to respect
 *
 * `PrintOptions` distances are **CSS length strings** (`"20mm"`), while a print operator
 * thinks in millimetres. The panel therefore converts on the way in and on the way out,
 * through `editor/cssLength`, and never stores a bare number in the model. The legacy
 * page panel did the opposite: it edited centimetres (`2.54`, `3.18`) against a model
 * whose default was 20 mm, so a page using 20 mm displayed as 2.54 cm (defect 42).
 *
 * ## Why "follow the document" is an empty option and not a default value
 *
 * Every control that can be left alone maps to an **omitted key**: the extension builds
 * its `@page` rule out of what it is given, so `paperFormat: ""` would not mean "no
 * opinion", it would mean "a size called nothing".
 *
 * The print action itself is exposed as `print()`, because a fill-mode footer owns its
 * own 打印 button and must not have to reach through the toolbar section.
 */
defineOptions({ name: "ToolPrint" });

const props = withDefaults(
  defineProps<{
    /** The running editor, `undefined` until the host has created it. */
    editor?: Editor;

    /** The page setup the host wants printed. */
    print?: PrintOptions;

    /** Partial locale override, merged over the Chinese defaults. */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    editor: undefined,
    print: undefined,
    locale: undefined
  }
);

const t = computed(() => mergeEditorLocale(props.locale));

/** A named paper size, or `""` for 跟随文档设置. */
type PaperFormatOption = NamedPaperFormat | "";

/** `""` for 跟随文档设置, otherwise one of the two orientations. */
type OrientationOption = Orientation | "";

/** The four sides, in the order the panel lays them out. */
type MarginSide = "top" | "right" | "bottom" | "left";

/**
 * The option list, derived from the model's own table.
 *
 * A second hand-written list is how a size ends up selectable in the UI but missing from
 * `PAPER_SIZES` (or the reverse); `Object.keys` cannot drift from the table it reads.
 */
const PAPER_FORMATS = Object.keys(PAPER_SIZES) as NamedPaperFormat[];

/** {@link DEFAULT_MARGINS} in millimetres, so the panel's fallback cannot drift from the model. */
const DEFAULT_MARGIN_MM = toMillimetres(DEFAULT_MARGINS.top) ?? 20;

const paperFormat = ref<PaperFormatOption>("A4");
const orientation = ref<OrientationOption>("");
const documentTitle = ref("");
const marginBoxes = ref(false);

/** The margins as the panel edits them: millimetres, never a CSS string. */
const margins = reactive<Record<MarginSide, number>>({
  top: DEFAULT_MARGIN_MM,
  right: DEFAULT_MARGIN_MM,
  bottom: DEFAULT_MARGIN_MM,
  left: DEFAULT_MARGIN_MM
});

/** The model values the panel was last seeded from — see {@link fingerprint}. */
let seededFrom = "";

/**
 * The format the select shows.
 *
 * A named size round-trips. A **custom** `{ name, width, height }` format has no option
 * in the list, so the select falls back to 跟随文档设置 — which omits the key and lets the
 * document's own setup win — rather than to A4, which would print a different sheet than
 * the one on screen. (`paper.ts` records the legacy version of this mistake: testing a
 * *number* for membership in a table of names, so every custom format silently became
 * A4.)
 */
function initialPaperFormat(value: PaperFormat | undefined): PaperFormatOption {
  if (value === undefined) return "A4";
  return typeof value === "string" ? value : "";
}

/**
 * One model side as millimetres.
 *
 * `parseCssLength` refuses anything that is not a single length, and `toMillimetres`
 * returns `undefined` for a unit it cannot convert (`em`/`rem` depend on the element's
 * font, which this panel cannot know). Both fall back to the default instead of letting
 * a `NaN` reach the input box.
 */
function readMillimetres(length: CssLength | undefined, fallback: number): number {
  if (parseCssLength(length) === undefined) return fallback;
  return toMillimetres(length) ?? fallback;
}

/**
 * The model's own values, as one comparable string.
 *
 * A `deep` watch fires on identity when the host passes a fresh object literal, so
 * without this fingerprint a parent re-render would reset the four margin inputs while
 * the operator was typing in them.
 */
function fingerprint(value: PrintOptions | undefined): string {
  const resolved = resolveMargins(value?.margins);
  const format = value?.paperFormat;

  return JSON.stringify([
    typeof format === "string" ? format : format?.name ?? null,
    value?.orientation ?? null,
    resolved.top,
    resolved.right,
    resolved.bottom,
    resolved.left,
    value?.marginBoxes ?? null,
    value?.documentTitle ?? null
  ]);
}

/** Copy a model value into the form. */
function seed(value: PrintOptions | undefined): void {
  paperFormat.value = initialPaperFormat(value?.paperFormat);
  orientation.value = value?.orientation ?? "";
  documentTitle.value = value?.documentTitle ?? "";
  marginBoxes.value = value?.marginBoxes ?? false;

  // `resolveMargins` first: `Margins` also allows a CSS shorthand (`"10mm 20mm"`), and
  // `parseCssLength` deliberately parses a *single* length, so a shorthand has to be
  // expanded to four sides before it can be shown in four fields.
  const resolved = resolveMargins(value?.margins);
  margins.top = readMillimetres(resolved.top, DEFAULT_MARGIN_MM);
  margins.right = readMillimetres(resolved.right, DEFAULT_MARGIN_MM);
  margins.bottom = readMillimetres(resolved.bottom, DEFAULT_MARGIN_MM);
  margins.left = readMillimetres(resolved.left, DEFAULT_MARGIN_MM);
}

/** Follow the model, seeding the panel before its first render — see `ToolWatermark`. */
watch(
  () => props.print,
  (value) => {
    const next = fingerprint(value);
    if (next === seededFrom) return;
    seededFrom = next;
    seed(value);
  },
  { deep: true, immediate: true }
);

/**
 * The `PrintOptions` the command receives.
 *
 * "Follow the document" is expressed by **omitting** the key, never by sending an empty
 * string: the extension writes an `@page` declaration from what it is given, and
 * `size: ;` is either dropped by the browser or resets the size the document declared.
 */
function buildOptions(): PrintOptions {
  const options: PrintOptions = {
    // Margins are always sent — the panel always shows four concrete values that were
    // initialised from the model, so there is no "unset" state to preserve. Each one is
    // written as a length with its unit; handing the command the bare number is the
    // defect that made a 20 mm page print as 2.54 cm.
    margins: {
      top: formatCssLength(margins.top, "mm"),
      right: formatCssLength(margins.right, "mm"),
      bottom: formatCssLength(margins.bottom, "mm"),
      left: formatCssLength(margins.left, "mm")
    },
    // A switch cannot express "unset", so it mirrors the prop: an untouched panel sends
    // `false` and cannot switch on a browser feature the caller never asked for.
    marginBoxes: marginBoxes.value
  };

  if (paperFormat.value !== "") options.paperFormat = paperFormat.value;
  if (orientation.value !== "") options.orientation = orientation.value;
  if (documentTitle.value.trim() !== "") options.documentTitle = documentTitle.value.trim();

  return options;
}

/**
 * Print the document.
 *
 * Exposed as well as bound to the button: a fill-mode footer owns its own print action
 * and needs to reach the very same options.
 *
 * The command itself takes **no arguments** — the extension reads `extension.options` when
 * it runs — so an override is written onto the extension's options object first. That is
 * the documented way for a host to change a live print configuration: rebuilding the
 * editor to change an `@page` size would throw away the user's selection.
 */
function print(): void {
  const editor = props.editor;
  if (!editor) {
    ElMessage.warning(t.value.notReady);
    return;
  }

  const extension = editor.extensionManager.extensions.find((candidate) => candidate.name === "print");
  if (!extension) {
    ElMessage.warning(t.value.notReady);
    return;
  }

  Object.assign(extension.options as Record<string, unknown>, buildOptions());
  editor.chain().focus().printDocument().run();
}

defineExpose({ print });
</script>

<style scoped lang="scss">
.s-tool-print {
  display: flex;
  flex-direction: column;
  gap: var(--se-page-gap, 8px);
  min-width: 280px;

  // The form item's default 18px bottom margin would double up with the column gap.
  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  &__select {
    width: 200px;
  }

  // Two columns of two: four number inputs with their unit do not fit on one row of the
  // toolbar pane, and a 2×2 block keeps the four sides in one visual group.
  &__margins {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px var(--se-page-gap, 8px);
    width: 100%;
  }

  &__margin {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  &__margin-label {
    color: var(--se-color-text-secondary, #666666);
    font-size: 12px;
    white-space: nowrap;
  }

  &__margin-input {
    // Without the steppers the value box is narrow; `min-width: 0` lets it shrink inside
    // the grid column instead of forcing the column wider than half the panel.
    flex: 1;
    min-width: 0;
  }

  &__unit {
    color: var(--se-color-text-secondary, #666666);
    font-size: 12px;
    // The unit is a symbol, not a word: beside the input rather than inside it, because
    // an input containing "mm" would hand the model a non-numeric string.
    white-space: nowrap;
  }

  &__hint {
    margin: 0;
    color: var(--se-color-text-secondary, #666666);
    font-size: 12px;
    line-height: 1.5;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }

  &__action {
    // The print action is the one red control in the chrome: `--se-color-print` is the
    // legacy print red, which is neither `--el-color-primary` (blue) nor
    // `--el-color-danger` (`#f56c6c`). Pointing Element Plus's own button tokens at the
    // palette value keeps the hover/active/disabled states consistent with the base.
    --el-button-bg-color: var(--se-color-print, #f53f3f);
    --el-button-border-color: var(--se-color-print, #f53f3f);
    --el-button-hover-bg-color: var(--se-color-print, #f53f3f);
    --el-button-hover-border-color: var(--se-color-print, #f53f3f);
    --el-button-active-bg-color: var(--se-color-print, #f53f3f);
    --el-button-active-border-color: var(--se-color-print, #f53f3f);
    --el-button-text-color: var(--se-color-paper, #ffffff);

    :deep(.s-icon) {
      margin-right: 4px;
    }
  }
}
</style>
