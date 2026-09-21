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
    -->
    <div class="s-tool-font__row s-tool-font__row--colors">
      <span class="s-tool-font__label">{{ t.font.color }}</span>
      <el-color-picker
        v-model="color"
        size="small"
        :title="t.font.color"
        :predefine="TEXT_COLORS"
        @change="applyColor"
      />

      <span class="s-tool-font__label">{{ t.font.backgroundColor }}</span>
      <el-color-picker
        v-model="backgroundColor"
        size="small"
        :title="t.font.backgroundColor"
        :predefine="BACKGROUND_COLORS"
        @change="applyBackgroundColor"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
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

defineOptions({ name: "ToolFont" });

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

/** Quick colours for the highlight behind text — the same idea, kept light enough to read on. */
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

/** Re-read everything this panel shows from the current caret. */
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

/** The size list, with the document's own value added when the pick-list lacks it. */
const sizeOptions = computed<readonly Choice<string>[]>(() => {
  const current = fontSize.value;
  if (current === "" || FONT_SIZES.some((option) => option.value === current)) return FONT_SIZES;
  return [{ label: current, value: current }, ...FONT_SIZES];
});

/** `null` from `el-select` means "cleared"; an explicit unset is what that should do. */
function applyFamily(value: string | null): void {
  const editor = props.editor;
  if (!editor) return;
  if (value === null || value === "") {
    editor.chain().focus().unsetFontFamily().run();
    return;
  }
  editor.chain().focus().setFontFamily(value).run();
}

/** The same for the size. */
function applySize(value: string | null): void {
  const editor = props.editor;
  if (!editor) return;
  if (value === null || value === "") {
    editor.chain().focus().unsetFontSize().run();
    return;
  }
  editor.chain().focus().setFontSize(value).run();
}

/** Toggle one of the four marks. */
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

/** The same for the background colour. */
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

  &__family {
    width: 130px;
  }

  &__size {
    width: 80px;
  }
}
</style>
