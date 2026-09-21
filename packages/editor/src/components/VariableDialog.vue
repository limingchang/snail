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
              <!--
                An option's `value` may be a string, a number or a boolean, and a text field can
                only produce text — so it is read as text and written back as text. That is what the
                untyped global component used to do silently; importing `ElInput` locally is what
                made the mismatch visible.
              -->
              <el-input
                :model-value="String(option.value ?? '')"
                :placeholder="t.variable.optionValue"
                @update:model-value="(value: string) => (option.value = value)"
              />
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
 * `VariableDialog` —— **设计期**的变量编辑器。
 *
 * ## 为什么状态是一组普通 ref
 *
 * 旧版对话框保存一个 `reactive` 的 `attrs` 对象，每次打开都用 `Object.assign` 把上一个变量
 * 合并进去（缺陷 27）。两个后果：取消之后再点「插入新变量」会带着上一个变量预填打开（因此
 * 可能重复它的 key），而*新*类型用不到的字段会留着旧类型的值 —— 一个 `boolean` 变量带着
 * `list` 的载荷，这正是判别联合要防住的模型层缺陷。下面的 `reset()` 每次打开都赋值**每一个**
 * 字段，值来自正在编辑的变量或工厂，全程没有任何合并。
 *
 * ## 为什么按类型区分的配置是扁平表单而不是联合对象
 *
 * Vue 的模板检查器无法依据单独的 `type` ref 收窄 `VariableData`，所以用联合对象会让每个绑定
 * 都变成 `T | undefined`。表单为每个配置字段各持一个 ref，由 {@link buildData} 在提交时组装
 * 出联合成员 —— 这也让提交一份 `type` 与字段互相矛盾的载荷变得不可能。
 *
 * ## 校验
 *
 * 用带真实规则的 `el-form`：标签或 key 为空、key 重复、公式解析失败，都会以字段级消息阻止
 * 提交。旧版对话框什么都没有（缺陷 27 的同类问题）：重复的 key 会悄悄产生两个共用同一个值的
 * 变量，而坏掉的公式只有在文档渲染时才被发现。
 *
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
import { ElDialog, ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElRadioGroup, ElRadio, ElCascader, ElSwitch, ElInputNumber, ElButton, ElIcon } from "element-plus";

defineOptions({ name: "VariableDialog" });

const props = withDefaults(
  defineProps<{
    /** 对话框是否打开。`v-model:open`。 / Whether the dialog is open. `v-model:open`. */
    open: boolean;

    /**
     * 正在编辑的变量，新建时为 `undefined`。
     *
     * The variable being edited, or `undefined` for a new one.
     */
    attrs?: VariableAttrs;

    /**
     * 正在编辑的变量所在的位置（如果有）。
     *
     * The position of the variable being edited, if any.
     */
    pos?: number;

    /**
     * 调用方传入的 `innerVariable` 树，供 key 选择器使用。
     *
     * The caller's `innerVariable` tree, used by the key picker.
     */
    innerVariable?: readonly InnerVariableNode[];

    /** 从类型选择器中隐藏的变量类型。 / Variable types hidden from the type picker. */
    exclude?: readonly VariableType[];

    /**
     * 文档里已经用过的所有 key。
     *
     * 重复检查需要文档，而本对话框刻意不持有它：一个会去读编辑器的对话框，就是一个无法测试、
     * 无法复用的对话框。宿主把自己知道的东西传进来。
     *
     * Every key already used in the document.
     *
     * The duplicate check needs the document, which this dialog deliberately does not
     * have: a dialog that reads the editor is a dialog that cannot be tested and cannot be
     * reused. The host passes what it knows.
     */
    existingKeys?: readonly string[];

    /** 部分语言覆盖。 / Partial locale overrides. */
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
  /** 对话框是否打开，`v-model:open`。 / Whether the dialog is open, `v-model:open`. */
  "update:open": [open: boolean];
  /**
   * 用户已确认。新建变量时 `pos` 为 `undefined`。
   *
   * The user confirmed. `pos` is `undefined` for a new variable.
   */
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

/** `el-form` 校验的字段。 / The fields `el-form` validates. */
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

/**
 * EP 级联选择器的字段映射，取自模型自己的 `InnerVariableNode` 形状。
 *
 * The EP cascader field mapping, from the model's own `InnerVariableNode` shape.
 */
const cascaderProps = { label: "label", value: "key", children: "children", checkStrictly: true, emitPath: true };

const innerOptions = computed<readonly InnerVariableNode[]>(() => props.innerVariable ?? []);

/**
 * 级联选择器的选项。
 *
 * `InnerVariableNode` 正是 `el-cascader` 想要的形状（`label`/`key`/`children`），但值字段是
 * `key` 而 EP 的默认是 `value`，所以上面的映射是必需的，不是装饰性的。
 *
 * The cascader options.
 *
 * `InnerVariableNode` is exactly what `el-cascader` wants (`label`/`key`/`children`), but
 * the value field is `key` and EP's default is `value`, so the mapping above is required
 * rather than cosmetic.
 */
const cascaderOptions = computed(() => innerOptions.value as unknown as Array<Record<string, unknown>>);

/**
 * 调用方允许的类型，按模型自己的选择器顺序。
 *
 * Types the caller allows, in the model's own picker order.
 */
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

/**
 * 公式可以引用的 key：文档里其他每一个变量。
 *
 * The keys a formula may reference: every other variable in the document.
 */
const referenceKeys = computed(() =>
  (props.existingKeys ?? []).filter((key) => key !== form.key).sort()
);

/**
 * 重置**每一个**字段。
 *
 * 这种显式而详尽的重置就是缺陷 27 的修复：既没有 `Object.assign`，也没有任何字段能从上次打开
 * 存活下来，所以编辑完一个变量之后再为新变量打开对话框，既不会预填也不会重复它的 key。
 *
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

/** 把存下来的配置复制进扁平表单。 / Copy a stored configuration into the flat form. */
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

/**
 * 把存下来的默认值复制进它所属类型使用的那个控件。
 *
 * Copy a stored default value into whichever widget its type uses.
 */
function applyDefault(value: VariableValue): void {
  if (value === undefined || value === null) return;
  if (typeof value === "boolean") defaultBoolean.value = value;
  else if (typeof value === "number") defaultNumber.value = String(value);
  else defaultText.value = value;
}

/** 根据表单组装出判别联合。 / Assemble the discriminated union from the form. */
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

/** 默认值，采用其类型使用的形状。 / The default value, in the shape its type uses. */
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
 * 公式数值结果的实时预览。
 *
 * `evaluateFormula` 就是文档所用的同一个求值器，其中每个引用都解析为 `0`，所以预览展示的是
 * 结果的*形状*，以及校验器同样会抓到的语法错误。
 *
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

/**
 * 系统变量的可读预览，不需要有页面。
 *
 * A human-readable preview of a system variable, without needing a page.
 */
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

/**
 * 该 key 已被*另一个*变量使用时为 `true`。
 *
 * `true` when the key is already used by a *different* variable.
 */
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
 * 两个不属于 `el-form` 规则的错误。
 *
 * 公式的语法和下拉的选项列表由*模型*校验，而不是 async-validator，所以它们通过
 * `el-form-item` 的 `error` prop 渲染 —— 这样消息仍然落在用户必须修改的那个字段上，而不是
 * 出现在提示条里。一旦有问题的输入发生变化，它们立即清空。
 *
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

/**
 * 构造某个类型起步时的配置，这样切换类型绝不会带上旧载荷。
 *
 * Build the configuration a type starts from, so a switch never carries the old payload.
 */
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

/**
 * 内置变量选择器的变更处理函数：路径*就是* key。
 *
 * The inner-variable picker's change handler: the path *is* the key.
 */
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

/**
 * 按 key 对 `innerVariable` 树做深度优先查找。
 *
 * Depth-first search of the `innerVariable` tree by key.
 */
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

/**
 * 重新排序，让选项列表的顺序属于作者，而不是插入顺序。
 *
 * Reorder, so the option list's order is the author's and not the insertion order.
 */
function moveOption(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= selectOptions.value.length) return;
  const [moved] = selectOptions.value.splice(index, 1);
  if (moved) selectOptions.value.splice(target, 0, moved);
}

/**
 * 把一个变量引用追加到公式表达式上。
 *
 * Append a variable reference to the formula expression.
 */
function insertReference(key: string): void {
  formulaExpression.value = formulaExpression.value === "" ? key : `${formulaExpression.value} ${key}`;
}

/** 确认、校验，然后把属性交给宿主。 / Confirm, validate, and hand the attributes to the host. */
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
