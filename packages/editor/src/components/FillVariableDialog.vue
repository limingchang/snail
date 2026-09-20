<template>
  <el-dialog
    v-model="visible"
    class="s-editor-dialog"
    :title="t.fill.title"
    width="640px"
    append-to-body
    destroy-on-close
  >
    <el-empty v-if="variables.length === 0" :description="t.fill.noVariables" :image-size="60" />

    <el-form v-else label-width="120px" size="small" @submit.prevent>
      <el-form-item
        v-for="variable in variables"
        :key="variable.attrs.key"
        :label="variable.attrs.label"
        :error="errorFor(variable.attrs.key)"
      >
        <div class="s-fill-dialog__field">
          <!-- text ------------------------------------------------------------ -->
          <el-input
            v-if="variable.attrs.data.type === 'text'"
            :model-value="asText(variable.attrs.key)"
            :placeholder="variable.attrs.data.placeholder ?? ''"
            @update:model-value="(value: string) => setText(variable.attrs.key, value)"
          />

          <!-- number ---------------------------------------------------------- -->
          <el-input-number
            v-else-if="variable.attrs.data.type === 'number'"
            :model-value="asNumber(variable.attrs.key)"
            :min="variable.attrs.data.min"
            :max="variable.attrs.data.max"
            :precision="variable.attrs.data.precision"
            :controls="false"
            class="s-fill-dialog__number"
            @update:model-value="(value: number | undefined) => setNumber(variable.attrs.key, value)"
          />

          <!-- money: the ￥ prefix is rendered as text; `el-input-number` has no
               `addon-before` slot, and the legacy dialog called one anyway. -->
          <template v-else-if="variable.attrs.data.type === 'money'">
            <span class="s-fill-dialog__prefix">{{ variable.attrs.data.currency ?? "￥" }}</span>
            <el-input-number
              :model-value="asNumber(variable.attrs.key)"
              :precision="variable.attrs.data.precision ?? 2"
              :controls="false"
              class="s-fill-dialog__number"
              @update:model-value="(value: number | undefined) => setNumber(variable.attrs.key, value)"
            />
          </template>

          <!-- boolean --------------------------------------------------------- -->
          <el-switch
            v-else-if="variable.attrs.data.type === 'boolean'"
            :model-value="asBoolean(variable.attrs.key)"
            :active-text="variable.attrs.data.trueText ?? t.variable.trueText"
            :inactive-text="variable.attrs.data.falseText ?? t.variable.falseText"
            @update:model-value="(value: boolean | string | number) => setBoolean(variable.attrs.key, value === true)"
          />

          <!-- date ------------------------------------------------------------ -->
          <el-date-picker
            v-else-if="variable.attrs.data.type === 'date'"
            :model-value="asText(variable.attrs.key)"
            type="date"
            value-format="YYYY-MM-DD"
            :placeholder="variable.attrs.data.format ?? 'YYYY年MM月DD日'"
            @update:model-value="(value: string | null) => setText(variable.attrs.key, value === null ? '' : String(value))"
          />

          <!-- select: an empty option list falls back to free text, which is what the
               resolver documents. -->
          <el-select
            v-else-if="variable.attrs.data.type === 'select' && variable.attrs.data.options.length > 0"
            :model-value="asText(variable.attrs.key)"
            :multiple="variable.attrs.data.multiple === true"
            class="s-fill-dialog__select"
            @update:model-value="(value: string | number | boolean | Array<string | number>) => setSelect(variable.attrs.key, value)"
          >
            <el-option
              v-for="option in variable.attrs.data.options"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-input
            v-else-if="variable.attrs.data.type === 'select'"
            :model-value="asText(variable.attrs.key)"
            @update:model-value="(value: string) => setText(variable.attrs.key, value)"
          />

          <!-- image: an upload, or a signature pad ---------------------------- -->
          <template v-else-if="variable.attrs.data.type === 'image'">
            <template v-if="variable.attrs.data.source === 'signature'">
              <canvas
                ref="signatureCanvas"
                class="s-fill-dialog__signature"
                width="360"
                height="120"
                @pointerdown="startStroke"
                @pointermove="extendStroke"
                @pointerup="endStroke"
                @pointerleave="endStroke"
              />
              <div class="s-fill-dialog__signature-actions">
                <el-button size="small" @click="clearSignature">{{ t.common.reset }}</el-button>
                <el-button size="small" type="primary" @click="applySignature(variable.attrs.key)">
                  {{ t.fill.signature }}
                </el-button>
              </div>
            </template>
            <el-upload
              v-else
              :auto-upload="false"
              :show-file-list="false"
              :accept="acceptOf(variable.attrs.data)"
              :on-change="(file: UploadFile) => onImage(variable.attrs.key, file, variable.attrs.data)"
            >
              <el-button size="small">{{ t.fill.imageUpload }}</el-button>
            </el-upload>
            <img v-if="asText(variable.attrs.key) !== ''" :src="asText(variable.attrs.key)" class="s-fill-dialog__preview" alt="" />
          </template>

          <!-- formula and system: the document supplies these ------------------ -->
          <template v-else-if="variable.attrs.data.type === 'formula'">
            <el-input :model-value="displayOf(variable.attrs.key)" readonly />
            <span class="s-fill-dialog__note">{{ t.fill.formulaComputed }}</span>
          </template>
          <template v-else>
            <el-input :model-value="displayOf(variable.attrs.key)" readonly />
            <span class="s-fill-dialog__note">{{ t.fill.systemHint }}</span>
          </template>

          <span v-if="variable.attrs.desc" class="s-fill-dialog__desc">{{ variable.attrs.desc }}</span>
          <span v-if="warningFor(variable.attrs.key)" class="s-fill-dialog__warning">
            {{ warningFor(variable.attrs.key) }}
          </span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <span v-if="blockingMessages.length > 0" class="s-fill-dialog__blocking">
        {{ t.fill.issueCount.replace("{count}", String(blockingMessages.length)) }}
      </span>
      <el-button size="small" @click="visible = false">{{ t.common.cancel }}</el-button>
      <el-button size="small" type="primary" @click="submit">{{ t.fill.submit }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * `FillVariableDialog` — the **fill** dialog.
 *
 * ## It is rendered from the template, not from a fixed field list
 *
 * One field per variable in the loaded document, with the widget the variable's *type*
 * implies and its own configuration applied: a `number` gets the author's precision and
 * bounds, a `money` gets the currency prefix, a `select` gets the author's option list, an
 * `image` gets the accepted type and the size limit. The legacy component had no fill
 * dialog at all — it faked filling with a hard-coded `{ key1: "张三" }` and never read its
 * own `data` prop (defect 38).
 *
 * ## Validation is the resolver's
 *
 * `validateFill` decides what blocks submission, and `resolveDocumentVariables` supplies
 * the formula results *and* the formula issues, so a template whose formula references a
 * variable that does not exist is reported against the formula's own field before the user
 * has typed anything. Both are the same functions the document itself renders through,
 * which is why the dialog and the paper cannot disagree.
 *
 * ## `formula` and `system` are read-only
 *
 * They are computed by the document, not entered by the user. They are still *shown*, with
 * the note that says so — a fill operator who cannot see the computed total has no way to
 * check it.
 */

import { computed, ref, watch } from "vue";

import type { UploadFile } from "element-plus";
import { ElMessage } from "element-plus";

import { resolveDocumentVariables, validateFill } from "../extensions/variable";
import type { ResolvedVariable } from "../extensions/variable";
import type { SystemContext } from "../extensions/variable/resolver";
import type {
  VariableAttrs,
  VariableData,
  VariableFillData,
  VariableIssue,
  VariableValue
} from "../typings/variable";

import { mergeEditorLocale } from "../editor/locale";
import type { EditorLocale } from "../editor/locale";

/**
 * A variable with its position.
 *
 * Structurally `PositionedVariable` from the variable extension, and deliberately declared
 * here as the two fields the dialog uses rather than imported: the dialog's input is a
 * plain `{ pos, attrs }` pair, which is what `collectDocumentVariables` returns and what
 * `validateFill`/`resolveDocumentVariables` accept.
 */
interface FillVariable {
  pos: number;
  attrs: VariableAttrs;
}

/**
 * The `accept` attribute for an image variable's upload.
 *
 * A helper rather than an inline `??` in the template: inside a nested `v-if`/`v-else`
 * branch, the template checker cannot follow the discriminant narrowing of
 * `variable.attrs.data`, so the template is not a place where `data.type === "image"` can
 * be assumed.
 */
function acceptOf(data: VariableData): string {
  return data.type === "image" ? data.accept ?? "image/*" : "image/*";
}

defineOptions({ name: "FillVariableDialog" });

const props = withDefaults(
  defineProps<{
    /** Whether the dialog is open. `v-model:open`. */
    open: boolean;

    /** Every variable in the document. */
    variables?: readonly FillVariable[];

    /** The current fill data, used to seed the form. */
    values?: VariableFillData;

    /** The 1-based page being filled, for a `system` variable. */
    page?: number;

    /** How many pages the document has, for a `system` variable. */
    total?: number;

    /** Partial locale overrides. */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    variables: () => [],
    values: undefined,
    page: 1,
    total: 1,
    locale: undefined
  }
);

const emits = defineEmits<{
  "update:open": [open: boolean];
  /** The user confirmed a valid set of values. */
  submit: [values: VariableFillData];
}>();

const t = computed(() => mergeEditorLocale(props.locale));

const visible = computed({
  get: () => props.open,
  set: (value: boolean) => emits("update:open", value)
});

/**
 * The dialog's working copy.
 *
 * `VariableValue` is scalar, and a multiple `select` produces an array. The resolver
 * documents array tolerance for exactly that case (`renderSelect` joins it with
 * `joinWith`, and `validateFill` checks every member), so the array is admitted at
 * {@link setSelect} — the one place a control can produce one — with an explicit
 * conversion rather than by widening the public `VariableFillData`, which is the contract
 * a *consumer* stores.
 */
const draft = ref<Record<string, VariableValue>>({});

/** Bumped so a stroke on the signature canvas is not lost to Vue's non-reactive canvas. */
const signatureRevision = ref(0);

const now = new Date();

/** One field per key: a contract repeats `{甲方}` and must not be asked for it twice. */
const variables = computed<readonly FillVariable[]>(() => {
  const seen = new Set<string>();
  const unique: FillVariable[] = [];
  for (const variable of props.variables) {
    if (seen.has(variable.attrs.key)) continue;
    seen.add(variable.attrs.key);
    unique.push({ pos: variable.pos, attrs: variable.attrs });
  }
  return unique;
});

/** The resolved values, plus every issue resolution produced. */
const resolution = computed<{ byKey: Map<string, ResolvedVariable>; errors: VariableIssue[] }>(() => {
  const errors: VariableIssue[] = [];
  const system: SystemContext = {
    page: props.page,
    total: props.total,
    now,
    errors
  };
  const resolved = resolveDocumentVariables(
    variables.value.map((variable) => ({ pos: variable.pos, attrs: variable.attrs })),
    draft.value,
    system
  );

  const byKey = new Map<string, ResolvedVariable>();
  for (const item of resolved) byKey.set(item.key, item);
  return { byKey, errors };
});

/** Everything wrong with the current draft, from both validators. */
const issues = computed<VariableIssue[]>(() => [
  ...validateFill(
    variables.value.map((variable) => ({ pos: variable.pos, attrs: variable.attrs })),
    draft.value
  ),
  ...resolution.value.errors
]);

const blockingMessages = computed(() => issues.value.filter((issue) => issue.severity === "error"));

function errorFor(key: string): string {
  return issues.value.find((issue) => issue.key === key && issue.severity === "error")?.message ?? "";
}

function warningFor(key: string): string {
  return issues.value.find((issue) => issue.key === key && issue.severity === "warning")?.message ?? "";
}

/** The document's own value for a `formula` or `system` variable. */
function displayOf(key: string): string {
  return resolution.value.byKey.get(key)?.display ?? "";
}

// ---------------------------------------------------------------------------------
// Field values
// ---------------------------------------------------------------------------------

/** Read a value as the string a text input wants. */
function asText(key: string): string {
  const value = draft.value[key];
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return (value as unknown as Array<string | number>).join("、");
  return String(value);
}

/** Read a value as the number a numeric input wants. */
function asNumber(key: string): number {
  const value = draft.value[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Read a value as a boolean. */
function asBoolean(key: string): boolean {
  return draft.value[key] === true;
}

function setText(key: string, value: string): void {
  draft.value[key] = value;
}

function setNumber(key: string, value: number | undefined): void {
  draft.value[key] = value === undefined ? 0 : value;
}

function setBoolean(key: string, value: boolean): void {
  draft.value[key] = value;
}

/**
 * A `select` value.
 *
 * A single choice arrives as a scalar and a `multiple` one as an array; the array is
 * passed through because every reader downstream — `renderSelect`, `validateFill` —
 * handles it. See the comment on {@link draft}.
 */
function setSelect(key: string, value: string | number | boolean | Array<string | number>): void {
  draft.value[key] = Array.isArray(value) ? (value as unknown as VariableValue) : value;
}

/**
 * Read an uploaded image into the draft, enforcing the author's size limit.
 *
 * `data` is the whole union and is narrowed here rather than at the call site: the template
 * cannot follow the discriminant through nested branches, and a helper that takes the union
 * is the smallest place the narrowing can live.
 */
async function onImage(key: string, file: UploadFile, data: VariableData): Promise<void> {
  const raw = file.raw;
  if (!raw) return;

  const maxSizeMb = data.type === "image" ? data.maxSizeMb ?? 2 : 2;
  const limit = maxSizeMb * 1024 * 1024;
  if (raw.size > limit) {
    ElMessage.error(`${t.value.variable.imageMaxSize}: ${maxSizeMb} MB`);
    return;
  }

  try {
    draft.value[key] = await readAsDataUrl(raw);
  } catch {
    ElMessage.error(t.value.loadFailed);
  }
}

/** Read a file as a data URL, so the filled document stays self-contained. */
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

// ---------------------------------------------------------------------------------
// Signature pad
// ---------------------------------------------------------------------------------

const signatureCanvas = ref<HTMLCanvasElement | null>(null);
let drawing = false;

/** The canvas 2D context, or `undefined` when the element is not ready. */
function context(): CanvasRenderingContext2D | undefined {
  return signatureCanvas.value?.getContext("2d") ?? undefined;
}

/** The pointer position, in canvas coordinates. */
function pointOf(event: PointerEvent): { x: number; y: number } {
  const canvas = signatureCanvas.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function startStroke(event: PointerEvent): void {
  const ctx = context();
  if (!ctx) return;
  drawing = true;
  const point = pointOf(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function extendStroke(event: PointerEvent): void {
  if (!drawing) return;
  const ctx = context();
  if (!ctx) return;
  const point = pointOf(event);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000000";
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  signatureRevision.value += 1;
}

function endStroke(): void {
  drawing = false;
}

function clearSignature(): void {
  const canvas = signatureCanvas.value;
  const ctx = context();
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signatureRevision.value += 1;
}

/** Turn the stroke into the value the document stores. */
function applySignature(key: string): void {
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  // `signatureRevision` is read so a stroke registered a moment ago is not missed by a
  // stale handler closure.
  void signatureRevision.value;
  draft.value[key] = canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------

/** Seed the form from the caller's data and each variable's default. */
function reset(): void {
  const seeded: Record<string, VariableValue> = {};
  for (const variable of variables.value) {
    const existing = props.values?.[variable.attrs.key];
    if (existing !== undefined) seeded[variable.attrs.key] = existing;
    else if (variable.attrs.defaultValue !== undefined) seeded[variable.attrs.key] = variable.attrs.defaultValue;
  }
  draft.value = seeded;
}

watch(
  () => props.open,
  (open) => {
    if (open) reset();
  },
  { immediate: true }
);

/** Confirm, refusing while an error-severity issue remains. */
function submit(): void {
  if (blockingMessages.value.length > 0) {
    // The messages are already rendered against their fields; the footer count says how
    // many there are, so the dialog stays open and the user can see which.
    return;
  }

  const values: VariableFillData = {};
  for (const variable of variables.value) {
    const key = variable.attrs.key;
    const value = draft.value[key];
    if (value !== undefined) values[key] = value;
  }

  emits("submit", values);
  visible.value = false;
}
</script>

<style scoped lang="scss">
.s-fill-dialog {
  &__field {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
  }

  &__number {
    width: 150px;
  }

  &__select {
    width: 220px;
  }

  &__prefix {
    color: var(--se-color-text-secondary);
  }

  &__note,
  &__desc {
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }

  &__warning {
    color: var(--el-color-warning);
    font-size: 12px;
  }

  &__blocking {
    float: left;
    color: var(--el-color-danger);
    font-size: 12px;
    line-height: 32px;
  }

  &__signature {
    border: 1px dashed var(--se-color-cell-border);
    border-radius: var(--se-variable-radius);
    touch-action: none;
    cursor: crosshair;
  }

  &__signature-actions {
    display: flex;
    gap: 6px;
  }

  &__preview {
    max-height: 40px;
  }
}
</style>
