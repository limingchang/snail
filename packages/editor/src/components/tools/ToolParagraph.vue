<template>
  <div class="s-tool-paragraph">
    <div class="s-tool-paragraph__row">
      <el-select v-model="headingLevel" class="s-tool-paragraph__style" size="small" @change="applyStyle">
        <el-option
          v-for="option in HEADING_OPTIONS"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>

      <el-button-group>
        <el-button
          v-for="align in ALIGN_OPTIONS"
          :key="align.value"
          size="small"
          :type="alignment === align.value ? 'primary' : 'default'"
          :title="align.label"
          @click="applyAlign(align.value)"
        >
          <SIcon :icon="alignIcons[align.value]" />
        </el-button>
      </el-button-group>
    </div>

    <!--
      First-line indent, expressed in **characters**. The legacy panel had only an on/off
      toggle hardcoded to two characters; a Chinese template routinely wants one, two or
      four, and the unit a Chinese author thinks in is the glyph, not the em. One CJK glyph
      is one em, so the number maps straight onto `text-indent: N em` — which is also what
      the legacy value `2em` meant.
    -->
    <div class="s-tool-paragraph__row">
      <span class="s-tool-paragraph__label">{{ t.paragraph.indent }}</span>
      <el-input-number
        v-model="indentChars"
        size="small"
        :min="0"
        :max="INDENT_MAX"
        :step="1"
        :controls="false"
        class="s-tool-paragraph__number"
        @change="applyIndentChars"
      />
      <span class="s-tool-paragraph__label">{{ t.paragraph.indentUnit }}</span>

      <el-button-group>
        <el-button
          size="small"
          :disabled="indentChars === 0"
          :title="t.paragraph.indentDecrease"
          @click="stepIndent(-1)"
        >
          <SIcon :icon="IconIndentDecrease" />
        </el-button>
        <el-button
          size="small"
          :disabled="indentChars >= INDENT_MAX"
          :title="t.paragraph.indentIncrease"
          @click="stepIndent(1)"
        >
          <SIcon :icon="IconIndentIncrease" />
        </el-button>
      </el-button-group>
    </div>

    <div class="s-tool-paragraph__row">
      <span class="s-tool-paragraph__label">{{ t.paragraph.lineHeight }}</span>
      <el-select v-model="lineHeightKind" class="s-tool-paragraph__line-height" size="small" @change="applyLineHeightKind">
        <el-option v-for="option in LINE_HEIGHT_PRESETS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <template v-if="lineHeightKind === 'fixed'">
        <el-input-number
          v-model="lineHeightValue"
          size="small"
          :min="0"
          :step="0.5"
          :controls="false"
          class="s-tool-paragraph__number"
          @change="applyLineHeight"
        />
        <el-select v-model="lineHeightUnit" class="s-tool-paragraph__unit" size="small" @change="applyLineHeight">
          <el-option v-for="option in PARAGRAPH_UNITS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </template>
    </div>

    <div class="s-tool-paragraph__row">
      <span class="s-tool-paragraph__label">{{ t.paragraph.spaceBefore }}</span>
      <el-input-number
        v-model="spaceBefore"
        size="small"
        :min="0"
        :step="0.5"
        :controls="false"
        class="s-tool-paragraph__number"
        @change="applySpacing"
      />
      <el-select v-model="spaceBeforeUnit" class="s-tool-paragraph__unit" size="small" @change="applySpacing">
        <el-option v-for="option in PARAGRAPH_UNITS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>

      <span class="s-tool-paragraph__label">{{ t.paragraph.spaceAfter }}</span>
      <el-input-number
        v-model="spaceAfter"
        size="small"
        :min="0"
        :step="0.5"
        :controls="false"
        class="s-tool-paragraph__number"
        @change="applySpacing"
      />
      <el-select v-model="spaceAfterUnit" class="s-tool-paragraph__unit" size="small" @change="applySpacing">
        <el-option v-for="option in PARAGRAPH_UNITS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolParagraph` —— 大纲级别、对齐、行距、缩进和段落间距。
 *
 * ## 正文不能是标题
 *
 * 旧版处理函数是：
 *
 * ```ts
 * if (value == 0) editor.chain().focus().setNode("paragraph").run()
 * editor.chain().focus().setHeading({ level: value }).run()   // ← runs unconditionally
 * ```
 *
 * 于是选择「正文」会产出 `<h0>`（缺陷 41）。这里 `0` 表示 `setParagraph()` 并直接返回；只有
 * 真正的级别才会去设置标题层级，而且该级别由 {@link isHeadingLevel} 收窄而不是断言。
 *
 * ## 行距是两种不同的东西
 *
 * 倍数（`"1.5"`）和固定长度（`"28pt"`）都存成同一个 CSS 字符串，所以面板必须知道眼前是哪
 * 一种。旧版面板靠*数值*猜（`value > 1.5` 就算「倍数」），把 `2` 和 `28pt` 报成了同一种
 * 情况。`editor/cssLength` 的 `readLineHeight` 从单位上给出答案。
 *
 * `ToolParagraph` — outline level, alignment, line height, indent and paragraph spacing.
 *
 * ## 正文 must not be a heading
 *
 * The legacy handler was:
 *
 * ```ts
 * if (value == 0) editor.chain().focus().setNode("paragraph").run()
 * editor.chain().focus().setHeading({ level: value }).run()   // ← runs unconditionally
 * ```
 *
 * so choosing 正文 produced `<h0>` (defect 41). Here `0` means `setParagraph()` and the
 * function returns; a heading level is only ever applied for a real level, and the level
 * is narrowed by {@link isHeadingLevel} rather than asserted.
 *
 * ## Line height is two different things
 *
 * A multiple (`"1.5"`) and a fixed length (`"28pt"`) are stored as one CSS string, so the
 * panel has to know which it is looking at. The legacy panel guessed from the *number*
 * (`value > 1.5` meant "multiple"), which reported `2` and `28pt` as the same case.
 * `readLineHeight` from `editor/cssLength` answers it from the unit.
 */

import { computed, ref } from "vue";
import type { Component } from "vue";

import { SIcon } from "@snail-js/vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { formatCssLength, parseCssLength, readLineHeight } from "../../editor/cssLength";
import { useEditorSelection } from "../../editor/useEditorSelection";
import {
  ALIGN_OPTIONS,
  HEADING_OPTIONS,
  LINE_HEIGHT_MULTIPLES,
  LINE_HEIGHT_PRESETS,
  PARAGRAPH_UNITS
} from "./constants";
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconIndentDecrease,
  IconIndentIncrease
} from "../icons";
import { ElSelect, ElOption, ElButtonGroup, ElButton, ElInputNumber } from "element-plus";

defineOptions({ name: "ToolParagraph" });

/**
 * 本面板的 props：编辑器实例与语言覆盖，二者都来自 `ToolProps`，默认均为 `undefined`。
 *
 * This panel's props: the editor and the locale override, both from `ToolProps` and both
 * defaulting to `undefined`.
 */
const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * `ParagraphStyle` 写入的属性，从光标所在的那个块读取。
 *
 * The attributes `ParagraphStyle` writes, read from whichever block the caret is in.
 */
const STYLE_TYPES = ["paragraph", "heading"] as const;

const headingLevel = ref(0);
const alignment = ref<"left" | "center" | "right" | "justify">("left");
/**
 * 面板提供的最大首行缩进，单位为字符。
 *
 * The largest first-line indent the panel offers, in characters.
 */
const INDENT_MAX = 8;

/**
 * 首行缩进，单位为字符；`0` 表示「不缩进」。
 *
 * First-line indent in characters; `0` means "no indent".
 */
const indentChars = ref(0);

type LineHeightKind = "single" | "oneAndHalf" | "double" | "fixed";
const lineHeightKind = ref<LineHeightKind>("single");
const lineHeightValue = ref(1);
const lineHeightUnit = ref("pt");

const spaceBefore = ref(0);
const spaceBeforeUnit = ref("em");
const spaceAfter = ref(0);
const spaceAfterUnit = ref("em");

/**
 * 每种对齐方式对应的字形。用映射表，模板因此保持声明式。
 *
 * The alignment glyph for each alignment. A map, so the template stays declarative.
 */
const alignIcons: Readonly<Record<"left" | "center" | "right" | "justify", Component>> = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
  justify: IconAlignJustify
};

/**
 * 六个标题层级之一时为 `true` —— `setHeading` 需要的收窄。
 *
 * `true` for one of the six heading levels — the narrowing `setHeading` needs.
 */
function isHeadingLevel(value: number): value is 1 | 2 | 3 | 4 | 5 | 6 {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

/**
 * 从光标自己所在的块里，读出第一个已设置的样式属性。
 *
 * Read the first of the style attributes that is set, from the caret's own block.
 */
function readStyleAttribute(attribute: string): string | undefined {
  const editor = props.editor;
  if (!editor) return undefined;
  for (const type of STYLE_TYPES) {
    const value = editor.getAttributes(type)[attribute];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

/**
 * 把一个间距值读成数字加单位。
 *
 * 缺失或为零的间距本来就没有单位，而给「无间距」显示 `0px` 会误导人 —— 面板显示 `0` 并配上
 * 中性单位 `em`，也就是用户若输入数值时会用的那个单位。
 *
 * Read a spacing value into a number plus a unit.
 *
 * A missing or zero spacing has no unit at all, and showing `0px` for "no spacing" would
 * be misleading — the panel shows `0` with the neutral `em` unit it would use if the user
 * typed a value.
 */
function readSpacing(value: string | undefined): { value: number; unit: string } {
  if (value === undefined || value === "" || value === "0") return { value: 0, unit: "em" };
  const parsed = parseCssLength(value);
  if (!parsed) return { value: 0, unit: "em" };
  return { value: parsed.value, unit: parsed.unit };
}

/** 从光标处重新读取面板显示的一切。 / Re-read everything the panel displays from the caret. */
function sync(): void {
  const editor = props.editor;
  if (!editor) return;

  // The outline level: a heading's own level, or 正文 when the caret is not in one.
  let level = 0;
  for (const candidate of [1, 2, 3, 4, 5, 6]) {
    if (editor.isActive("heading", { level: candidate })) {
      level = candidate;
      break;
    }
  }
  headingLevel.value = level;

  for (const option of ALIGN_OPTIONS) {
    if (editor.isActive({ textAlign: option.value })) {
      alignment.value = option.value;
      break;
    }
  }

  indentChars.value = readIndentChars(readStyleAttribute("textIndent"));

  const textStyle: Record<string, unknown> = editor.getAttributes("textStyle");
  const lineHeight = typeof textStyle.lineHeight === "string" ? textStyle.lineHeight : undefined;
  const read = readLineHeight(lineHeight);
  if (read.kind === "fixed") {
    lineHeightKind.value = "fixed";
    lineHeightValue.value = read.value;
    lineHeightUnit.value = read.unit;
  } else if (read.value === 1.5) {
    lineHeightKind.value = "oneAndHalf";
    lineHeightValue.value = 1.5;
  } else if (read.value > 1.5) {
    lineHeightKind.value = "double";
    lineHeightValue.value = read.value;
  } else {
    lineHeightKind.value = "single";
    lineHeightValue.value = read.value;
  }

  const before = readSpacing(readStyleAttribute("paragraphStart"));
  spaceBefore.value = before.value;
  spaceBeforeUnit.value = before.unit;
  const after = readSpacing(readStyleAttribute("paragraphEnd"));
  spaceAfter.value = after.value;
  spaceAfterUnit.value = after.unit;
}

useEditorSelection(() => props.editor, sync);

/**
 * 应用大纲级别。**`0` 是正文并在此止步** —— 见模块注释。
 *
 * Apply an outline level. **`0` is 正文 and stops here** — see the module comment.
 */
function applyStyle(value: number): void {
  const editor = props.editor;
  if (!editor) return;

  if (!isHeadingLevel(value)) {
    editor.chain().focus().setParagraph().run();
    return;
  }

  editor.chain().focus().setHeading({ level: value }).run();
}

/**
 * 是设置而不是切换：工具栏按钮是在陈述对齐方式，而不是把它取反。
 *
 * Set, not toggle: a toolbar button states the alignment, it does not invert it.
 */
function applyAlign(value: "left" | "center" | "right" | "justify"): void {
  props.editor?.chain().focus().setTextAlign(value).run();
}

/**
 * 把存下来的 `text-indent` 读回成字符数。
 *
 * 只有 `em`/`rem`（以及裸数字，也就是旧版 `"0"` 的形态）能映射到字符数：一个 em 就是一个
 * 中日韩字形，也正是面板提供的单位。带绝对缩进的文档 —— `24pt`、`10mm` —— 保持原样并显示
 * 为 `0`，而不是在下次选区变化时被悄悄改写成另一种长度。
 *
 * Read the stored `text-indent` back as a character count.
 *
 * Only `em`/`rem` (and a bare number, which is what the legacy `"0"` was) can be mapped to
 * characters: one em is one CJK glyph, which is the unit the panel offers. A document that
 * carries an absolute indent — `24pt`, `10mm` — is left alone and shows as `0` rather than
 * being silently rewritten to a different length on the next selection change.
 */
function readIndentChars(raw: string | undefined): number {
  if (!raw) return 0;

  const match = /^(\d+(?:\.\d+)?)\s*(em|rem)?$/.exec(raw.trim());
  if (!match) return 0;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;

  return Math.min(INDENT_MAX, Math.round(value));
}

/**
 * 设置首行缩进，单位为字符。
 *
 * `null` 是移除该属性，而不是写入 `text-indent: 0em`，这样没有缩进的段落在序列化后的文档里
 * 保持干净（扩展把该属性默认设为 `null` 也是同一个理由）。
 *
 * Set the first-line indent, in characters.
 *
 * `null` removes the attribute rather than writing `text-indent: 0em`, so a paragraph with
 * no indent stays clean in the serialised document (the same reason the extension defaults
 * the attribute to `null`).
 */
function applyIndentChars(value: number | undefined): void {
  const requested = Number(value ?? 0);
  const chars = Number.isFinite(requested)
    ? Math.max(0, Math.min(INDENT_MAX, Math.round(requested)))
    : 0;

  indentChars.value = chars;
  props.editor
    ?.chain()
    .focus()
    .setParagraphStyle({ textIndent: chars === 0 ? null : `${chars}em` })
    .run();
}

/**
 * 把缩进移动一个字符，供两个箭头按钮使用。
 *
 * Move the indent by one character, for the two arrow buttons.
 */
function stepIndent(delta: number): void {
  applyIndentChars(indentChars.value + delta);
}

/**
 * 某个预设的行距。`fixed` 保留当前值，其余都是倍数。
 *
 * A preset's line height. `fixed` keeps the current value; the others are multiples.
 */
function applyLineHeightKind(value: LineHeightKind): void {
  const editor = props.editor;
  if (!editor) return;

  if (value === "fixed") {
    applyLineHeight();
    return;
  }

  editor.chain().focus().setLineHeight(LINE_HEIGHT_MULTIPLES[value]).run();
}

/** 固定行距，使用用户选定的单位。 / The fixed line height, in whatever unit the user picked. */
function applyLineHeight(): void {
  const editor = props.editor;
  if (!editor) return;
  if (lineHeightKind.value !== "fixed") return;
  editor.chain().focus().setLineHeight(formatCssLength(lineHeightValue.value, lineHeightUnit.value)).run();
}

/**
 * 段落间距。
 *
 * 每次改动都写入两侧，而不是只写被编辑的那一侧：扩展会合并传入的属性，但先从文档里把两侧读
 * 回来，意味着无关的编辑永远不会丢掉另一侧 —— 旧版面板只应用发生变化的那个字段时，丢掉的
 * 正是它。
 *
 * Paragraph spacing.
 *
 * Both sides are written on every change rather than only the edited one: the extension
 * merges the attributes it is given, but reading both back from the document first means
 * an unrelated edit can never drop the other side — which is what happened when the
 * legacy panel applied only the field that changed.
 */
function applySpacing(): void {
  props.editor
    ?.chain()
    .focus()
    .setParagraphStyle({
      paragraphStart: formatCssLength(spaceBefore.value, spaceBeforeUnit.value),
      paragraphEnd: formatCssLength(spaceAfter.value, spaceAfterUnit.value)
    })
    .run();
}
</script>

<style scoped lang="scss">
.s-tool-paragraph {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 330px;

  &__row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  &__label {
    color: var(--se-color-text-secondary);
    font-size: 12px;
    margin-left: 5px;
  }

  &__style {
    width: 100px;
  }

  &__line-height {
    width: 120px;
  }

  &__number {
    width: 70px;
  }

  &__unit {
    width: 64px;
  }
}
</style>
