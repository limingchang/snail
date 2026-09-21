<template>
  <section class="s-template-picker" :aria-busy="loading ? 'true' : undefined">
    <h3 class="s-template-picker__title">{{ t.template.title }}</h3>

    <el-skeleton v-if="loading" :rows="3" animated />

    <el-alert
      v-else-if="error"
      class="s-template-picker__error"
      type="error"
      :title="error"
      :closable="false"
      show-icon
    >
      <el-button size="small" type="primary" plain @click="retry">{{ t.retry }}</el-button>
    </el-alert>

    <template v-else>
      <!--
        A radio group rather than a list of clickable rows: the choice *is* a selection,
        so the browser's own arrow-key navigation and the group's single-tab-stop
        behaviour come for free, and assistive technology announces how many options
        there are.
      -->
      <el-radio-group
        v-if="items.length > 0"
        class="s-template-picker__list"
        :model-value="selected"
        @change="onSelect"
      >
        <el-radio v-for="item in items" :key="item.id" :value="item.id" class="s-template-picker__item">
          <span class="s-template-picker__label">
            <span class="s-template-picker__name">{{ item.name }}</span>
            <span v-if="item.description" class="s-template-picker__description">{{ item.description }}</span>
            <!-- Shown as-is: `TemplateListItem.updatedAt` is documented as an opaque
                 string, and reformatting it would need a locale this panel does not own. -->
            <span v-if="item.updatedAt" class="s-template-picker__updated">{{ item.updatedAt }}</span>
          </span>
        </el-radio>
      </el-radio-group>

      <el-empty v-else :description="t.noTemplates" :image-size="60" />

      <!--
        Manual mode only, and **absent** in `auto` mode rather than merely disabled: the
        auto policy means the host already rendered the first entry, so a second 载入
        button would offer to load something the operator never chose — which is the
        behaviour the manual policy exists to prevent.
      -->
      <div v-if="load === 'manual'" class="s-template-picker__footer">
        <p class="s-template-picker__hint">{{ t.template.manualHint }}</p>
        <el-button type="primary" size="small" :disabled="selected === ''" @click="onLoad">
          <SIcon :icon="IconCloudDownload" />
          <span>{{ t.load }}</span>
        </el-button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCloudDownload, SIcon } from "@snail-js/vue";

import { mergeEditorLocale } from "../editor/locale";
import type { EditorLocale } from "../editor/locale";
import type { TemplateListItem } from "../typings/editor";
import { ElSkeleton, ElAlert, ElButton, ElRadioGroup, ElRadio, ElEmpty } from "element-plus";

/**
 * `TemplatePicker` —— 模板列表，设计模式与填充模式共用。
 *
 * ## 为什么这个组件什么都不拉取
 *
 * 它渲染列表、错误和策略；它自己不发起任何请求。该调哪个 URL、该发哪个请求头、拿到结果后
 * 怎么办，都是宿主的事（`editor/template.ts` 已经以纯函数的形式负责那部分，`SEditor.vue`
 * 负责接线）。一个挂载即拉取的组件无法在没有网络的情况下做单元测试，而且 —— 更要紧的是 ——
 * 它会渲染出一个操作员从未挑选过的模板。
 *
 * ## `load` 策略是产品规则，不是样式选择
 *
 * `"manual"` 是默认值，也是填充模式的策略：打印操作员挑一个模板然后按「载入」。在这种模式下
 * 载入按钮渲染在列表之后。而在 `"auto"` 模式下，宿主已经渲染了第一条，所以按钮根本不该存在
 * —— 放在同一位置的禁用按钮会被读成「这里坏了」。
 *
 * ## 为什么选中项是对 prop 的计算属性
 *
 * `modelValue` 才是事实来源，所以挂载之后改动它的宿主能让单选按钮跟着动。旧版组件在创建时
 * 就把自己的模式和文档冻结了（缺陷 38，`editable: props.design` 且没有 `watch`），此后每一次
 * prop 变化都不可见。
 *
 * `TemplatePicker` — the template list, shared by design and fill mode.
 *
 * ## Why this component fetches nothing
 *
 * It renders a list, a failure and a policy; it does not request anything. Which URL to
 * call, which header to send and what to do with the result are the host's business
 * (`editor/template.ts` already owns that, as pure functions, and `SEditor.vue` owns the
 * wiring). A picker that fetched on mount could not be unit-tested without a network, and
 * — more importantly — it would render a template the operator never picked.
 *
 * ## The `load` policy is a product rule, not a styling choice
 *
 * `"manual"` is the default and the fill-mode policy: a print operator chooses a
 * template and presses 载入. In that mode the load button is rendered after the list. In
 * `"auto"` mode the host has already rendered the first entry, so the button must not
 * exist at all — a disabled button in the same place would read as "this is broken".
 *
 * ## Why the selection is a computed over the prop
 *
 * `modelValue` is the source of truth, so a host that changes it after mount moves the
 * radio. The legacy component froze its mode and its document at creation (defect 38,
 * `editable: props.design` with no `watch`), and every later prop change was invisible.
 */
defineOptions({ name: "TemplatePicker" });

const props = withDefaults(
  defineProps<{
    /**
     * 可供选择的条目。`[]` 是合法的空列表。
     *
     * The entries to choose from. `[]` is a valid, empty list.
     */
    items?: TemplateListItem[];

    /** 列表正在被拉取。 / The list is being fetched. */
    loading?: boolean;

    /** 要展示的错误，已由宿主本地化。 / A failure to show, already localised by the host. */
    error?: string;

    /**
     * 宿主是自己载入条目，还是等用户按「载入」。默认 `"manual"`。
     *
     * Whether the host loads an entry by itself or waits for 载入. Default `"manual"`.
     */
    load?: "auto" | "manual";

    /** 选中条目的 id。 / The selected entry's id. */
    modelValue?: string;

    /**
     * 部分语言覆盖，合并到中文默认值之上。
     *
     * Partial locale override, merged over the Chinese defaults.
     */
    locale?: Partial<EditorLocale>;
  }>(),
  {
    items: () => [],
    loading: false,
    error: "",
    load: "manual",
    modelValue: "",
    locale: undefined
  }
);

const emit = defineEmits<{
  /** 被选中的条目，供 `v-model` 使用。 / The chosen entry, for `v-model`. */
  "update:modelValue": [id: string];

  /**
   * 用户按下了「载入」；宿主会拉取并渲染 `modelValue`。
   *
   * 载入 was pressed; the host fetches and renders `modelValue`.
   */
  load: [id: string];

  /** 失败应当重试。 / The failure should be retried. */
  retry: [];

  /**
   * 选择了另一个条目。与 `update:modelValue` 重复是故意的：不绑定模型的宿主仍然能听到这次
   * 点击。
   *
   * A different entry was chosen. Redundant with `update:modelValue` on purpose: a host
   * that does not bind the model still hears about the click.
   */
  select: [id: string];
}>();

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * 被勾选的条目。
 *
 * 它是对 prop 的计算属性，而不是本地状态，并且这一组用的是 `:model-value` 而不是 `v-model`：
 * 本面板不能拥有选中状态，否则在挂载之后改动 `modelValue` 的宿主（新列表到达、在别处选中了
 * 模板）无法移动单选按钮。选中改为发出两个事件 —— 见 {@link onSelect}。
 *
 * The checked entry.
 *
 * A computed over the prop rather than local state, and the group is bound with
 * `:model-value` rather than `v-model`: this panel must not own the selection, or a host
 * that changes `modelValue` after mount (a new list arriving, a template chosen
 * elsewhere) would not move the radio. Selecting emits both events instead — see
 * {@link onSelect}.
 */
const selected = computed(() => props.modelValue);

/**
 * 上报用户挑选的条目。
 *
 * 载荷是从 `unknown` 收窄来的，而不是标注成 Element Plus 自己的 `RadioGroupValue`：单选按钮的
 * `value` 类型很松（`string | number | boolean | undefined`），而模板 id 永远是
 * `TemplateListItem.id` 声明的那种字符串。收窄意味着意外形状会被忽略，而不是被字符串化后写进
 * 模型。
 *
 * Report the entry the user picked.
 *
 * The payload is narrowed from `unknown` rather than annotated with Element Plus's own
 * `RadioGroupValue`: a radio's `value` is typed loosely (`string | number | boolean |
 * undefined`), while a template id is always the string `TemplateListItem.id` declares.
 * Narrowing means an unexpected shape is ignored instead of being stringified into the
 * model.
 */
function onSelect(value: unknown): void {
  if (typeof value !== "string" && typeof value !== "number") return;

  const id = String(value);
  if (id === props.modelValue) return;

  emit("update:modelValue", id);
  emit("select", id);
}

function retry(): void {
  emit("retry");
}

/** 请宿主载入当前选中的东西。 / Ask the host to load whatever is currently selected. */
function onLoad(): void {
  if (props.modelValue === "") return;
  emit("load", props.modelValue);
}
</script>

<style scoped lang="scss">
.s-template-picker {
  display: flex;
  flex-direction: column;
  gap: var(--se-page-gap, 8px);
  min-width: 240px;

  &__title {
    margin: 0;
    color: var(--se-color-text, #333333);
    font-size: 14px;
    font-weight: 600;
  }

  &__error {
    // The alert's description slot is a block; the retry button stays at its start
    // rather than stretching the width of the alert.
    :deep(.el-alert__description) {
      display: flex;
      justify-content: flex-start;
      margin-top: 4px;
    }
  }

  // `el-radio-group` is an inline row by default, which wraps a two-line entry into an
  // unreadable strip; the list wants one entry per line.
  &__list {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    width: 100%;
  }

  &__item {
    // `el-radio` is sized for a one-line label; an entry with a description is taller,
    // and the radio dot must stay on the first line rather than float in the middle.
    align-items: flex-start;
    height: auto;
    margin-right: 0;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: var(--se-toolbar-radius, 8px);

    &:hover {
      border-color: var(--se-color-toolbar-border, #e0e0e0);
    }

    // The label wraps onto its own line so the name, the description and the timestamp
    // stack instead of running together.
    :deep(.el-radio__label) {
      display: block;
      white-space: normal;
    }
  }

  &__label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.4;
  }

  &__name {
    color: var(--se-color-text, #333333);
  }

  &__description,
  &__updated,
  &__hint {
    color: var(--se-color-text-secondary, #666666);
    font-size: 12px;
  }

  &__hint {
    margin: 0;
    line-height: 1.5;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--se-page-gap, 8px);

    // The button never shrinks while the hint wraps: it is the primary action here.
    :deep(.el-button) {
      flex: none;
    }

    // `SIcon` renders an `<i class="s-icon">`, not an `.el-icon`, so Element Plus's own
    // icon-to-label spacing rule does not reach it.
    :deep(.s-icon) {
      margin-right: 4px;
    }
  }
}
</style>
