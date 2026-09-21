<template>
  <div class="s-tool-table">
    <div class="s-tool-table__group">
      <!-- A popover rather than a dropdown: the grid is a target, and a dropdown item
           cannot express "which cell was hovered". -->
      <el-popover placement="bottom-start" trigger="click" :width="220" @show="resetHover">
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

      <el-popover placement="bottom-start" trigger="click" :width="240" @show="resetHover">
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

defineOptions({ name: "ToolTable" });

const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

/** The grid is 8×8, as in the legacy tool. */
const GRID = 8;

const hoveredRows = ref(1);
const hoveredColumns = ref(1);

/** Bumped on every selection/document change so the `can()` computeds re-evaluate. */
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

/** Insert a normal table. */
function insertTable(rows: number, columns: number): void {
  props.editor?.chain().focus().insertTable({ rows, cols: columns, withHeaderRow: true }).run();
  resetHover();
}

/**
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
    width: 16px;
    height: 16px;
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
