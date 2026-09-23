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
    <div class="s-tool-page__section">
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

      <el-divider direction="vertical" class="s-tool-page__divider" />
    </div>

    <!-- Header / footer -------------------------------------------------------- -->
    <div class="s-tool-page__section">
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
          <!-- No 对齐 control: a band is three regions, each with its own alignment. See the
               `SLOT_ALIGN` table and the note in `typing/headerFooter.ts`. -->
        </div>
      </div>

      <el-divider direction="vertical" class="s-tool-page__divider" />
    </div>

    <!-- Page number ------------------------------------------------------------ -->
    <div class="s-tool-page__group s-tool-page__group--column">
      <div class="s-tool-page__row">
        <span class="s-tool-page__side">{{ t.page.pageNumber }}</span>
        <!-- The token documentation lives in a tooltip rather than in a permanent hint line:
             it is reference material a user reads once, and a line of it under every control
             makes the panel taller than the thing it documents. -->
        <el-tooltip :content="t.page.pageNumberTokens" placement="top">
          <el-icon class="s-tool-page__help"><QuestionFilled /></el-icon>
        </el-tooltip>
        <!-- The placement: which third of which band holds the number. The region it lands in
             stops being editable, which is why this is an explicit choice and not a CSS setting. -->
        <el-select
          v-model="pageNumberPlacement"
          size="small"
          class="s-tool-page__placement"
          popper-class="s-editor-popper"
          @change="applyPageNumberPlacement"
        >
          <el-option :label="t.page.pageNumberHidden" value="none" />
          <el-option
            v-for="option in PLACEMENT_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <!-- `allow-create` is what makes a custom pattern possible: the stored value is
             one string on the `pageNumber` node, so a preset and a hand-written pattern
             are the same kind of thing. -->
        <el-select
          v-model="pageNumberFormat"
          size="small"
          class="s-tool-page__page-number"
          popper-class="s-editor-popper"
          filterable
          allow-create
          default-first-option
          @change="applyPageNumberFormat"
        >
          <el-option v-for="preset in PAGE_NUMBER_PRESETS" :key="preset.value" :label="preset.label" :value="preset.value" />
        </el-select>
      </div>
    </div>

    <!-- Logo ------------------------------------------------------------------- -->
    <!--
      There is no 插入分页符 button here on purpose: 「分页」 lives in the 插入 pane, which is
      the pane that answers "put something new into the document". Keeping a second copy in a
      `--column` group also stretched it to the width of the switch row beside it, which is
      what made it look wrong.
    -->
    <div class="s-tool-page__group s-tool-page__group--column">
      <div class="s-tool-page__row">
        <span class="s-tool-page__side">{{ t.page.logo }}</span>
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept="image/*"
          :on-change="onLogoSelected"
        >
          <el-button size="small">{{ t.page.logoUpload }}</el-button>
        </el-upload>
        <el-select
          v-model="logoPlacement"
          size="small"
          class="s-tool-page__placement"
          popper-class="s-editor-popper"
          :disabled="!hasLogo"
          @change="applyLogoPlacement"
        >
          <el-option :label="t.page.pageNumberHidden" value="none" />
          <el-option
            v-for="option in PLACEMENT_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolPage` —— 纸张、页边距、页眉/页脚、页码和页面 logo。
 *
 * ## 打开时一切都从文档读取
 *
 * 旧版面板自己造了一份带 Word 默认值的 `pageSettings`，从不读文档（缺陷 42），于是它描述的
 * 是一个自己没看过的页面，而它的第一次编辑又会把真实页面悄悄重置成那些默认值。下面的
 * `sync()` 在每次选区变化时读取第一个 `page` 节点、第一个 `pageHeader`/`pageFooter` 和第一
 * 个 `pageNumber`，所以控件始终在描述文档。
 *
 * ## 为什么区域高度按位置写入
 *
 * `updateAttributes` 只作用于当前选区，而光标在页面*内容*里 —— 从不在页眉节点上 —— 所以它
 * 会悄无声息地什么都不做（与缺陷 22 同类的问题）。`updateNodesOfType` 在一个事务里作用于
 * 所有页眉，因此「页眉高度」指的是全部页眉。
 *
 * ## 属性名容错
 *
 * 缺陷 20 是节点属性与扩展选项之间的一次拼写漂移（`headerLing`/`headerLine`）。由于这些区域
 * 属性名不属于已发布的契约，面板会*读取*每一种可能的拼写，而只*写入*两个规范名；schema 未
 * 声明的属性会被 ProseMirror 丢掉，所以拼写不匹配是空操作而不是数据损坏。
 *
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

import { QuestionFilled } from "@element-plus/icons-vue";
import type { UploadFile } from "element-plus";
import type { Editor } from "@tiptap/core";

import { SIcon } from "@snail-js/vue";
import { IconPageMargin, IconPageOrientation, IconPageSize } from "@snail-js/vue";

import { DEFAULT_MARGINS, resolveMargins } from "../../typings/paper";
import type { NamedPaperFormat, ResolvedMargins } from "../../typings/paper";
import { DEFAULT_LOGO_ATTRIBUTES } from "../../extensions/page/constant/defaults";
import type { FurnitureSlot } from "../../extensions/page/typing/headerFooter";
import { collectBands } from "../../extensions/page/utils/furnitureEditing";
import { collectRegions, regionHoldsType } from "../../extensions/page/utils/regions";
import { DEFAULT_MAX_LOGO_BYTES } from "../../extensions/page/pageLogo/pageLogo";
import { formatCssLength, toMillimetres } from "../../editor/cssLength";
import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { findNodes, readDocumentPageSetup, readPageNumberFormat } from "../../editor/documentNodes";
import { useEditorSelection } from "../../editor/useEditorSelection";
import { MARGIN_PRESETS, ORIENTATION_OPTIONS, PAGE_NUMBER_PRESETS, PAPER_FORMAT_OPTIONS } from "./constants";
import { ElMessage, ElSelect, ElOption, ElDropdown, ElButton, ElDivider, ElDropdownMenu, ElDropdownItem, ElInputNumber, ElSwitch, ElTooltip, ElIcon, ElUpload } from "element-plus";

/**
 * 面板选中的 logo 默认落在页眉左侧三分之一处，除非另选了位置。
 *
 * A logo picked from the panel lands in the header's left third unless another place is chosen.
 */
const DEFAULT_LOGO_PLACEMENT: { side: "top" | "bottom"; slot: FurnitureSlot } = { side: "top", slot: "left" };

defineOptions({ name: "ToolPage" });

/**
 * 本面板的 props：编辑器实例与语言覆盖，二者都来自 `ToolProps`，默认均为 `undefined`。
 *
 * This panel's props: the editor and the locale override, both from `ToolProps` and both
 * defaulting to `undefined`.
 */
const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * 命名纸张尺寸时为 `true`。`PAPER_SIZES` 是模型自己的表。
 *
 * `true` for a named paper size. `PAPER_SIZES` is the model's own table.
 */
function asPaperFormat(value: unknown): NamedPaperFormat | undefined {
  const names = PAPER_FORMAT_OPTIONS.map((option) => option.value as string);
  return typeof value === "string" && names.includes(value) ? (value as NamedPaperFormat) : undefined;
}

/** 两种方向之一时为 `true`。 / `true` for one of the two orientations. */
function asOrientation(value: unknown): "portrait" | "landscape" | undefined {
  return value === "portrait" || value === "landscape" ? value : undefined;
}

/**
 * 读取一个 `Margins` 值 —— 可以是 CSS 简写字符串，也可以是逐边对象。
 *
 * Read a `Margins` value — either a CSS shorthand string or the per-side object.
 */
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

/**
 * 换算成毫米数值，供 `el-input-number` 使用。
 *
 * Millimetres, as a number, for an `el-input-number`.
 */
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
const pageNumberFormat = ref("- # -");
const hasLogo = ref(false);

/**
 * 页码与 logo 所在的位置，每个控件用一个字符串表示。
 *
 * `"none"` 是真实取值而不是空选择：它是用户在说「不显示」，已放置的页码或 logo 正是这样被
 * 移除的。其余取值是 `<side>:<slot>`，正是命令接受的形状。
 *
 * Where the page number and the logo sit, as one string per control.
 *
 * `"none"` is a real value rather than an empty selection: it is the user saying 不显示, which is
 * how a placed number or logo is removed. The other values are `<side>:<slot>`, which is exactly
 * what the commands take.
 */
const pageNumberPlacement = ref<string>("none");
const logoPlacement = ref<string>("none");

/**
 * 页码或 logo 可以放的六个位置，按阅读顺序排列。
 *
 * The six places a number or a logo can go, in reading order.
 */
const PLACEMENT_OPTIONS = computed(() => [
  { value: "top:left", label: `${t.value.page.header}-${t.value.page.slotLeft}` },
  { value: "top:center", label: `${t.value.page.header}-${t.value.page.slotCenter}` },
  { value: "top:right", label: `${t.value.page.header}-${t.value.page.slotRight}` },
  { value: "bottom:left", label: `${t.value.page.footer}-${t.value.page.slotLeft}` },
  { value: "bottom:center", label: `${t.value.page.footer}-${t.value.page.slotCenter}` },
  { value: "bottom:right", label: `${t.value.page.footer}-${t.value.page.slotRight}` }
]);

/**
 * 四个页边距方向，声明成数据，模板因此只需一次 `v-for`。
 *
 * The four margin sides, as data, so the template is one `v-for`.
 */
const MARGIN_SIDES = computed(() => [
  { key: "top" as const, label: t.value.page.top },
  { key: "bottom" as const, label: t.value.page.bottom },
  { key: "left" as const, label: t.value.page.left },
  { key: "right" as const, label: t.value.page.right }
]);

/** 从文档重新读取整个面板。 / Re-read the whole panel from the document. */
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

  // The height lives on the band nodes; the header wins because it is the one the user sees
  // first. It is read from the **node**, never from the extension's options — reading
  // `this.options.height` instead of `node.attrs.height` is exactly what made a per-node height
  // uneditable in the legacy build (defect 20).
  const height = header?.attrs.height ?? footer?.attrs.height;
  if (typeof height === "number") regionHeight.value = height;

  // Both placements come from the document, so the panel describes the template rather than the
  // last thing the user picked.
  pageNumberPlacement.value = placementOf(editor, "pageNumber") ?? "none";
  logoPlacement.value = placementOf(editor, "pageLogo") ?? "none";

  pageNumberFormat.value = readPageNumberFormat(editor) ?? pageNumberFormat.value;
}

/**
 * 某个节点类型落在哪一条页带的哪个区域，表示为 `<side>:<slot>`，或 `null`。
 *
 * 靠遍历页带的区域读出，而不是读某个存储属性：「号码在页脚中间三分之一」*就是*节点的位置，
 * 它的副本只会漂移。
 *
 * Which region of which band holds a node type, as `<side>:<slot>`, or `null`.
 *
 * Read by walking the bands' regions rather than from a stored attribute: "the number is in the
 * footer's centre third" *is* the node's position, and a copy of it could only drift.
 */
function placementOf(editor: Editor, typeName: string): string | null {
  for (const band of collectBands(editor.state.doc)) {
    for (const region of collectRegions(band.node, band.pos)) {
      // Recursive: the page number is inline, so it sits inside a paragraph of the region.
      if (regionHoldsType(region.node, typeName)) return `${band.side}:${region.slot}`;
    }
  }
  return null;
}

useEditorSelection(() => props.editor, sync);

/**
 * 页面扩展已注册、即其命令存在时为 `true`。
 *
 * `true` when the page extension is registered, so its commands exist.
 */
const pageReady = computed(
  () => props.editor?.extensionManager.extensions.some((extension) => extension.name === "page") ?? false
);

function applyPaperFormat(value: NamedPaperFormat): void {
  props.editor?.chain().focus().setPageFormat(value).run();
}

function applyOrientation(value: "portrait" | "landscape"): void {
  props.editor?.chain().focus().setPageOrientation(value).run();
}

/**
 * 预设把每一边都写成毫米长度，那是模型自己的单位。
 *
 * A preset writes each side as a millimetre length, which is the model's own unit.
 */
function applyMarginPreset(label: string): void {
  const preset = MARGIN_PRESETS.find((candidate) => candidate.label === label);
  if (!preset) return;

  margins.top = millimetres(preset.value.top, margins.top);
  margins.right = millimetres(preset.value.right, margins.right);
  margins.bottom = millimetres(preset.value.bottom, margins.bottom);
  margins.left = millimetres(preset.value.left, margins.left);
  applyMargins();
}

/** 在一个事务里应用四条自定义页边距。 / Apply all four custom margins in one transaction. */
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

/**
 * 应用页码格式串。
 *
 * 选一种格式**就是**用户要求一个页码的方式，所以这里调用的命令既会把该格式写到已有页码上，
 * *也*会创建缺失的那个 —— 放在默认位置，随后由位置控件显示出来。打开页脚后页脚是空的，
 * 于是旧版「只写到已存在的页码上」的行为无处可写，只能报告页脚没有页码：那是一条死路，而
 * 不是解释。
 *
 * 命令返回 `false` 表示「无事可做」—— 每个页码本来就是这个样子，或 schema 没有地方可放
 * —— 所以这里不再发警告。它过去报告的那条死路已经不可能出现：现在选一种格式就会把相应部件
 * 建出来。
 *
 * Apply the page-number pattern.
 *
 * Picking a format **is** how a user asks for a page number, so this calls the command that both
 * writes the format onto the existing numbers *and* creates the one that is missing — in the
 * default placement, which the position control then shows. Turning the footer on leaves it empty,
 * so the old "write onto the numbers that already exist" behaviour had nothing to write to and
 * could only report that the footer had no page number: a dead end rather than an explanation.
 *
 * The command returning `false` means "nothing to do" — every number already reads that way, or
 * the schema has no place to put one — so there is no warning here any more. The dead end it used
 * to report cannot happen: choosing a format now creates the furniture.
 */
function applyPageNumberFormat(value: string): void {
  if (value === "") return;
  const editor = props.editor;
  if (!editor) return;

  editor.commands.applyPageNumberFormat(value);
  // The panel's own state follows the document, so a number that was just created shows up as a
  // chosen position rather than as 不显示.
  sync();
}

/**
 * 应用页码位置，或移除该页码。
 *
 * `"none"` 即「不显示」：页码被删除，它占用的区域重新变为可编辑。
 *
 * Apply the page-number placement, or remove the number.
 *
 * `"none"` is 不显示: the number is deleted and the region it occupied becomes editable again.
 */
function applyPageNumberPlacement(value: string): void {
  if (!ensurePage()) return;
  const placement = parsePlacement(value);
  if (!placement) {
    props.editor?.chain().focus().removePageNumber().run();
    sync();
    return;
  }
  props.editor?.chain().focus().setPageNumberSlot(placement.side, placement.slot).run();
  sync();
}

/**
 * 把选中的 logo 文件读进文档，过大的文件会被拒绝。
 *
 * 图片源以 `data:` URL 存储 —— 模板是一件自足的产物，而指向一个在模板被打开时可能并不存在
 * 的文件的引用算不上模板 —— 所以文件大小*就是*文档大小。上限取自扩展自己（`maxBytes`，
 * 默认 200 KB），这样面板与模型无法在这一点上产生分歧。
 *
 * Read the picked logo file into the document, refusing one that is too large.
 *
 * The source is stored as a `data:` URL — a template is one artefact, and a reference to a file
 * that may not exist when the template is opened is not a template — so the file size *is* the
 * document size. The limit is the extension's own (`maxBytes`, 200 KB by default) so the panel and
 * the model cannot disagree about it.
 */
async function onLogoSelected(file: UploadFile): Promise<void> {
  const editor = props.editor;
  const raw = file.raw;
  if (!editor || !raw) return;
  if (!ensurePage()) return;

  if (raw.size > DEFAULT_MAX_LOGO_BYTES) {
    ElMessage.warning(t.value.page.logoTooLarge);
    return;
  }

  const target = parsePlacement(logoPlacement.value) ?? DEFAULT_LOGO_PLACEMENT;
  try {
    const source = await readAsDataUrl(raw);
    props.editor
      ?.chain()
      .focus()
      .setLogo(target, { src: source, width: DEFAULT_LOGO_ATTRIBUTES.width, height: "auto" })
      .run();
    sync();
  } catch {
    ElMessage.error(t.value.loadFailed);
  }
}

/** 移动已放置的 logo，或将它移除。 / Move the placed logo, or remove it. */
function applyLogoPlacement(value: string): void {
  if (!ensurePage()) return;
  const placement = parsePlacement(value);
  if (!placement) {
    props.editor?.chain().focus().removeLogo().run();
    sync();
    return;
  }
  // A move keeps the image: the source already lives on the node, so only the placement changes.
  props.editor?.chain().focus().setLogo(placement).run();
  sync();
}

/**
 * 把 `<side>:<slot>` 形式的控件值转成一个放置位置。
 *
 * Turn a `<side>:<slot>` control value into a placement.
 *
 * @returns 无法识别或为 `"none"` 时返回 `null`，调用方据此执行「移除」 /
 *   `null` for `"none"` and for anything unrecognised, which the callers treat as "remove".
 */
function parsePlacement(value: string): { side: "top" | "bottom"; slot: FurnitureSlot } | null {
  const [side, slot] = value.split(":");
  if (side !== "top" && side !== "bottom") return null;
  if (slot !== "left" && slot !== "center" && slot !== "right") return null;
  return { side, slot };
}

/**
 * 把选中的文件读成 data URL，使文档保持自包含。
 *
 * Read a picked file as a data URL, so the document stays self-contained.
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("image read produced a non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("image read failed"));
    reader.readAsDataURL(file);
  });
}
</script>

<style scoped lang="scss">
.s-tool-page {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;

  // A section is one group of controls plus the divider that bounds it on the right. The divider is
  // a child of the section rather than of the pane, so it always stays on the line of the group it
  // closes — with the pane's own wrapping it could otherwise be left alone on a new line.
  &__section {
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    gap: 12px;
  }

  // Stretched to the height of its section, the same rule `ToolInsert` uses for its dividers.
  &__divider {
    height: auto;
    align-self: stretch;
    margin: 0;
  }

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

  // The placement and pattern selects carry a width of their own: Element Plus's `.el-select`
  // resolves `--el-select-width: 100%` by default, so without one it stretches across the column.
  &__placement {
    width: 120px;
  }

  &__page-number {
    width: 140px;
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

  // The `?` next to 页码格式: it is a reference note, so it reads as a quiet affordance and
  // the tooltip carries the text.
  &__help {
    color: var(--se-color-text-secondary);
    font-size: 13px;
    cursor: help;

    &:hover {
      color: var(--el-color-primary);
    }
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
