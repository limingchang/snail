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
import { IconPrintFill, SIcon } from "@snail-js/vue";

import { formatCssLength, parseCssLength, toMillimetres } from "../../editor/cssLength";
import { mergeEditorLocale } from "../../editor/locale";
import type { EditorLocale } from "../../editor/locale";
import { DEFAULT_MARGINS, PAPER_SIZES, resolveMargins } from "../../typings/paper";
import type { CssLength, NamedPaperFormat, Orientation, PaperFormat } from "../../typings/paper";
import type { PrintOptions } from "../../typings/editor";
import { ElMessage, ElForm, ElFormItem, ElSelect, ElOption, ElInputNumber, ElSwitch, ElInput, ElButton } from "element-plus";

/**
 * `ToolPrint` —— 工具栏的打印区块。
 *
 * ## 这个面板存在的唯一目的
 *
 * `PrintOptions` 里的距离是 **CSS 长度字符串**（`"20mm"`），而打印操作员想的是毫米。因此面板
 * 在进出两端都通过 `editor/cssLength` 换算，绝不往模型里存裸数字。旧版页面面板正相反：它按
 * 厘米编辑（`2.54`、`3.18`），对上的却是一个默认 20 mm 的模型，于是用 20 mm 的页面显示成
 * 2.54 cm（缺陷 42）。
 *
 * ## 为什么「跟随文档设置」是一个空选项而不是默认值
 *
 * 每个可以不管的控件都映射到**省略的键**：扩展用交给它的东西拼出 `@page` 规则，所以
 * `paperFormat: ""` 不会表示「没有意见」，而会表示「一个叫做空的尺寸」。
 *
 * 打印动作本身以 `print()` 暴露，因为填充模式的页脚有自己的「打印」按钮，不应该被迫穿过工具栏
 * 区块去调用。
 *
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
    /**
     * 正在运行的编辑器，在宿主创建它之前为 `undefined`。
     *
     * The running editor, `undefined` until the host has created it.
     */
    editor?: Editor;

    /** 宿主希望打印的页面设置。 / The page setup the host wants printed. */
    print?: PrintOptions;

    /**
     * 部分语言覆盖，合并到中文默认值之上。
     *
     * Partial locale override, merged over the Chinese defaults.
     */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    editor: undefined,
    print: undefined,
    locale: undefined
  }
);

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * 一个命名纸张尺寸，或用 `""` 表示「跟随文档设置」。
 *
 * A named paper size, or `""` for 跟随文档设置.
 */
type PaperFormatOption = NamedPaperFormat | "";

/**
 * `""` 表示「跟随文档设置」，否则是两种方向之一。
 *
 * `""` for 跟随文档设置, otherwise one of the two orientations.
 */
type OrientationOption = Orientation | "";

/** 四条边，按面板排布它们的顺序。 / The four sides, in the order the panel lays them out. */
type MarginSide = "top" | "right" | "bottom" | "left";

/**
 * 选项清单，由模型自己的表推导而来。
 *
 * 再手写一份清单，就会让某个尺寸在界面上可选却在 `PAPER_SIZES` 里缺失（或反过来）；
 * `Object.keys` 不会与它所读的表发生漂移。
 *
 * The option list, derived from the model's own table.
 *
 * A second hand-written list is how a size ends up selectable in the UI but missing from
 * `PAPER_SIZES` (or the reverse); `Object.keys` cannot drift from the table it reads.
 */
const PAPER_FORMATS = Object.keys(PAPER_SIZES) as NamedPaperFormat[];

/**
 * 以毫米表示的 {@link DEFAULT_MARGINS}，这样面板的兜底值不会与模型漂移。
 *
 * {@link DEFAULT_MARGINS} in millimetres, so the panel's fallback cannot drift from the model.
 */
const DEFAULT_MARGIN_MM = toMillimetres(DEFAULT_MARGINS.top) ?? 20;

const paperFormat = ref<PaperFormatOption>("A4");
const orientation = ref<OrientationOption>("");
const documentTitle = ref("");
const marginBoxes = ref(false);

/**
 * 面板编辑时的页边距：毫米，绝不是 CSS 字符串。
 *
 * The margins as the panel edits them: millimetres, never a CSS string.
 */
const margins = reactive<Record<MarginSide, number>>({
  top: DEFAULT_MARGIN_MM,
  right: DEFAULT_MARGIN_MM,
  bottom: DEFAULT_MARGIN_MM,
  left: DEFAULT_MARGIN_MM
});

/**
 * 面板上一次播种所依据的模型值 —— 见 {@link fingerprint}。
 *
 * The model values the panel was last seeded from — see {@link fingerprint}.
 */
let seededFrom = "";

/**
 * 下拉显示的格式。
 *
 * 命名尺寸可以原样往返。**自定义**的 `{ name, width, height }` 格式在清单里没有对应选项，所以
 * 下拉回退到「跟随文档设置」—— 它会省略该键，让文档自己的设置胜出 —— 而不是回退到 A4，那会
 * 打印出与屏幕上不同的一张纸。（`paper.ts` 记下了这个错误的旧版形态：拿一个*数字*去一张名字表
 * 里做成员判断，于是每种自定义格式都悄悄变成了 A4。）
 *
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
 * 把模型的一条边读成毫米。
 *
 * `parseCssLength` 拒绝任何不是单个长度的东西，而 `toMillimetres` 对无法换算的单位返回
 * `undefined`（`em`/`rem` 取决于元素的字体，这是本面板无从知道的）。两者都回退到默认值，
 * 而不是让 `NaN` 跑到输入框里。
 *
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
 * 模型自己的值，表示成一个可比较的字符串。
 *
 * 宿主传来一个全新的对象字面量时，`deep` 侦听会按身份触发，所以没有这个指纹的话，父组件
 * 重渲染会在操作员正往四个页边距输入框里打字时把它们重置。
 *
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

/** 把模型值复制进表单。 / Copy a model value into the form. */
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

/**
 * 跟随模型，在面板首次渲染之前完成播种 —— 见 `ToolWatermark`。
 *
 * Follow the model, seeding the panel before its first render — see `ToolWatermark`.
 */
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
 * 命令接收到的 `PrintOptions`。
 *
 * 「跟随文档」的表达方式是**省略**该键，绝不发送空字符串：扩展用交给它的东西写出 `@page`
 * 声明，而 `size: ;` 要么被浏览器丢掉，要么把文档声明的尺寸重置掉。
 *
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
 * 打印文档。
 *
 * 既绑定到按钮也对外暴露：填充模式的页脚有自己的打印动作，需要拿到完全相同的选项。
 *
 * 命令本身**不接受参数** —— 扩展运行时读的是 `extension.options` —— 所以覆盖值先写进扩展的
 * options 对象。这就是宿主改变活动打印配置的文档化做法：为了改一个 `@page` 尺寸而重建编辑器
 * 会丢掉用户的选区。
 *
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

/**
 * 对外暴露打印动作，供填充模式的页脚直接调用，而不必穿过工具栏区块。
 *
 * Exposes the print action, so a fill-mode footer can call it directly rather than
 * reaching through the toolbar section.
 */
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
