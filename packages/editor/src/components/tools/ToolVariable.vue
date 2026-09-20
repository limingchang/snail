<template>
  <div class="s-tool-variable">
    <div class="s-tool-variable__header">
      <el-button size="small" @click="emits('insert')">
        <SIcon :icon="IconVariable" />
        <span class="s-tool-variable__label">{{ t.variable.insert }}</span>
      </el-button>
      <span class="s-tool-variable__count">{{ t.variable.list }} ({{ variables.length }})</span>
    </div>

    <el-empty v-if="variables.length === 0" :description="t.variable.empty" :image-size="48" />

    <ul v-else class="s-tool-variable__list">
      <li v-for="variable in variables" :key="`${variable.pos}-${variable.attrs.key}`" class="s-tool-variable__item">
        <div class="s-tool-variable__info">
          <span class="s-tool-variable__title">{{ variable.attrs.label }}</span>
          <el-tag size="small" type="info">{{ typeLabel(variable.attrs.data.type) }}</el-tag>
          <code class="s-tool-variable__key">{{ variable.attrs.key }}</code>
        </div>
        <dl class="s-tool-variable__meta">
          <!-- `defaultValue`, not `value`: the legacy panel read `attrs.value`, which
               nothing ever wrote, so 默认值 always rendered empty (defect 28). -->
          <div>
            <dt>{{ t.variable.defaultValue }}</dt>
            <dd>{{ formatValue(variable.attrs.defaultValue) }}</dd>
          </div>
          <div>
            <dt>{{ t.variable.desc }}</dt>
            <dd>{{ variable.attrs.desc ?? "—" }}</dd>
          </div>
        </dl>
        <div class="s-tool-variable__actions">
          <el-button size="small" @click="emits('edit', variable.attrs, variable.pos)">
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button size="small" type="danger" plain @click="remove(variable.pos)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolVariable` — the document's variables, with insert, edit and remove.
 *
 * ## Why the panel reads the document
 *
 * `collectDocumentVariables` walks the live document, so the list is the truth rather
 * than a local cache that has to be kept in step. The legacy panel kept a single
 * `showVariableAttrs` ref that was assigned from whichever variable was last clicked and
 * merged with `Object.assign`, so the panel described a variable that might no longer
 * exist and the next insert dialog opened pre-filled with the previous variable's state
 * (defect 27).
 *
 * ## Edit and remove are addressed by position
 *
 * `updateVariable(pos, attrs)` and `removeVariable(pos)` take a position, so an edit
 * lands on the variable the user clicked rather than on whatever the selection happens to
 * cover — the legacy `updateAttributes("variable", attrs)` silently did nothing unless a
 * `NodeSelection` sat exactly on the node (defect 22).
 *
 * A removal is immediate and undoable rather than behind a confirm dialog: undo/redo is
 * registered again (defect 14), and a confirm step on every removal is worse than one
 * `Ctrl+Z`.
 */

import { computed, ref } from "vue";

import { Delete, Edit } from "@element-plus/icons-vue";

import { SIcon } from "@snail-js/vue";
import { IconVariable } from "@snail-js/vue";

import { collectDocumentVariables } from "../../extensions/variable";
import type { DocumentVariable } from "../../extensions/variable";
import type { VariableValue } from "../../typings/variable";
import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { useEditorSelection } from "../../editor/useEditorSelection";

defineOptions({ name: "ToolVariable" });

const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const emits = defineEmits<{
  /** The user asked for a new variable; the host opens the design dialog empty. */
  insert: [];
  /** The user asked to edit one; `pos` addresses it in the live document. */
  edit: [attrs: DocumentVariable["attrs"], pos: number];
}>();

const t = computed(() => mergeEditorLocale(props.locale));

const variables = ref<DocumentVariable[]>([]);

/** Re-read the variable list from the document. */
function sync(): void {
  variables.value = props.editor ? collectDocumentVariables(props.editor) : [];
}

useEditorSelection(() => props.editor, sync);

/** A localised type name, falling back to the raw discriminant. */
function typeLabel(type: string): string {
  return t.value.variable.typeOptions[type] ?? type;
}

/**
 * Render a default value for display.
 *
 * `undefined` is shown as an em dash rather than as an empty cell, because "no default"
 * and "a default that is the empty string" are different states and the legacy panel
 * showed both as blank.
 */
function formatValue(value: VariableValue): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? t.value.variable.trueText : t.value.variable.falseText;
  return String(value);
}

/** Delete one variable by position. */
function remove(pos: number): void {
  props.editor?.chain().focus().removeVariable(pos).run();
  sync();
}
</script>

<style scoped lang="scss">
.s-tool-variable {
  min-width: 340px;
  max-width: 420px;
  max-height: 260px;
  overflow-y: auto;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__label {
    margin-left: 4px;
  }

  &__count {
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 8px;
    padding: 6px 8px;
    border: 1px solid var(--se-color-toolbar-border);
    border-radius: var(--se-toolbar-radius);
  }

  &__info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  &__title {
    font-weight: 600;
  }

  &__key {
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }

  &__meta {
    grid-column: 1 / -1;
    margin: 0;
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--se-color-text-secondary);

    div {
      display: flex;
      gap: 4px;
    }

    dt,
    dd {
      margin: 0;
    }
  }

  &__actions {
    grid-row: 1;
    grid-column: 2;
  }
}
</style>
