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

      Each control is a real element tree — a capital "A" plus one coloured bar/block — and the
      Element Plus picker is an invisible layer on top of it. See the `.s-tool-font__color` rules
      below for why the glyph is markup rather than either an SVG icon or a pseudo-element hung on
      the picker's own trigger.
    -->
    <div class="s-tool-font__row s-tool-font__row--colors">
      <span class="s-tool-font__label">{{ t.font.color }}</span>
      <span class="s-tool-font__color s-tool-font__color--text">
        <el-color-picker
          v-model="color"
          class="s-tool-font__color-input"
          size="small"
          :title="t.font.color"
          :predefine="TEXT_COLORS"
          popper-class="s-editor-popper"
          @change="applyColor"
        />
        <!-- `aria-hidden`: the picker underneath carries the name and the value; this is its face. -->
        <span class="s-tool-font__swatch" aria-hidden="true">
          <span class="s-tool-font__glyph">A</span>
          <span
            class="s-tool-font__bar"
            :data-color="color || DEFAULT_TEXT_COLOR"
            :style="{ backgroundColor: color || DEFAULT_TEXT_COLOR }"
          />
        </span>
      </span>

      <span class="s-tool-font__label">{{ t.font.backgroundColor }}</span>
      <span class="s-tool-font__color s-tool-font__color--background">
        <el-color-picker
          v-model="backgroundColor"
          class="s-tool-font__color-input"
          size="small"
          :title="t.font.backgroundColor"
          :predefine="BACKGROUND_COLORS"
          popper-class="s-editor-popper"
          @change="applyBackgroundColor"
        />
        <!-- Same two parts; the variant's rules put the bar *behind* the "A" instead of under it. -->
        <span class="s-tool-font__swatch" aria-hidden="true">
          <span
            class="s-tool-font__bar"
            :data-color="backgroundColor || DEFAULT_BACKGROUND_COLOR"
            :style="{ backgroundColor: backgroundColor || DEFAULT_BACKGROUND_COLOR }"
          />
          <span class="s-tool-font__glyph">A</span>
        </span>
      </span>
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

/**
 * 没有选中颜色时，两个控件显示的颜色。
 *
 * 中文：字体颜色默认黑（色条），字体背景色默认白（色块）。写在样式表里也能做到，但值同时要进
 * `data-color`，所以它必须对模板可见。
 *
 * The colour each control shows when none is set.
 *
 * Black for the text variant's bar and white for the background variant's block. A stylesheet could
 * hold these, but the value also has to reach `data-color`, so it has to be visible to the template.
 */
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";
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
   * The two colour controls, drawn as Word draws them: a capital "A" with a bar under it for the
   * text colour, and a capital "A" standing on a filled block for the highlight colour.
   *
   * ## The shape of the control
   *
   * A real element tree — `swatch > (glyph "A", bar)` — with the Element Plus picker as an
   * **invisible layer on top of it**. The picker has no trigger slot, so it always renders its own
   * swatch, its caret and (with no colour set) an `empty` marker that is a *close icon*; making the
   * control look right therefore cannot mean styling those children. It means covering them: the
   * picker keeps the click, the focus and the panel, while everything the user sees is markup this
   * component owns. Nothing about Element Plus's internals has to stay true for the glyph to keep
   * working, and the colour follows the model through a plain inline style on the bar.
   *
   * The bar carries `data-color` as well, so a consumer (or a test) can read the value off the DOM
   * without knowing which element is the visible one.
   */
  &__color {
    position: relative;
    display: inline-flex;
    /**
     * 与 Element Plus `size="small"` 的触发器**同尺寸**，这不是审美问题。
     *
     * 中文：picker 是不可见的一层，点击要能落到它自己的触发器上才打得开面板。EP 的 `--small`
     * 触发器是 24×24 且填满它的根元素，所以控件做成同样大小，控件的每一个像素就都在触发器的
     * 范围内 —— 不会出现「边缘那几像素点不动」。
     *
     * The same size as Element Plus's `size="small"` trigger, and that is not a matter of taste.
     *
     * The picker is the invisible layer, and a click has to land on *its* trigger for the panel to
     * open. EP's `--small` trigger is 24×24 and fills its root, so a control of the same size puts
     * every one of its pixels inside that trigger — no dead strip along the edge.
     */
    width: 24px;
    height: 24px;
    flex: none;

    // The picker fills the control and is transparent, so the click, the focus ring and the panel
    // all belong to it while the visible layer stays purely presentational.
    &-input {
      position: absolute;
      inset: 0;
      opacity: 0;
    }

    // A visible focus ring: the real control is invisible, so it has to come from the layer below.
    &:focus-within &__swatch {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 1px;
    }

    &:hover &__swatch {
      background-color: var(--el-color-primary-light-9);
    }
  }

  /**
   * 可见的那一层：一个 "A" 加一条色条（字体颜色），或一个 "A" 坐在色块上（字体背景色）。
   *
   * The visible layer: an "A" plus a bar (text colour), or an "A" standing on a block (highlight).
   */
  &__swatch {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    border-radius: 3px;
    // The picker lies on top; this layer must never take the click away from it.
    pointer-events: none;
  }

  &__glyph {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    color: var(--se-color-text);
  }

  &__bar {
    width: 16px;
    height: 4px;
    border-radius: 1px;
    // A ring, so that a white bar (or block) is still visible on the toolbar's background.
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 15%);
  }

  // 字体颜色：色条在 "A" 下方。 / Text colour: the bar sits under the "A".
  &__color--text &__bar {
    flex: none;
  }

  // 字体背景色：色块在 "A" 后面，所以先画块、再画字。 / Highlight: the block is behind the "A".
  &__color--background {
    & .s-tool-font__bar {
      position: absolute;
      inset: 2px 3px;
      width: auto;
      height: auto;
    }

    & .s-tool-font__glyph {
      position: relative;
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
