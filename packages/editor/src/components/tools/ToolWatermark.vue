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
import { IconOk, SIcon } from "@snail-js/vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { EditorLocale } from "../../editor/locale";
import type { WatermarkOptions } from "../../typings/editor";
import { ElMessage, ElForm, ElFormItem, ElSwitch, ElRadioGroup, ElRadio, ElInput, ElColorPicker, ElInputNumber, ElSlider, ElButton } from "element-plus";

/**
 * `ToolWatermark` —— 工具栏的水印区块。
 *
 * ## 为什么面板自己留一份模型副本，以及它如何保持诚实
 *
 * 水印住在*文档*上（由节点视图渲染），所以本面板不能直接改 `props.watermark`：那是在写 prop。
 * 因此它持有一份可编辑的副本，并用一条命令把它推入文档。
 *
 * 这份副本在初始化时从 prop 播种，并在模型值真正变化时重新播种。旧版页面面板是反面教材
 * （缺陷 42）：它根本不从文档初始化自己的控件，于是打开时呈现的是自己的默认值，显示出一份与
 * 它正在编辑的页面不一致的页面设置。下面的指纹检查是那项修复的后半部分 —— 使用方交来一个
 * 全新但*相等*的对象字面量时，单纯的 `deep` 侦听也会触发，那会丢掉用户正打到一半的内容。
 *
 * `setWatermark`/`removeWatermark` 命令来自水印扩展的模块增强；本组件只是调用它们。
 *
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
    /**
     * 正在运行的编辑器，在宿主创建它之前为 `undefined`。
     *
     * The running editor, `undefined` until the host has created it.
     */
    editor?: Editor;

    /** 文档当前记录的水印。 / The watermark currently recorded on the document. */
    watermark?: WatermarkOptions;

    /**
     * 部分语言覆盖，合并到中文默认值之上。
     *
     * Partial locale override, merged over the Chinese defaults.
     */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    editor: undefined,
    watermark: undefined,
    locale: undefined
  }
);

const t = computed(() => mergeEditorLocale(props.locale));

/** 水印的两种互斥形态。 / The two mutually exclusive shapes a watermark takes. */
type WatermarkKind = "text" | "image";

/**
 * 可编辑的字段。
 *
 * 与 {@link WatermarkOptions} 不同，这里每个字段都是必填的，因为表单控件无法表示「未设置」：
 * 开关非开即关，滑块总有一个值。因此面板把模型记录的默认值都实体化（`angle: -30`、
 * `opacity: 0.12`、`fontSize: "48px"`），并在模型什么都没说时把两个开关当作 `false` —— 所以
 * 按「应用水印」绝不会打开调用方没要求的标记。
 *
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

/**
 * 表单上一次播种所依据的模型值 —— 见 {@link fingerprint}。
 *
 * The model values the form was last seeded from — see {@link fingerprint}.
 */
let seededFrom = "";

/**
 * 模型自己的值，表示成一个可比较的字符串。
 *
 * 它用来区分「宿主改了水印」与「宿主只是重渲染并产出了相等的对象」。Vue 的 `deep` 侦听对新
 * 对象按身份触发，所以没有它的话，父组件重渲染会在编辑中途悄悄重置面板。
 *
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

/** 把模型值逐字段复制进表单。 / Copy a model value into the form, field by field. */
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
 * 跟随模型。
 *
 * `immediate` 让表单在首次渲染之前就完成播种 —— 一个先以默认值启动、直到第一次编辑之后才
 * 读到文档的面板，正是缺陷 42。
 *
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
 * 让属于另一种形态的字段退场。
 *
 * 扩展会渲染交给它的每一个非空字段，所以切到图片（或反向切换）时把旧文本留着，会让两种标记
 * 同时出现在纸面上。
 *
 * Retire the field that belongs to the other kind.
 *
 * The extension renders every non-empty field it is handed, so leaving the old text in
 * place while switching to an image (or the reverse) would put both marks on the sheet.
 */
function onKindChange(): void {
  if (kind.value === "image") state.text = "";
  else state.imageSrc = "";
}

/**
 * 命令需要活的编辑器；挂载之前没有可作用的对象。
 *
 * The commands need a live editor; before mount there is nothing to act on.
 */
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
