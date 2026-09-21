<template>
  <div class="s-tool-font">
    <div class="s-tool-font__row">
      <el-select
        v-model="fontFamily"
        class="s-tool-font__family"
        size="small"
        filterable
        :placeholder="t.font.family"
        @change="applyFamily"
      >
        <el-option v-for="option in familyOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>

      <el-select
        v-model="fontSize"
        class="s-tool-font__size"
        size="small"
        :placeholder="t.font.size"
        @change="applySize"
      >
        <el-option v-for="option in sizeOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
    </div>

    <div class="s-tool-font__row">
      <el-button-group>
        <el-button size="small" :type="bold ? 'primary' : 'default'" :title="t.font.bold" @click="toggle('bold')">
          <SIcon :icon="IconBold" />
        </el-button>
        <el-button size="small" :type="italic ? 'primary' : 'default'" :title="t.font.italic" @click="toggle('italic')">
          <SIcon :icon="IconItalic" />
        </el-button>
        <el-button
          size="small"
          :type="underline ? 'primary' : 'default'"
          :title="t.font.underline"
          @click="toggle('underline')"
        >
          <SIcon :icon="IconUnderline" />
        </el-button>
        <el-button size="small" :type="strike ? 'primary' : 'default'" :title="t.font.strike" @click="toggle('strike')">
          <SIcon :icon="IconStrike" />
        </el-button>
      </el-button-group>
    </div>

    <!--
      Text colour and background colour. Both are attributes of the same `textStyle` mark, so
      they apply to the selection exactly like the family and size above — and both were
      registered all along (`TextStyleKit` includes `Color` and `BackgroundColor` unless they
      are explicitly disabled), they simply had no control.

      Both triggers are drawn as Word's capital "A": see the `.s-tool-font__color` rules below
      for why the glyph is CSS rather than an SVG icon.
    -->
    <div class="s-tool-font__row s-tool-font__row--colors">
      <span class="s-tool-font__label">{{ t.font.color }}</span>
      <!--
        未选颜色时不写这个变量，交给样式表里的默认值（字体颜色：黑色色条；字体背景色：白底加描边）。
        Setting the custom property only when a colour exists lets the stylesheet's defaults apply —
        writing `transparent` for "not set" left both controls looking dead.
      -->
      <el-color-picker
        v-model="color"
        class="s-tool-font__color s-tool-font__color--text"
        size="small"
        :title="t.font.color"
        :predefine="TEXT_COLORS"
        popper-class="s-editor-popper"
        :style="color ? { '--s-tool-color-value': color } : undefined"
        @change="applyColor"
      />

      <span class="s-tool-font__label">{{ t.font.backgroundColor }}</span>
      <el-color-picker
        v-model="backgroundColor"
        class="s-tool-font__color s-tool-font__color--background"
        size="small"
        :title="t.font.backgroundColor"
        :predefine="BACKGROUND_COLORS"
        popper-class="s-editor-popper"
        :style="backgroundColor ? { '--s-tool-color-value': backgroundColor } : undefined"
        @change="applyBackgroundColor"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolFont` —— 字体族/字号下拉，以及四个行内标记的开关。
 *
 * ## 为什么下拉会跟随光标
 *
 * 旧版下拉只读**一次** `editor.getAttributes("textStyle")`，因此显示的永远是工具栏挂载时
 * 光标所在处的值，之后再也不变；修法是 `useEditorSelection`，它在 `selectionUpdate` *和*
 * `update` 时重新读取（属性变化不会移动光标，所以只靠 `update` 也不够）。
 *
 * ## 为什么不在清单里的值也会显示
 *
 * 模板可能带有下拉未列出的字体族 —— 粘贴来的内容，或使用方自己的 `TextStyleKit` 配置。
 * 与其渲染一个空下拉，不如把当前值作为独立选项前置，这样面板描述文档时不会说谎。
 *
 * `ToolFont` — the font family/size selects and the four inline-mark toggles.
 *
 * ## Why the selects follow the caret
 *
 * The legacy selects read `editor.getAttributes("textStyle")` **once**, so they showed
 * whatever the caret was on when the toolbar mounted and then never changed; the fix is
 * `useEditorSelection`, which re-reads on `selectionUpdate` *and* `update` (an attribute
 * change does not move the caret, so `update` alone is not enough either).
 *
 * ## Why a value outside the list is still shown
 *
 * A template may carry a family the pick-list does not name — pasted content, a
 * consumer's own `TextStyleKit` configuration. Rather than render an empty select, the
 * current value is prepended as its own option, so the panel never lies about what the
 * document holds.
 */

import { computed, ref } from "vue";

import { SIcon } from "@snail-js/vue";

import { useEditorSelection } from "../../editor/useEditorSelection";
import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { FONT_FAMILIES, FONT_SIZES } from "./constants";
import type { Choice } from "./constants";
import { IconBold, IconItalic, IconStrike, IconUnderline } from "../icons";
import { ElSelect, ElOption, ElButtonGroup, ElButton, ElColorPicker } from "element-plus";

defineOptions({ name: "ToolFont" });

/**
 * 本面板的 props：编辑器实例与语言覆盖，二者都来自 `ToolProps`，默认均为 `undefined`。
 *
 * This panel's props: the editor and the locale override, both from `ToolProps` and both
 * defaulting to `undefined`.
 */
const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

const fontFamily = ref("");
const fontSize = ref("");
const color = ref("");
const backgroundColor = ref("");
const bold = ref(false);
const italic = ref(false);
const underline = ref(false);
const strike = ref(false);

/**
 * 文本的快捷颜色。
 *
 * 合同是正式文件：除黑色外真正有用的选择是一种强调用红色，以及做批注用的几档灰色。
 * Element Plus 的取色器也接受用户输入的任何颜色，所以这份清单是捷径而不是限制。
 *
 * Quick colours for text.
 *
 * A contract is a formal document: the useful non-black choices are an emphasis red and the
 * greys used for annotations. Element Plus's colour picker also accepts any colour the user
 * types, so this list is a shortcut rather than a restriction.
 */
const TEXT_COLORS = [
  "#000000",
  "#333333",
  "#666666",
  "#999999",
  "#c0392b",
  "#d4380d",
  "#e6a23c",
  "#409eff",
  "#1e80ff",
  "#a83279"
];

/**
 * 文字底纹的快捷颜色 —— 同样的思路，颜色足够浅以便阅读。
 *
 * Quick colours for the highlight behind text — the same idea, kept light enough to read on.
 */
const BACKGROUND_COLORS = [
  "#ffffff",
  "#f5f7fa",
  "#fffbe6",
  "#fff1f0",
  "#e6f7ff",
  "#f6ffed",
  "#f9f0ff",
  "#ffe58f",
  "#ffccc7",
  "#b7eb8f"
];

/**
 * 从当前光标处重新读取本面板显示的一切。
 *
 * Re-read everything this panel shows from the current caret.
 */
function sync(): void {
  const editor = props.editor;
  if (!editor) return;

  const textStyle: Record<string, unknown> = editor.getAttributes("textStyle");
  fontFamily.value = typeof textStyle.fontFamily === "string" ? textStyle.fontFamily : "";
  fontSize.value = typeof textStyle.fontSize === "string" ? textStyle.fontSize : "";
  color.value = typeof textStyle.color === "string" ? textStyle.color : "";
  backgroundColor.value =
    typeof textStyle.backgroundColor === "string" ? textStyle.backgroundColor : "";

  bold.value = editor.isActive("bold");
  italic.value = editor.isActive("italic");
  underline.value = editor.isActive("underline");
  strike.value = editor.isActive("strike");
}

useEditorSelection(() => props.editor, sync);

/**
 * 字体族清单，当候选表里没有文档自身的值时把它补进去。
 *
 * 临时补的那一项 `value`（CSS 字体栈）与 `label` 相同，因为未知字体栈没有中文名可显示。
 *
 * The family list, with the document's own value added when the pick-list lacks it.
 *
 * The synthetic entry keeps the same `value` (the CSS stack) and uses it as its own
 * label, because there is no Chinese name to show for an unknown stack.
 */
const familyOptions = computed<readonly Choice<string>[]>(() => {
  const current = fontFamily.value;
  if (current === "" || FONT_FAMILIES.some((option) => option.value === current)) return FONT_FAMILIES;
  return [{ label: current, value: current }, ...FONT_FAMILIES];
});

/**
 * 字号清单，当候选表里没有文档自身的值时把它补进去。
 *
 * The size list, with the document's own value added when the pick-list lacks it.
 */
const sizeOptions = computed<readonly Choice<string>[]>(() => {
  const current = fontSize.value;
  if (current === "" || FONT_SIZES.some((option) => option.value === current)) return FONT_SIZES;
  return [{ label: current, value: current }, ...FONT_SIZES];
});

/**
 * `el-select` 传来的 `null` 表示「已清空」，此时就该显式取消设置。
 *
 * `null` from `el-select` means "cleared"; an explicit unset is what that should do.
 */
function applyFamily(value: string | null): void {
  const editor = props.editor;
  if (!editor) return;
  if (value === null || value === "") {
    editor.chain().focus().unsetFontFamily().run();
    return;
  }
  editor.chain().focus().setFontFamily(value).run();
}

/** 字号同理。 / The same for the size. */
function applySize(value: string | null): void {
  const editor = props.editor;
  if (!editor) return;
  if (value === null || value === "") {
    editor.chain().focus().unsetFontSize().run();
    return;
  }
  editor.chain().focus().setFontSize(value).run();
}

/** 切换四个标记之一。 / Toggle one of the four marks. */
function toggle(mark: "bold" | "italic" | "underline" | "strike"): void {
  const editor = props.editor;
  if (!editor) return;

  switch (mark) {
    case "bold":
      editor.chain().focus().toggleBold().run();
      break;
    case "italic":
      editor.chain().focus().toggleItalic().run();
      break;
    case "underline":
      editor.chain().focus().toggleUnderline().run();
      break;
    case "strike":
      editor.chain().focus().toggleStrike().run();
      break;
  }
}

/**
 * 应用文本颜色。
 *
 * Element Plus 取色器的「清空」动作发出 `null`，它的含义是「移除该属性」而不是「设为空值」
 * —— `setColor("")` 会往文档里写一条空声明，打印出非法的 `color:`。
 *
 * Apply the text colour.
 *
 * `null` is what Element Plus's colour picker emits for its 清空 action, and it means "remove
 * the attribute" rather than "set it to nothing" — `setColor("")` would write an empty
 * declaration into the document and print an invalid `color:`.
 */
function applyColor(value: string | null): void {
  const editor = props.editor;
  if (!editor) return;

  if (value === null || value === "") {
    editor.chain().focus().unsetColor().run();
    return;
  }
  editor.chain().focus().setColor(value).run();
}

/** 背景颜色同理。 / The same for the background colour. */
function applyBackgroundColor(value: string | null): void {
  const editor = props.editor;
  if (!editor) return;

  if (value === null || value === "") {
    editor.chain().focus().unsetBackgroundColor().run();
    return;
  }
  editor.chain().focus().setBackgroundColor(value).run();
}
</script>

<style scoped lang="scss">
.s-tool-font {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 260px;

  &__row {
    display: flex;
    align-items: center;
    gap: 5px;

    &--colors {
      gap: 6px;
    }
  }

  &__label {
    font-size: 12px;
    color: var(--se-color-text-secondary);
    white-space: nowrap;
  }

  /**
   * The two colour controls, drawn as Word draws them: a capital "A" with a bar under it for
   * the text colour, and a capital "A" on a filled block for the highlight colour.
   *
   * ## Why the glyph is CSS and not an SVG icon
   *
   * Element Plus's colour picker has **no trigger slot** — it always renders its own swatch
   * and caret — so an SVG icon could only appear by laying it over an invisible picker. That
   * is two elements for one control: the visible one cannot be focused or clicked, the real
   * one cannot be seen, and any change to the picker's trigger box breaks the alignment.
   *
   * A glyph plus a bar has none of that: it *is* the real trigger, it inherits the toolbar's
   * font and colour, and one custom property (`--s-tool-color-value`, set from the model
   * value in the template) makes it follow the picked colour exactly, which is what the
   * control is for. Nothing here needs an extra icon asset, and Element Plus's panel — its
   * predefined colours, its hex field, its 清空/确定 buttons — is untouched.
   */
  &__color {
    // 未选颜色时的默认值：字形与色条都是黑色（`背景色` 变体把它覆盖成白色，否则黑底黑字看不见）。
    // Defaults when no colour is set: a black glyph and a black bar. The background variant overrides
    // the bar to white — a black block under a black "A" would be invisible.
    --s-tool-color-value: #000000;
    --s-tool-color-glyph: #000000;

    :deep(.el-color-picker__trigger) {
      position: relative;
      box-sizing: border-box;
      width: 30px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: none;
      // Element Plus draws its own trigger content — the swatch, the caret, and an `empty` marker
      // that renders as a **cross** when no colour is set. The "A" replaces all of it, so every child
      // is hidden rather than a hand-picked list: `__empty` was the one that leaked through and made
      // the control look like a close button.
      > * {
        display: none;
      }
    }

    /**
     * "A" 本身。
     *
     * The glyph, in the glyph colour (black unless a variant changes it). It sits above the bar /
     * block, both of which are drawn by the variants below.
     */
    :deep(.el-color-picker__trigger)::before {
      content: "A";
      position: absolute;
      inset: 0 0 4px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 15px;
      font-weight: 700;
      line-height: 1;
      color: var(--s-tool-color-glyph);
    }

    &:hover :deep(.el-color-picker__trigger) {
      background-color: var(--el-color-primary-light-9);
    }

    // 字体颜色：选中的颜色就是 "A" 脚下那条色条。
    // Text colour: the picked colour is the bar the "A" stands on.
    &--text :deep(.el-color-picker__trigger)::after {
      content: "";
      position: absolute;
      inset: auto 1px 0;
      height: 3px;
      border-radius: 1px;
      background-color: var(--s-tool-color-value);
    }

    // 字体背景色：选中的颜色是 "A" 所坐的色块，加一圈描边，白色才看得见（「清空」表示不要底色）。
    // Highlight colour: the picked colour is the block the "A" sits on, ringed so that white stays
    // visible. "No highlight" is expressed by clearing the value, not by choosing white.
    &--background {
      --s-tool-color-value: #ffffff;

      :deep(.el-color-picker__trigger) {
        background-color: var(--s-tool-color-value);
        box-shadow: inset 0 0 0 1px var(--se-color-cell-border);
      }

      :deep(.el-color-picker__trigger)::before {
        inset: 0;
      }
    }
  }

  &__family {
    width: 130px;
  }

  &__size {
    width: 80px;
  }
}
</style>
