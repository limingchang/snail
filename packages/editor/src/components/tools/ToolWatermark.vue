<template>
  <!--
    `@submit.prevent`: `el-form` renders a real `<form>`, and an implicit submit from
    Enter inside one of the inputs would navigate the host page away. The two buttons at
    the bottom are the only way this panel acts on the document.
  -->
  <el-form class="s-tool-watermark" label-width="auto" size="small" @submit.prevent>
    <el-form-item :label="t.watermark.enable">
      <el-switch v-model="state.enabled" />
    </el-form-item>

    <el-form-item :label="t.watermark.kind">
      <el-radio-group v-model="kind" @change="onKindChange">
        <el-radio value="text">{{ t.watermark.text }}</el-radio>
        <el-radio value="image">{{ t.watermark.image }}</el-radio>
      </el-radio-group>
    </el-form-item>

    <!--
      `v-if`/`v-else` instead of two permanently rendered rows: a font size is not a
      meaningful control for an image mark, and a hidden-but-present input still takes
      part in `el-form` validation and in a screen reader's reading order.
    -->
    <template v-if="kind === 'text'">
      <el-form-item :label="t.watermark.text">
        <el-input v-model="state.text" />
      </el-form-item>

      <el-form-item :label="t.watermark.fontSize">
        <!--
          `48px` is a unit sample, not prose — it is the value `WatermarkOptions`
          documents as the font-size default, so it deliberately stays out of the locale
          table.
        -->
        <el-input v-model="state.fontSize" placeholder="48px" />
      </el-form-item>

      <el-form-item :label="t.watermark.color">
        <el-color-picker v-model="state.color" />
      </el-form-item>
    </template>

    <el-form-item v-else :label="t.watermark.image">
      <!-- The placeholder is a URL shape, not a sentence: the only string here that a
           translator could want is the field label, which already comes from the table. -->
      <el-input v-model="state.imageSrc" placeholder="https://…" />
    </el-form-item>

    <el-form-item :label="t.watermark.angle">
      <div class="s-tool-watermark__control">
        <el-input-number v-model="state.angle" :min="-180" :max="180" :step="5" />
        <!-- Degrees are a unit symbol, not a word: beside the control rather than inside
             it, because `el-input-number` has no suffix slot and an input that contains
             "°" would hand the model a non-numeric string. -->
        <span class="s-tool-watermark__unit">°</span>
      </div>
    </el-form-item>

    <el-form-item :label="t.watermark.opacity">
      <div class="s-tool-watermark__control">
        <el-slider
          v-model="state.opacity"
          class="s-tool-watermark__slider"
          :min="0"
          :max="1"
          :step="0.01"
        />
        <!-- The slider's own tooltip only shows while dragging, so the current value
             stays visible next to it. -->
        <span class="s-tool-watermark__value">{{ state.opacity }}</span>
      </div>
    </el-form-item>

    <el-form-item :label="t.watermark.greyscale">
      <el-switch v-model="state.greyscale" />
    </el-form-item>

    <el-form-item :label="t.watermark.tiled">
      <el-switch v-model="state.tiled" />
    </el-form-item>

    <div class="s-tool-watermark__actions">
      <el-button type="primary" size="small" @click="apply">
        <SIcon :icon="IconOk" />
        <span>{{ t.watermark.apply }}</span>
      </el-button>
      <el-button size="small" @click="remove">{{ t.watermark.remove }}</el-button>
    </div>
  </el-form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { Editor } from "@tiptap/core";
import { ElMessage } from "element-plus";
import { IconOk, SIcon } from "@snail-js/vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { EditorLocale } from "../../editor/locale";
import type { WatermarkOptions } from "../../typings/editor";

/**
 * `ToolWatermark` — the watermark section of the toolbar.
 *
 * ## Why the panel keeps its own copy of the model, and how it stays honest
 *
 * The watermark lives on the *document* (a node view renders it), so this panel cannot
 * mutate `props.watermark` directly: it would be writing to a prop. It therefore holds
 * an editable copy and pushes it into the document with one command.
 *
 * The copy is seeded from the prop on setup and re-seeded whenever the model's values
 * actually change. The legacy page panel is the cautionary tale (defect 42): it never
 * initialised its controls from the document at all, so it opened on its own defaults
 * and showed a page setup that disagreed with the page it was editing. The fingerprint
 * check below is the second half of that fix — a plain `deep` watch fires when the host
 * hands over a fresh but *equal* object literal, which would throw away whatever the
 * user was in the middle of typing.
 *
 * The `setWatermark`/`removeWatermark` commands come from the watermark extension's
 * module augmentation; this component only calls them.
 */
defineOptions({ name: "ToolWatermark" });

const props = withDefaults(
  defineProps<{
    /** The running editor, `undefined` until the host has created it. */
    editor?: Editor;

    /** The watermark currently recorded on the document. */
    watermark?: WatermarkOptions;

    /** Partial locale override, merged over the Chinese defaults. */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    editor: undefined,
    watermark: undefined,
    locale: undefined
  }
);

const t = computed(() => mergeEditorLocale(props.locale));

/** The two mutually exclusive shapes a watermark takes. */
type WatermarkKind = "text" | "image";

/**
 * The editable fields.
 *
 * Every field is required here, unlike in {@link WatermarkOptions}, because a form
 * control cannot represent "unset": a switch is on or off and a slider always has a
 * value. The panel therefore materialises the defaults the model documents
 * (`angle: -30`, `opacity: 0.12`, `fontSize: "48px"`), and treats the two switches as
 * `false` when the model says nothing — so pressing 应用水印 never switches on a mark
 * the caller did not ask for.
 */
interface WatermarkForm {
  enabled: boolean;
  text: string;
  imageSrc: string;
  fontSize: string;
  color: string;
  angle: number;
  opacity: number;
  greyscale: boolean;
  tiled: boolean;
}

const state = reactive<WatermarkForm>({
  enabled: false,
  text: "",
  imageSrc: "",
  fontSize: "48px",
  // `WatermarkOptions` documents no colour default, so the picker opens on a light
  // neutral grey: visible on white paper, quiet enough not to compete with the contract.
  color: "#c0c4cc",
  angle: -30,
  opacity: 0.12,
  greyscale: false,
  tiled: false
});

const kind = ref<WatermarkKind>("text");

/** The model values the form was last seeded from — see {@link fingerprint}. */
let seededFrom = "";

/**
 * The model's own values, as one comparable string.
 *
 * This is what tells "the host changed the watermark" apart from "the host re-rendered
 * and produced an equal object". Vue's `deep` watch fires on identity for a new object,
 * so without this a parent re-render would silently reset the panel mid-edit.
 */
function fingerprint(value: WatermarkOptions | undefined): string {
  const source = value ?? {};
  return JSON.stringify([
    source.enabled ?? null,
    source.text ?? null,
    source.imageSrc ?? null,
    source.fontSize ?? null,
    source.color ?? null,
    source.angle ?? null,
    source.opacity ?? null,
    source.greyscale ?? null,
    source.tiled ?? null
  ]);
}

/** Copy a model value into the form, field by field. */
function seed(value: WatermarkOptions | undefined): void {
  const source = value ?? {};

  state.enabled = source.enabled ?? false;
  state.text = source.text ?? "";
  state.imageSrc = source.imageSrc ?? "";
  state.fontSize = source.fontSize ?? "48px";
  state.color = source.color ?? "#c0c4cc";
  state.angle = source.angle ?? -30;
  state.opacity = source.opacity ?? 0.12;
  state.greyscale = source.greyscale ?? false;
  state.tiled = source.tiled ?? false;

  // `kind` decides which fields the panel *shows*. Text wins when a stored watermark
  // somehow carries both, because the text form is the one with a size and a colour.
  kind.value = state.text !== "" || state.imageSrc === "" ? "text" : "image";
}

/**
 * Follow the model.
 *
 * `immediate` seeds the form before it is ever rendered — a panel that starts on
 * defaults and only picks up the document after the first edit is exactly defect 42.
 */
watch(
  () => props.watermark,
  (value) => {
    const next = fingerprint(value);
    if (next === seededFrom) return;
    seededFrom = next;
    seed(value);
  },
  { deep: true, immediate: true }
);

/**
 * Retire the field that belongs to the other kind.
 *
 * The extension renders every non-empty field it is handed, so leaving the old text in
 * place while switching to an image (or the reverse) would put both marks on the sheet.
 */
function onKindChange(): void {
  if (kind.value === "image") state.text = "";
  else state.imageSrc = "";
}

/** The commands need a live editor; before mount there is nothing to act on. */
function requireEditor(): Editor | undefined {
  const editor = props.editor;
  if (!editor) ElMessage.warning(t.value.notReady);
  return editor;
}

function apply(): void {
  const editor = requireEditor();
  if (!editor) return;

  // `kind` is deliberately not in the payload: `WatermarkOptions` has no such key, and
  // `onKindChange` has already emptied the field belonging to the other kind.
  editor.chain().focus().setWatermark({ ...state }).run();
}

function remove(): void {
  const editor = requireEditor();
  if (!editor) return;

  editor.chain().focus().removeWatermark().run();
}
</script>

<style scoped lang="scss">
.s-tool-watermark {
  display: flex;
  flex-direction: column;
  // A wrapping flex row of panels owns the outer layout, so the panel's own spacing is
  // the only vertical rhythm it can rely on.
  gap: var(--se-page-gap, 8px);
  min-width: 240px;

  // The form item's default 18px bottom margin would double up with the column gap and
  // make this the tallest thing in the toolbar.
  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  &__control {
    display: flex;
    align-items: center;
    gap: var(--se-page-gap, 8px);
    // `el-form-item__content` is itself a wrapping flex container; a control that wants
    // the whole row has to ask for it.
    width: 100%;
  }

  &__slider {
    flex: 1;
    min-width: 120px;
  }

  &__unit,
  &__value {
    color: var(--se-color-text-secondary, #666666);
    font-size: 12px;
    white-space: nowrap;
  }

  &__value {
    // A fixed box keeps the rows' controls on one vertical line as the value's width
    // changes (0.12 → 1).
    min-width: 28px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--se-page-gap, 8px);

    // `SIcon` renders an `<i class="s-icon">`, not an `.el-icon`, so Element Plus's own
    // icon-to-label spacing rule does not reach it.
    :deep(.s-icon) {
      margin-right: 4px;
    }
  }
}
</style>
