<template>
  <div class="s-tool-table">
    <div class="s-tool-table__group">
      <!-- A popover rather than a dropdown: the grid is a target, and a dropdown item
           cannot express "which cell was hovered". -->
      <el-popover
        placement="bottom-start"
        trigger="click"
        :width="POPOVER_WIDTH"
        popper-class="s-editor-popper"
        @show="resetHover"
      >
        <template #reference>
          <el-button size="small">
            <SIcon :icon="IconTable" />
            <span class="s-tool-table__label">{{ t.table.table }}</span>
          </el-button>
        </template>
        <div class="s-table-grid">
          <div v-for="row in GRID" :key="`r-${row}`" class="s-table-grid__row">
            <div
              v-for="column in GRID"
              :key="`c-${row}-${column}`"
              class="s-table-grid__cell"
              :class="{ 'is-highlighted': isHighlighted(row - 1, column - 1) }"
              @mouseenter="hover(row - 1, column - 1)"
              @click="insertTable(row, column)"
            />
          </div>
          <p class="s-table-grid__info">{{ hoveredRows }} × {{ hoveredColumns }} {{ t.table.tableSize }}</p>
        </div>
      </el-popover>

      <el-popover
        placement="bottom-start"
        trigger="click"
        :width="POPOVER_WIDTH"
        popper-class="s-editor-popper"
        @show="resetHover"
      >
        <template #reference>
          <el-button size="small">
            <SIcon :icon="IconLayout" />
            <span class="s-tool-table__label">{{ t.table.layoutTable }}</span>
          </el-button>
        </template>
        <p class="s-table-grid__hint">{{ t.table.layoutTableHint }}</p>
        <div class="s-table-grid s-table-grid--layout">
          <div v-for="row in GRID" :key="`lr-${row}`" class="s-table-grid__row">
            <div
              v-for="column in GRID"
              :key="`lc-${row}-${column}`"
              class="s-table-grid__cell"
              :class="{ 'is-highlighted': isHighlighted(row - 1, column - 1) }"
              @mouseenter="hover(row - 1, column - 1)"
              @click="insertLayoutTable(row, column)"
            />
          </div>
          <p class="s-table-grid__info">{{ hoveredRows }} × {{ hoveredColumns }} {{ t.table.tableSize }}</p>
        </div>
      </el-popover>
    </div>

    <el-divider direction="vertical" class="s-tool-table__divider" />

    <div class="s-tool-table__group s-tool-table__group--wrap">
      <el-button
        v-for="operation in TABLE_OPERATIONS"
        :key="operation.command"
        size="small"
        :disabled="!operation.enabled()"
        @click="operation.run()"
      >
        <SIcon :icon="operation.icon" />
        <span class="s-tool-table__label">{{ operation.label }}</span>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolTable` —— 表格区块：插入网格，以及八个单元格/行/列操作。
 *
 * ## 为什么它自成一块面板
 *
 * 这些控件以前住在 `insert` 面板里，把两件不同的事混在一起：「往文档里放一个新东西」（变量、
 * 二维码、图片、分页符）和「改动光标已经所在的那张表」。把它们拆开意味着编辑表格时表格操作
 * 一次点击即可到达，而不是藏在一个不相干的标签页后面，同时也让 `insert` 面板只讲插入。
 *
 * ## 网格
 *
 * `el-popover` 加一个 8×8 的悬停目标，是 Element Plus 里唯一能把「插入一个 3×5 的表格」
 * 表达为一个手势的做法。「2×2 / 3×3 …」这样的下拉既更长也更不精确，而且旧版工具本来就用了
 * 网格 —— 做法是对的，坏掉的是它周围的机制。
 *
 * ## 用 `can()` 决定禁用
 *
 * 每个操作的 `:disabled` 都取自 Tiptap 自己的 `editor.can()`，并在每次选区变化时重新求值，
 * 因此按钮绝不会声称它能做它做不到的事。旧版模板把整条链内联重复了一遍，还完全没有可用性
 * 检查。
 *
 * `ToolTable` — the table section: the insert grids and the eight cell/row/column operations.
 *
 * ## Why this is its own pane
 *
 * These controls used to live in the `insert` pane, which mixed two different jobs: "put a
 * new thing into the document" (a variable, a QR code, an image, a page break) and "change
 * the table the caret is already standing in". Splitting them means the table operations are
 * reachable in one click while editing a table instead of behind an unrelated tab, and it
 * leaves the `insert` pane describing only insertion.
 *
 * ## The grids
 *
 * `el-popover` + an 8×8 hover target is the only Element Plus arrangement that expresses
 * "insert a 3×5 table" as one gesture. A dropdown of "2×2 / 3×3 …" would be both longer and
 * less precise, and the legacy tool already used a grid — the arrangement was right, it was
 * the surrounding machinery that was broken.
 *
 * ## Disabled from `can()`
 *
 * Every operation is `:disabled` from Tiptap's own `editor.can()`, re-evaluated on each
 * selection change, so a button never claims it will do something it cannot. The legacy
 * template repeated the whole chain inline with no availability check at all.
 */

import { computed, ref } from "vue";
import type { Component } from "vue";

import { SIcon } from "@snail-js/vue";
import {
  IconAddColumnAfter,
  IconAddColumnBefore,
  IconAddRowAfter,
  IconAddRowBefore,
  IconDeleteColumn,
  IconDeleteRow,
  IconLayout,
  IconMergeCells,
  IconTable,
  IconUnmergeCells
} from "@snail-js/vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { useEditorSelection } from "../../editor/useEditorSelection";
import { ElPopover, ElButton, ElDivider } from "element-plus";

defineOptions({ name: "ToolTable" });

/**
 * 本面板的 props：编辑器实例与语言覆盖，二者都来自 `ToolProps`，默认均为 `undefined`。
 *
 * This panel's props: the editor and the locale override, both from `ToolProps` and both
 * defaulting to `undefined`.
 */
const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

/** 网格为 8×8，与旧版工具一致。 / The grid is 8×8, as in the legacy tool. */
const GRID = 8;

/**
 * 单元格的边长，单位像素。
 *
 * 弹出层的宽度由它推导而不是写死：旧版面板在 135px 的网格外要了 220px，右侧留下 85px 空白，
 * 面板因此看起来是坏的。`24` 是 Element Plus 自己的 popper 内边距（每侧 12px）。
 *
 * One cell's edge, in pixels.
 *
 * The popover's width is derived from this rather than hard-coded: the legacy panel asked for
 * 220px around a 135px grid and left 85px of empty space on the right, which is what made the
 * panel look broken. `24` is Element Plus's own popper padding (12px per side).
 */
const CELL_SIZE = 18;
const POPOVER_WIDTH = GRID * CELL_SIZE + (GRID - 1) + 24;

const hoveredRows = ref(1);
const hoveredColumns = ref(1);

/**
 * 在每次选区或文档变化时自增，好让 `can()` 计算属性重新求值。
 *
 * Bumped on every selection/document change so the `can()` computeds re-evaluate.
 */
const revision = ref(0);

useEditorSelection(
  () => props.editor,
  () => {
    revision.value += 1;
  }
);

function isHighlighted(rowIndex: number, columnIndex: number): boolean {
  return rowIndex < hoveredRows.value && columnIndex < hoveredColumns.value;
}

function hover(rowIndex: number, columnIndex: number): void {
  hoveredRows.value = rowIndex + 1;
  hoveredColumns.value = columnIndex + 1;
}

function resetHover(): void {
  hoveredRows.value = 1;
  hoveredColumns.value = 1;
}

/** 插入一个普通表格。 / Insert a normal table. */
function insertTable(rows: number, columns: number): void {
  props.editor?.chain().focus().insertTable({ rows, cols: columns, withHeaderRow: true }).run();
  resetHover();
}

/**
 * 插入一个布局表格。
 *
 * 它按内容构造而不是走 `insertTable`，因为布局表格是带 `layoutMode: true` 的
 * `table`/`tableRow` 组合 —— 布局模式扩展的全局属性读的正是它，据此把边框切成虚线。单元格
 * 是空段落：布局表格是排版定位的工具，所以不该以填充文字开头。
 *
 * Insert a layout table.
 *
 * Built as content rather than through `insertTable` because a layout table is a
 * `table`/`tableRow` pair carrying `layoutMode: true`, which is what the layout-mode
 * extension's global attribute reads to switch the borders to dashed. The cells are empty
 * paragraphs: a layout table is a positioning device, so it must not start with filler text.
 */
function insertLayoutTable(rows: number, columns: number): void {
  const cell = { type: "tableCell", content: [{ type: "paragraph" }] };
  const row = {
    type: "tableRow",
    attrs: { layoutMode: true },
    content: Array.from({ length: columns }, () => cell)
  };

  props.editor
    ?.chain()
    .focus()
    .insertContent({
      type: "table",
      attrs: { layoutMode: true },
      content: Array.from({ length: rows }, () => row)
    })
    .run();

  resetHover();
}

interface TableOperation {
  command: string;
  label: string;
  icon: Component;
  run: () => void;
  enabled: () => boolean;
}

/**
 * 八个表格操作。
 *
 * 声明成数据，这样每个按钮就是一次 `v-for`，而它的 `enabled` 判定条件就写在它所守卫的命令
 * 旁边 —— 旧版模板把整条链内联重复，正因如此，一个没有处理函数的按钮才能上线而无人察觉。
 *
 * The eight table operations.
 *
 * Declared as data so each button is one `v-for` iteration and its `enabled` predicate is
 * written next to the command it guards — the legacy template repeated the whole chain
 * inline, which is how a button could ship with no handler and nobody notice.
 */
const TABLE_OPERATIONS = computed<readonly TableOperation[]>(() => {
  // `revision` is read so the computed re-evaluates on every selection change; the
  // `enabled` closures below then ask Tiptap's own `can()` for the live answer.
  void revision.value;
  const editor = props.editor;

  const can = (check: () => boolean): (() => boolean) => () => (editor ? check() : false);

  return [
    {
      command: "mergeCells",
      label: t.value.table.mergeCells,
      icon: IconMergeCells as Component,
      run: () => props.editor?.chain().focus().mergeCells().run(),
      enabled: can(() => editor?.can().mergeCells() ?? false)
    },
    {
      command: "splitCell",
      label: t.value.table.splitCell,
      icon: IconUnmergeCells as Component,
      run: () => props.editor?.chain().focus().splitCell().run(),
      enabled: can(() => editor?.can().splitCell() ?? false)
    },
    {
      command: "addColumnBefore",
      label: t.value.table.addColumnBefore,
      icon: IconAddColumnBefore as Component,
      run: () => props.editor?.chain().focus().addColumnBefore().run(),
      enabled: can(() => editor?.can().addColumnBefore() ?? false)
    },
    {
      command: "addColumnAfter",
      label: t.value.table.addColumnAfter,
      icon: IconAddColumnAfter as Component,
      run: () => props.editor?.chain().focus().addColumnAfter().run(),
      enabled: can(() => editor?.can().addColumnAfter() ?? false)
    },
    {
      command: "addRowBefore",
      label: t.value.table.addRowBefore,
      icon: IconAddRowBefore as Component,
      run: () => props.editor?.chain().focus().addRowBefore().run(),
      enabled: can(() => editor?.can().addRowBefore() ?? false)
    },
    {
      command: "addRowAfter",
      label: t.value.table.addRowAfter,
      icon: IconAddRowAfter as Component,
      run: () => props.editor?.chain().focus().addRowAfter().run(),
      enabled: can(() => editor?.can().addRowAfter() ?? false)
    },
    {
      command: "deleteColumn",
      label: t.value.table.deleteColumn,
      icon: IconDeleteColumn as Component,
      run: () => props.editor?.chain().focus().deleteColumn().run(),
      enabled: can(() => editor?.can().deleteColumn() ?? false)
    },
    {
      command: "deleteRow",
      label: t.value.table.deleteRow,
      icon: IconDeleteRow as Component,
      run: () => props.editor?.chain().focus().deleteRow().run(),
      enabled: can(() => editor?.can().deleteRow() ?? false)
    }
  ];
});
</script>

<style scoped lang="scss">
.s-tool-table {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 560px;

  &__group {
    display: flex;
    align-items: center;
    gap: 5px;

    &--wrap {
      flex-wrap: wrap;
      max-width: 300px;
    }
  }

  &__divider {
    height: auto;
    align-self: stretch;
  }

  &__label {
    margin-left: 4px;
  }
}

.s-table-grid {
  &__row {
    display: flex;
    gap: 1px;
  }

  &__cell {
    width: 18px;
    height: 18px;
    // The border and both fills come from `--se-*` tokens. They are only defined inside
    // `.s-editor-scope`, so this popover carries `popper-class="s-editor-popper"` — without it
    // the declaration is invalid at computed-value time and the grid draws nothing at all.
    box-sizing: border-box;
    border: 1px solid var(--se-color-cell-border);
    background-color: var(--se-color-paper);
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--se-color-tint);
    }

    &.is-highlighted {
      background-color: var(--se-color-primary);
      border-color: var(--se-color-primary);
    }
  }

  // A layout table is highlighted in the danger red, so the two grids cannot be confused
  // while the pointer is between them.
  &--layout {
    .s-table-grid__cell.is-highlighted {
      background-color: var(--el-color-danger);
      border-color: var(--el-color-danger);
    }
  }

  &__info {
    margin: 8px 0 0;
    text-align: center;
    font-size: 12px;
    color: var(--se-color-text-secondary);
  }

  &__hint {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--el-color-danger);
  }
}
</style>
