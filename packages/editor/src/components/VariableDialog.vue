<template>
  <el-dialog
    v-model="visible"
    class="s-editor-dialog"
    :title="isEditing ? t.variable.editTitle : t.variable.createTitle"
    width="620px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="small" @submit.prevent>
      <!-- Identity ------------------------------------------------------------ -->
      <el-form-item :label="t.variable.label" prop="label">
        <el-input v-model="form.label" maxlength="40" />
      </el-form-item>

      <el-form-item :label="t.variable.type">
        <el-select v-model="form.type" class="s-variable-dialog__type" @change="onTypeChange">
          <el-option
            v-for="type in allowedTypes"
            :key="type"
            :label="typeLabel(type)"
            :value="type"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t.variable.keySource">
        <el-radio-group v-model="form.keySource">
          <el-radio value="manual">{{ t.variable.keySourceManual }}</el-radio>
          <el-radio value="inner" :disabled="innerOptions.length === 0">{{ t.variable.keySourceInner }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="t.variable.key" prop="key">
        <div class="s-variable-dialog__key">
          <el-input v-model="form.key" :disabled="form.keySource === 'inner'" />
          <!-- A cascader over the caller's `innerVariable` tree. The legacy dialog showed
               both an input and a cascader at the same time, and the cascade wrote into the
               same field; here the source radio decides which control is live. -->
          <el-cascader
            v-if="form.keySource === 'inner'"
            v-model="cascaderPath"
            :options="cascaderOptions"
            :props="cascaderProps"
            :placeholder="t.variable.pickInner"
            clearable
            @change="onInnerPicked"
          />
        </div>
      </el-form-item>

      <el-form-item :label="t.variable.desc">
        <el-input v-model="form.desc" maxlength="120" />
      </el-form-item>

      <!-- Default value ------------------------------------------------------- -->
      <el-form-item :label="t.variable.defaultValue">
        <el-input v-if="form.type === 'text' || form.type === 'date'" v-model="defaultText" />
        <el-input v-else-if="form.type === 'number' || form.type === 'money'" v-model="defaultNumber" type="number" />
        <el-switch v-else-if="form.type === 'boolean'" v-model="defaultBoolean" :active-text="t.variable.trueText" :inactive-text="t.variable.falseText" />
        <el-input v-else-if="form.type === 'image'" v-model="defaultText" placeholder="data:image/… 或图片地址" />
        <span v-else class="s-variable-dialog__note">{{ t.fill.systemValue }}</span>
      </el-form-item>

      <!-- Type-specific configuration ---------------------------------------- -->
      <template v-if="form.type === 'text'">
        <el-form-item :label="t.variable.maxLength">
          <el-input-number v-model="textMaxLength" :min="0" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
        <el-form-item :label="t.variable.placeholder">
          <el-input v-model="textPlaceholder" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'number'">
        <el-form-item :label="t.variable.precision">
          <el-input-number v-model="numberPrecision" :min="0" :max="10" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
        <el-form-item :label="t.variable.thousands">
          <el-switch v-model="numberThousands" />
        </el-form-item>
        <el-form-item :label="t.variable.min">
          <el-input-number v-model="numberMin" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
        <el-form-item :label="t.variable.max">
          <el-input-number v-model="numberMax" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'money'">
        <el-form-item :label="t.variable.precision">
          <el-input-number v-model="moneyPrecision" :min="0" :max="6" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
        <el-form-item :label="t.variable.currency">
          <el-input v-model="moneyCurrency" class="s-variable-dialog__short" />
        </el-form-item>
        <el-form-item :label="t.variable.thousands">
          <el-switch v-model="moneyThousands" />
        </el-form-item>
        <el-form-item :label="t.variable.chineseUppercase">
          <el-switch v-model="moneyChineseUppercase" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'boolean'">
        <el-form-item :label="t.variable.trueText">
          <el-input v-model="booleanTrueText" class="s-variable-dialog__short" />
        </el-form-item>
        <el-form-item :label="t.variable.falseText">
          <el-input v-model="booleanFalseText" class="s-variable-dialog__short" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'date'">
        <el-form-item :label="t.variable.dateFormat">
          <el-input v-model="dateFormat" />
        </el-form-item>
        <el-form-item :label="t.variable.resolveToday">
          <el-switch v-model="dateResolveToday" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'select'">
        <el-form-item :label="t.variable.options" :error="optionsError">
          <div class="s-variable-dialog__options">
            <div v-for="(option, index) in selectOptions" :key="index" class="s-variable-dialog__option">
              <el-input v-model="option.label" :placeholder="t.variable.optionLabel" />
              <el-input v-model="option.value" :placeholder="t.variable.optionValue" />
              <el-input v-model="option.description" :placeholder="t.variable.optionDescription" />
              <el-button size="small" :disabled="index === 0" :title="t.variable.moveUp" @click="moveOption(index, -1)">
                <el-icon><Top /></el-icon>
              </el-button>
              <el-button
                size="small"
                :disabled="index === selectOptions.length - 1"
                :title="t.variable.moveDown"
                @click="moveOption(index, 1)"
              >
                <el-icon><Bottom /></el-icon>
              </el-button>
              <el-button size="small" type="danger" plain @click="removeOption(index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button size="small" @click="addOption">
              <el-icon><Plus /></el-icon>
              <span>{{ t.common.add }}</span>
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t.variable.multiple">
          <el-switch v-model="selectMultiple" />
        </el-form-item>
        <el-form-item v-if="selectMultiple" :label="t.variable.joinWith">
          <el-input v-model="selectJoinWith" class="s-variable-dialog__short" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'image'">
        <el-form-item :label="t.variable.imageSource">
          <el-radio-group v-model="imageSource">
            <el-radio value="upload">{{ t.variable.imageUpload }}</el-radio>
            <el-radio value="signature">{{ t.variable.imageSignature }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t.variable.imageAccept">
          <el-input v-model="imageAccept" class="s-variable-dialog__short" />
        </el-form-item>
        <el-form-item :label="t.variable.imageMaxSize">
          <el-input-number v-model="imageMaxSizeMb" :min="0" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
        <el-form-item :label="t.variable.imageWidth">
          <el-input v-model="imageWidth" placeholder="40mm" class="s-variable-dialog__short" />
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'formula'">
        <el-form-item :label="t.variable.formulaExpression" :error="formulaError">
          <el-input v-model="formulaExpression" type="textarea" :rows="2" placeholder="SUM(item1, item2) * 1.06" />
        </el-form-item>
        <el-form-item :label="t.variable.formulaReference">
          <el-select
            :model-value="''"
            :placeholder="t.variable.formulaReference"
            class="s-variable-dialog__short"
            @change="insertReference"
          >
            <el-option v-for="key in referenceKeys" :key="key" :label="key" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t.variable.precision">
          <el-input-number v-model="formulaPrecision" :min="0" :max="10" :controls="false" class="s-variable-dialog__number" />
        </el-form-item>
        <el-form-item :label="t.variable.formulaPreview">
          <span class="s-variable-dialog__note">{{ formulaPreview }}</span>
        </el-form-item>
      </template>

      <template v-else-if="form.type === 'system'">
        <el-form-item :label="t.variable.systemKey">
          <el-select v-model="systemKey" class="s-variable-dialog__type">
            <el-option
              v-for="(label, key) in t.variable.systemKeys"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="systemKey === 'date' || systemKey === 'time'" :label="t.variable.dateFormat">
          <el-input v-model="systemFormat" />
        </el-form-item>
        <el-form-item :label="t.variable.formulaPreview">
          <span class="s-variable-dialog__note">{{ systemPreview }}</span>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button size="small" @click="visible = false">{{ t.common.cancel }}</el-button>
      <el-button size="small" type="primary" @click="submit">{{ t.common.confirm }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * `VariableDialog` — the **design-time** variable editor.
 *
 * ## Why the state is a set of plain refs
 *
 * The legacy dialog kept one `reactive` `attrs` object and merged the previous variable
 * into it with `Object.assign` on every open (defect 27). Two consequences: 插入新变量
 * after a cancel opened pre-filled with the previous variable (and could therefore
 * duplicate its key), and a field the *new* type does not use kept the old type's value —
 * a `boolean` variable carrying a `list`'s payload, which is the model-level defect the
 * discriminated union exists to prevent. `reset()` below assigns **every** field on every
 * open, from the variable being edited or from a factory, and there is no merge anywhere.
 *
 * ## Why the type-specific configuration is a flat form and not a union object
 *
 * Vue's template checker cannot narrow `VariableData` from a separate `type` ref, so a
 * union object would make every binding `T | undefined`. The form holds one ref per
 * configuration field and {@link buildData} assembles the union member on submit — which
 * also makes it impossible to submit a payload whose `type` disagrees with its fields.
 *
 * ## Validation
 *
 * `el-form` with real rules: an empty label or key, a duplicate key and a formula that
 * fails to parse all block submission with a field-level message. The legacy dialog had
 * none (defect 27's sibling): a duplicate key silently produced two variables sharing one
 * value, and a broken formula was only discovered when the document rendered.
 */

import { computed, reactive, ref, watch } from "vue";

import { Bottom, Delete, Plus, Top } from "@element-plus/icons-vue";
import type { FormInstance, FormRules } from "element-plus";

import { evaluateFormula, VARIABLE_TYPES } from "../extensions/variable";
import type {
  InnerVariableNode,
  VariableAttrs,
  VariableData,
  VariableOption,
  VariableType,
  VariableValue,
  SystemVariableKey
} from "../typings/variable";

import { mergeEditorLocale } from "../editor/locale";
import type { EditorLocale } from "../editor/locale";

defineOptions({ name: "VariableDialog" });

const props = withDefaults(
  defineProps<{
    /** Whether the dialog is open. `v-model:open`. */
    open: boolean;

    /** The variable being edited, or `undefined` for a new one. */
    attrs?: VariableAttrs;

    /** The position of the variable being edited, if any. */
    pos?: number;

    /** The caller's `innerVariable` tree, used by the key picker. */
    innerVariable?: readonly InnerVariableNode[];

    /** Variable types hidden from the type picker. */
    exclude?: readonly VariableType[];

    /**
     * Every key already used in the document.
     *
     * The duplicate check needs the document, which this dialog deliberately does not
     * have: a dialog that reads the editor is a dialog that cannot be tested and cannot be
     * reused. The host passes what it knows.
     */
    existingKeys?: readonly string[];

    /** Partial locale overrides. */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    attrs: undefined,
    pos: undefined,
    innerVariable: undefined,
    exclude: undefined,
    existingKeys: undefined,
    locale: undefined
  }
);

const emits = defineEmits<{
  "update:open": [open: boolean];
  /** The user confirmed. `pos` is `undefined` for a new variable. */
  save: [attrs: VariableAttrs, pos: number | undefined];
}>();

const t = computed(() => mergeEditorLocale(props.locale));

const visible = computed({
  get: () => props.open,
  set: (value: boolean) => emits("update:open", value)
});

const isEditing = computed(() => props.pos !== undefined);

// ---------------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------------

/** The fields `el-form` validates. */
interface VariableForm {
  label: string;
  key: string;
  keySource: "manual" | "inner";
  desc: string;
  type: VariableType;
}

const formRef = ref<FormInstance>();

const form = reactive<VariableForm>({
  label: "",
  key: "",
  keySource: "manual",
  desc: "",
  type: "text"
});

const cascaderPath = ref<Array<string | number>>([]);

/** The EP cascader field mapping, from the model's own `InnerVariableNode` shape. */
const cascaderProps = { label: "label", value: "key", children: "children", checkStrictly: true, emitPath: true };

const innerOptions = computed<readonly InnerVariableNode[]>(() => props.innerVariable ?? []);

/**
 * The cascader options.
 *
 * `InnerVariableNode` is exactly what `el-cascader` wants (`label`/`key`/`children`), but
 * the value field is `key` and EP's default is `value`, so the mapping above is required
 * rather than cosmetic.
 */
const cascaderOptions = computed(() => innerOptions.value as unknown as Array<Record<string, unknown>>);

/** Types the caller allows, in the model's own picker order. */
const allowedTypes = computed<readonly VariableType[]>(() => {
  const excluded = new Set(props.exclude ?? []);
  return VARIABLE_TYPES.filter((type) => !excluded.has(type));
});

function typeLabel(type: VariableType): string {
  return t.value.variable.typeOptions[type] ?? type;
}

// Per-type configuration, one ref each. See the module comment for why.
const defaultText = ref("");
const defaultNumber = ref("0");
const defaultBoolean = ref(false);

const textMaxLength = ref<number | undefined>(undefined);
const textPlaceholder = ref("");

const numberPrecision = ref<number | undefined>(undefined);
const numberThousands = ref(false);
const numberMin = ref<number | undefined>(undefined);
const numberMax = ref<number | undefined>(undefined);

const moneyPrecision = ref(2);
const moneyCurrency = ref("￥");
const moneyThousands = ref(true);
const moneyChineseUppercase = ref(false);

const booleanTrueText = ref("是");
const booleanFalseText = ref("否");

const dateFormat = ref("YYYY年MM月DD日");
const dateResolveToday = ref(true);

const selectOptions = ref<VariableOption[]>([]);
const selectMultiple = ref(false);
const selectJoinWith = ref("、");

const imageSource = ref<"upload" | "signature">("upload");
const imageAccept = ref("image/*");
const imageMaxSizeMb = ref(2);
const imageWidth = ref("");

const formulaExpression = ref("");
const formulaPrecision = ref<number | undefined>(undefined);
const formulaPrefix = ref("");
const formulaSuffix = ref("");

const systemKey = ref<SystemVariableKey>("page");
const systemFormat = ref("");

/** The keys a formula may reference: every other variable in the document. */
const referenceKeys = computed(() =>
  (props.existingKeys ?? []).filter((key) => key !== form.key).sort()
);

/**
 * Reset **every** field.
 *
 * The explicit, exhaustive reset is the fix for defect 27: there is no `Object.assign`
 * and no field that survives from the previous open, so opening the dialog for a new
 * variable after editing one cannot pre-fill or duplicate its key.
 */
function reset(): void {
  const editing = props.attrs;

  form.label = editing?.label ?? "";
  form.key = editing?.key ?? "";
  form.keySource = editing?.keySource === "inner" ? "inner" : "manual";
  form.desc = editing?.desc ?? "";
  form.type = editing?.data.type ?? "text";
  cascaderPath.value = [];

  defaultText.value = "";
  defaultNumber.value = "0";
  defaultBoolean.value = false;

  textMaxLength.value = undefined;
  textPlaceholder.value = "";

  numberPrecision.value = undefined;
  numberThousands.value = false;
  numberMin.value = undefined;
  numberMax.value = undefined;

  moneyPrecision.value = 2;
  moneyCurrency.value = "￥";
  moneyThousands.value = true;
  moneyChineseUppercase.value = false;

  booleanTrueText.value = "是";
  booleanFalseText.value = "否";

  dateFormat.value = "YYYY年MM月DD日";
  dateResolveToday.value = true;

  selectOptions.value = [];
  selectMultiple.value = false;
  selectJoinWith.value = "、";

  imageSource.value = "upload";
  imageAccept.value = "image/*";
  imageMaxSizeMb.value = 2;
  imageWidth.value = "";

  formulaExpression.value = "";
  formulaPrecision.value = undefined;
  formulaPrefix.value = "";
  formulaSuffix.value = "";

  systemKey.value = "page";
  systemFormat.value = "";

  applyData(editing?.data);
  applyDefault(editing?.defaultValue);

  // Clear the previous variable's validation state, or a field the new variable fills
  // correctly would still be painted red from the last open.
  formRef.value?.clearValidate();
}

/** Copy a stored configuration into the flat form. */
function applyData(data: VariableData | undefined): void {
  if (!data) return;

  switch (data.type) {
    case "text":
      textMaxLength.value = data.maxLength;
      textPlaceholder.value = data.placeholder ?? "";
      break;
    case "number":
      numberPrecision.value = data.precision;
      numberThousands.value = data.thousands === true;
      numberMin.value = data.min;
      numberMax.value = data.max;
      break;
    case "money":
      moneyPrecision.value = data.precision ?? 2;
      moneyCurrency.value = data.currency ?? "￥";
      moneyThousands.value = data.thousands !== false;
      moneyChineseUppercase.value = data.chineseUppercase === true;
      break;
    case "boolean":
      booleanTrueText.value = data.trueText ?? "是";
      booleanFalseText.value = data.falseText ?? "否";
      break;
    case "date":
      dateFormat.value = data.format ?? "YYYY年MM月DD日";
      dateResolveToday.value = data.resolveToday !== false;
      break;
    case "select":
      selectOptions.value = data.options.map((option) => ({ ...option }));
      selectMultiple.value = data.multiple === true;
      selectJoinWith.value = data.joinWith ?? "、";
      break;
    case "image":
      imageSource.value = data.source === "signature" ? "signature" : "upload";
      imageAccept.value = data.accept ?? "image/*";
      imageMaxSizeMb.value = data.maxSizeMb ?? 2;
      imageWidth.value = data.width ?? "";
      break;
    case "formula":
      formulaExpression.value = data.expression;
      formulaPrecision.value = data.precision;
      formulaPrefix.value = data.prefix ?? "";
      formulaSuffix.value = data.suffix ?? "";
      break;
    case "system":
      systemKey.value = data.systemKey;
      systemFormat.value = data.format ?? "";
      break;
  }
}

/** Copy a stored default value into whichever widget its type uses. */
function applyDefault(value: VariableValue): void {
  if (value === undefined || value === null) return;
  if (typeof value === "boolean") defaultBoolean.value = value;
  else if (typeof value === "number") defaultNumber.value = String(value);
  else defaultText.value = value;
}

/** Assemble the discriminated union from the form. */
function buildData(): VariableData {
  switch (form.type) {
    case "text":
      return { type: "text", placeholder: textPlaceholder.value || undefined, maxLength: textMaxLength.value };
    case "number":
      return {
        type: "number",
        precision: numberPrecision.value,
        thousands: numberThousands.value,
        min: numberMin.value,
        max: numberMax.value
      };
    case "money":
      return {
        type: "money",
        precision: moneyPrecision.value,
        currency: moneyCurrency.value,
        thousands: moneyThousands.value,
        chineseUppercase: moneyChineseUppercase.value
      };
    case "boolean":
      return { type: "boolean", trueText: booleanTrueText.value, falseText: booleanFalseText.value };
    case "date":
      return { type: "date", format: dateFormat.value, resolveToday: dateResolveToday.value };
    case "select":
      return {
        type: "select",
        options: selectOptions.value.map((option) => ({ ...option })),
        multiple: selectMultiple.value,
        joinWith: selectJoinWith.value
      };
    case "image":
      return {
        type: "image",
        source: imageSource.value,
        accept: imageAccept.value,
        maxSizeMb: imageMaxSizeMb.value,
        width: imageWidth.value || undefined
      };
    case "formula":
      return {
        type: "formula",
        expression: formulaExpression.value,
        precision: formulaPrecision.value,
        prefix: formulaPrefix.value || undefined,
        suffix: formulaSuffix.value || undefined
      };
    case "system":
      return { type: "system", systemKey: systemKey.value, format: systemFormat.value || undefined };
  }
}

/** The default value, in the shape its type uses. */
function buildDefault(): VariableValue {
  switch (form.type) {
    case "number":
    case "money":
    case "formula":
    case "system": {
      const parsed = Number(defaultNumber.value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "boolean":
      return defaultBoolean.value;
    default:
      return defaultText.value === "" ? undefined : defaultText.value;
  }
}

/**
 * A live preview of the formula's numeric result.
 *
 * `evaluateFormula` is the same evaluator the document uses, with every reference
 * resolving to `0`, so the preview shows the *shape* of the result and the syntax errors
 * the validator will also catch.
 */
const formulaPreview = computed(() => {
  const result = evaluateFormula({ type: "formula", expression: formulaExpression.value }, () => 0);
  if (!result.ok) return t.value.variable.errorFormula;
  const digits = formulaPrecision.value;
  const rounded = digits === undefined ? result.value : Number(result.value.toFixed(digits));
  return `${formulaPrefix.value}${rounded}${formulaSuffix.value}`;
});

/** A human-readable preview of a system variable, without needing a page. */
const systemPreview = computed(() => {
  switch (systemKey.value) {
    case "page":
      return "1";
    case "total":
      return "1";
    case "pageLabel":
      return "第 1 页";
    case "pageOfTotal":
      return "第 1 页，共 1 页";
    case "date":
      return systemFormat.value === "" ? "2024年01月01日" : systemFormat.value;
    case "time":
      return systemFormat.value === "" ? "00:00:00" : systemFormat.value;
  }
});

// ---------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------

/** `true` when the key is already used by a *different* variable. */
function isDuplicateKey(key: string): boolean {
  if (key === "" ) return false;
  const keys = props.existingKeys ?? [];
  if (!isEditing.value) return keys.includes(key);
  // When editing, the variable's own key is not a duplicate of itself. A repeated key is
  // legal in a document (a contract repeats `{甲方}`), which is why only *other*
  // variables count.
  const others = keys.filter((candidate) => candidate !== props.attrs?.key);
  return others.includes(key);
}

const rules = computed<FormRules>(() => ({
  label: [{ required: true, message: t.value.variable.errorLabel, trigger: "blur" }],
  key: [
    { required: true, message: t.value.variable.errorKey, trigger: "blur" },
    {
      validator: (
        _rule: unknown,
        value: unknown,
        callback: (error?: string | Error) => void
      ): void => {
        if (isDuplicateKey(String(value ?? ""))) callback(new Error(t.value.variable.errorDuplicateKey));
        else callback();
      },
      trigger: "blur"
    }
  ]
}));

/**
 * The two errors that are not `el-form` rules.
 *
 * A formula's syntax and a select's option list are validated by the *model*, not by
 * async-validator, so they are rendered through `el-form-item`'s `error` prop — which
 * still puts the message on the field the user has to fix rather than in a toast. They are
 * cleared as soon as the offending input changes.
 */
const formulaError = ref("");
const optionsError = ref("");

watch(formulaExpression, () => {
  formulaError.value = "";
});

watch(
  selectOptions,
  () => {
    optionsError.value = "";
  },
  { deep: true }
);

// ---------------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------------

/** Build the configuration a type starts from, so a switch never carries the old payload. */
function onTypeChange(type: VariableType): void {
  // Reset only the type-specific configuration: the label, key and description are the
  // user's and must survive a type change.
  const defaults: Record<string, () => void> = {
    text: () => {
      textMaxLength.value = undefined;
      textPlaceholder.value = "";
    },
    number: () => {
      numberPrecision.value = undefined;
      numberThousands.value = false;
      numberMin.value = undefined;
      numberMax.value = undefined;
      defaultNumber.value = "0";
    },
    money: () => {
      moneyPrecision.value = 2;
      moneyCurrency.value = "￥";
      moneyThousands.value = true;
      moneyChineseUppercase.value = false;
      defaultNumber.value = "0";
    },
    boolean: () => {
      booleanTrueText.value = "是";
      booleanFalseText.value = "否";
      defaultBoolean.value = false;
    },
    date: () => {
      dateFormat.value = "YYYY年MM月DD日";
      dateResolveToday.value = true;
    },
    select: () => {
      // A select with no options falls back to free text in the fill dialog, so it starts
      // with one empty row rather than an empty list.
      selectOptions.value = [{ label: "", value: "" }];
      selectMultiple.value = false;
      selectJoinWith.value = "、";
    },
    image: () => {
      imageSource.value = "upload";
      imageAccept.value = "image/*";
      imageMaxSizeMb.value = 2;
      imageWidth.value = "";
    },
    formula: () => {
      formulaExpression.value = "";
      formulaPrecision.value = undefined;
    },
    system: () => {
      systemKey.value = "page";
      systemFormat.value = "";
    }
  };

  defaults[type]?.();
  formRef.value?.clearValidate(["formula"]);
}

/** The inner-variable picker's change handler: the path *is* the key. */
function onInnerPicked(value: unknown): void {
  const path = Array.isArray(value) ? value : [];
  const key = path.map((segment) => String(segment)).join(".");
  if (key === "") return;
  form.key = key;

  // The leaf's label becomes the variable's label and description, which is what the
  // legacy cascade did — but only on a real pick, not on every render.
  const leaf = path[path.length - 1];
  const found = findInnerNode(innerOptions.value, String(leaf));
  if (found) {
    if (form.label === "") form.label = found.label;
    if (form.desc === "") form.desc = found.label;
  }
}

/** Depth-first search of the `innerVariable` tree by key. */
function findInnerNode(nodes: readonly InnerVariableNode[], key: string): InnerVariableNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    const child = node.children ? findInnerNode(node.children, key) : undefined;
    if (child) return child;
  }
  return undefined;
}

function addOption(): void {
  selectOptions.value.push({ label: "", value: "" });
}

function removeOption(index: number): void {
  selectOptions.value.splice(index, 1);
}

/** Reorder, so the option list's order is the author's and not the insertion order. */
function moveOption(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= selectOptions.value.length) return;
  const [moved] = selectOptions.value.splice(index, 1);
  if (moved) selectOptions.value.splice(target, 0, moved);
}

/** Append a variable reference to the formula expression. */
function insertReference(key: string): void {
  formulaExpression.value = formulaExpression.value === "" ? key : `${formulaExpression.value} ${key}`;
}

/** Confirm, validate, and hand the attributes to the host. */
async function submit(): Promise<void> {
  formulaError.value = "";
  optionsError.value = "";

  const valid = await formRef.value?.validate().catch(() => false);
  if (valid !== true) return;

  if (form.type === "formula") {
    const parsed = evaluateFormula({ type: "formula", expression: formulaExpression.value }, () => 0);
    if (!parsed.ok && parsed.error.code === "syntax") {
      // The message is attached to the expression field, not raised as a toast: the user
      // has to fix that input, and it must be obvious which one.
      formulaError.value = t.value.variable.errorFormula;
      return;
    }
  }

  if (form.type === "select") {
    const usable = selectOptions.value.filter(
      (option) => option.label.trim() !== "" || String(option.value).trim() !== ""
    );
    if (usable.length === 0 && selectOptions.value.length > 0) {
      optionsError.value = t.value.variable.errorOptions;
      return;
    }
    selectOptions.value = usable;
  }

  emits(
    "save",
    {
      label: form.label,
      key: form.key,
      desc: form.desc === "" ? undefined : form.desc,
      defaultValue: buildDefault(),
      data: buildData(),
      keySource: form.keySource
    },
    props.pos
  );

  visible.value = false;
}

// Every open resets the whole form. `immediate` so the first open is initialised too.
watch(
  () => props.open,
  (open) => {
    if (open) reset();
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.s-variable-dialog {
  &__type {
    width: 200px;
  }

  &__short {
    width: 140px;
  }

  &__number {
    width: 110px;
  }

  &__key {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  &__note {
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }

  &__options {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  &__option {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto auto auto;
    gap: 4px;
    align-items: center;
  }
}
</style>
