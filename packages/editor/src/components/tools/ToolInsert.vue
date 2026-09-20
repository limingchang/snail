<template>
  <div class="s-tool-insert">
    <div class="s-tool-insert__group">
      <!-- A popover rather than a dropdown: the grid is a target, and a dropdown item
           cannot express "which cell was hovered". -->
      <el-popover placement="bottom-start" trigger="click" :width="220" @show="resetHover">
        <template #reference>
          <el-button size="small">
            <SIcon :icon="IconTable" />
            <span class="s-tool-insert__label">{{ t.insert.table }}</span>
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
          <p class="s-table-grid__info">{{ hoveredRows }} × {{ hoveredColumns }} {{ t.insert.tableSize }}</p>
        </div>
      </el-popover>

      <el-popover placement="bottom-start" trigger="click" :width="240" @show="resetHover">
        <template #reference>
          <el-button size="small">
            <SIcon :icon="IconLayout" />
            <span class="s-tool-insert__label">{{ t.insert.layoutTable }}</span>
          </el-button>
        </template>
        <p class="s-table-grid__hint">{{ t.insert.layoutTableHint }}</p>
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
          <p class="s-table-grid__info">{{ hoveredRows }} × {{ hoveredColumns }} {{ t.insert.tableSize }}</p>
        </div>
      </el-popover>
    </div>

    <el-divider direction="vertical" class="s-tool-insert__divider" />

    <div class="s-tool-insert__group s-tool-insert__group--wrap">
      <el-button v-for="operation in TABLE_OPERATIONS" :key="operation.command" size="small" :disabled="!operation.enabled()" @click="operation.run()">
        <SIcon :icon="operation.icon" />
        <span class="s-tool-insert__label">{{ operation.label }}</span>
      </el-button>
    </div>

    <el-divider direction="vertical" class="s-tool-insert__divider" />

    <div class="s-tool-insert__group s-tool-insert__group--column">
      <el-button size="small" @click="addNewPage">
        <SIcon :icon="IconNewPage" />
        <span class="s-tool-insert__label">{{ t.insert.newPage }}</span>
      </el-button>
      <!-- Defect 21: the legacy 「分页」 button had no handler at all. It is wired to
           `insertPageBreak` here, and disabled when the extension is not registered. -->
      <el-button size="small" :disabled="!pageReady" @click="insertPageBreak">
        <el-icon><Scissor /></el-icon>
        <span class="s-tool-insert__label">{{ t.insert.pageBreak }}</span>
      </el-button>

      <el-upload
        :auto-upload="false"
        :show-file-list="false"
        accept="image/*"
        :on-change="onImageSelected"
      >
        <el-button size="small">
          <SIcon :icon="IconFileUpload" />
          <span class="s-tool-insert__label">{{ t.insert.image }}</span>
        </el-button>
      </el-upload>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolInsert` — the table grid, the table operations, page insertion and image upload.
 *
 * ## Why the grid is a real grid
 *
 * `el-popover` + an 8×8 hover target is the only Element Plus arrangement that expresses
 * "insert a 3×5 table" as one gesture. A dropdown of "2×2 / 3×3 …" would be both longer
 * and less precise, and the legacy tool already used a grid — the arrangement was right,
 * it was the surrounding machinery that was broken.
 *
 * ## What is fixed here
 *
 * - 「分页」 now calls `insertPageBreak`. In the legacy toolbar it had **no handler at
 *   all** (defect 21), and the five commands it should have called were declared but
 *   never implemented.
 * - Every table operation is `:disabled` from `editor.can()`, re-evaluated on every
 *   selection change, so a button never claims it will do something it cannot.
 * - No `addon-before`/`addon-after` on `el-input-number`: that API does not exist, and
 *   the legacy page panel called it anyway (defect 42). Suffixes are rendered as text.
 */

import { computed, ref } from "vue";
import type { Component } from "vue";

import { Scissor } from "@element-plus/icons-vue";
import type { UploadFile } from "element-plus";
import { ElMessage } from "element-plus";

import { SIcon } from "@snail-js/vue";
import {
  IconAddColumnAfter,
  IconAddColumnBefore,
  IconAddRowAfter,
  IconAddRowBefore,
  IconDeleteColumn,
  IconDeleteRow,
  IconFileUpload,
  IconLayout,
  IconMergeCells,
  IconNewPage,
  IconTable,
  IconUnmergeCells
} from "@snail-js/vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { useEditorSelection } from "../../editor/useEditorSelection";

defineOptions({ name: "ToolInsert" });

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

/** `true` while the page extension is registered, so its commands exist. */
const pageReady = computed(
  () => props.editor?.extensionManager.extensions.some((extension) => extension.name === "page") ?? false
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
 * paragraphs: a layout table is a positioning device, so it must not start with filler
 * text.
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

/** Add a page after the current one. */
function addNewPage(): void {
  if (!pageReady.value) {
    ElMessage.warning(t.value.notReady);
    return;
  }
  props.editor?.chain().focus().addNewPage().run();
}

/** Insert an explicit page break — the handler the legacy button never had. */
function insertPageBreak(): void {
  if (!pageReady.value) {
    ElMessage.warning(t.value.notReady);
    return;
  }
  props.editor?.chain().focus().insertPageBreak().run();
}

/** Read a picked file as a data URL, so the document stays self-contained. */
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

/** Insert the picked image inline. */
async function onImageSelected(file: UploadFile): Promise<void> {
  const editor = props.editor;
  const raw = file.raw;
  if (!editor || !raw) return;

  try {
    const source = await readAsDataUrl(raw);
    editor.chain().focus().setImage({ src: source, alt: file.name }).run();
  } catch {
    // The failure is a *read* failure (an unreadable file, a revoked permission), not a
    // document failure; the document is untouched, so a message is the whole response.
    ElMessage.error(t.value.loadFailed);
  }
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
 * inline, which is why the 「分页」 button could ship with no handler and nobody noticed.
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
      label: t.value.insert.mergeCells,
      icon: IconMergeCells as Component,
      run: () => props.editor?.chain().focus().mergeCells().run(),
      enabled: can(() => editor?.can().mergeCells() ?? false)
    },
    {
      command: "splitCell",
      label: t.value.insert.splitCell,
      icon: IconUnmergeCells as Component,
      run: () => props.editor?.chain().focus().splitCell().run(),
      enabled: can(() => editor?.can().splitCell() ?? false)
    },
    {
      command: "addColumnBefore",
      label: t.value.insert.addColumnBefore,
      icon: IconAddColumnBefore as Component,
      run: () => props.editor?.chain().focus().addColumnBefore().run(),
      enabled: can(() => editor?.can().addColumnBefore() ?? false)
    },
    {
      command: "addColumnAfter",
      label: t.value.insert.addColumnAfter,
      icon: IconAddColumnAfter as Component,
      run: () => props.editor?.chain().focus().addColumnAfter().run(),
      enabled: can(() => editor?.can().addColumnAfter() ?? false)
    },
    {
      command: "addRowBefore",
      label: t.value.insert.addRowBefore,
      icon: IconAddRowBefore as Component,
      run: () => props.editor?.chain().focus().addRowBefore().run(),
      enabled: can(() => editor?.can().addRowBefore() ?? false)
    },
    {
      command: "addRowAfter",
      label: t.value.insert.addRowAfter,
      icon: IconAddRowAfter as Component,
      run: () => props.editor?.chain().focus().addRowAfter().run(),
      enabled: can(() => editor?.can().addRowAfter() ?? false)
    },
    {
      command: "deleteColumn",
      label: t.value.insert.deleteColumn,
      icon: IconDeleteColumn as Component,
      run: () => props.editor?.chain().focus().deleteColumn().run(),
      enabled: can(() => editor?.can().deleteColumn() ?? false)
    },
    {
      command: "deleteRow",
      label: t.value.insert.deleteRow,
      icon: IconDeleteRow as Component,
      run: () => props.editor?.chain().focus().deleteRow().run(),
      enabled: can(() => editor?.can().deleteRow() ?? false)
    }
  ];
});
</script>

<style scoped lang="scss">
.s-tool-insert {
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
      max-width: 260px;
    }

    &--column {
      flex-direction: column;
      align-items: stretch;
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
