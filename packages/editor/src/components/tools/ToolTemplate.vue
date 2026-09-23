<template>
  <div class="s-tool-template">
    <template v-if="design">
      <div class="s-tool-template__bar">
        <el-button size="small" type="primary" :disabled="!listSource || loading" @click="emits('refresh')">
          <el-icon><Refresh /></el-icon>
          <span class="s-tool-template__label">{{ t.template.load }}</span>
        </el-button>
        <el-button size="small" @click="emits('create')">
          <el-icon><DocumentAdd /></el-icon>
          <span class="s-tool-template__label">{{ t.template.create }}</span>
        </el-button>
      </div>

      <TemplatePicker
        v-if="listSource"
        :items="items"
        :loading="loading"
        :error="error"
        :load="policy"
        :model-value="selected"
        :locale="locale"
        @update:model-value="(id: string) => emits('select', id)"
        @load="(id: string) => emits('load', id)"
        @retry="emits('retry')"
      />

      <!-- No list is configured: say so rather than showing an empty picker, which reads as a
           request that failed. 新建 still works — a template can be authored from scratch. -->
      <p v-else class="s-tool-template__hint">{{ t.template.noSource }}</p>
    </template>

    <template v-else>
      <div class="s-tool-template__bar">
        <el-button size="small" type="primary" @click="emits('pick-local')">
          <el-icon><FolderOpened /></el-icon>
          <span class="s-tool-template__label">{{ t.template.pickLocal }}</span>
        </el-button>
      </div>
      <p class="s-tool-template__hint">{{ t.template.localHint }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolTemplate` —— 「模板」区块。
 *
 * ## 两个模式，两件事
 *
 * 设计模式关心的是「从哪一份模板开始」：拉取远程列表、选中一份载入、或者新建一份。填写模式
 * 关心的是「打印哪一份」：远程模板地址已经由 prop 配好时这个区块根本不显示（宿主负责隐藏），
 * 没有配时这里提供一个「加载本地模板」的按钮 —— 也就是把本机保存下来的那份模板载回来。
 *
 * ## 它不自己取数据
 *
 * 拉取、解析、渲染、错误本地化全都留在 `SEditor`（以及 `editor/template.ts`）里：这个面板只
 * 发事件。同一个列表在工作区里不可能有第二份状态，因此也就不可能与它不一致。
 *
 * `ToolTemplate` — the 模板 section.
 *
 * ## Two modes, two jobs
 *
 * Design mode is about *where to start*: fetch the remote list, load one entry, or begin a new
 * template. Fill mode is about *which one to print*: when a remote template URL is configured the
 * section is not shown at all (the host hides it), and without one this offers a
 * 「加载本地模板」 button — loading the template saved on this machine.
 *
 * ## It fetches nothing itself
 *
 * Fetching, parsing, rendering and error localisation all stay in `SEditor` (and
 * `editor/template.ts`): this panel only emits. There cannot be a second copy of the list to fall
 * out of step with.
 */

import { computed } from "vue";

import { DocumentAdd, FolderOpened, Refresh } from "@element-plus/icons-vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import type { TemplateListItem } from "../../typings/editor";
import TemplatePicker from "../TemplatePicker.vue";
import { ElButton, ElIcon } from "element-plus";

defineOptions({ name: "ToolTemplate" });

const props = withDefaults(
  defineProps<
    ToolProps & {
      /** 列表里的条目。 / The entries in the list. */
      items?: TemplateListItem[];
      /** 列表正在被拉取。 / Whether the list is being fetched. */
      loading?: boolean;
      /** 列表的失败文案，已由宿主本地化。 / The list's failure text, localised by the host. */
      error?: string;
      /** 条目由宿主自动载入还是等用户按「载入」。 / Whether the host loads an entry by itself. */
      policy?: "auto" | "manual";
      /** 当前选中的条目 id。 / The selected entry's id. */
      selected?: string;
      /** 设计模式显示列表与新建；填写模式只显示本地载入。 / Design shows the list. */
      design?: boolean;
      /** 是否配置了远程模板列表。没有时只显示「新建模板」。 / Whether a remote list is configured. */
      listSource?: boolean;
    }
  >(),
  {
    editor: undefined,
    locale: undefined,
    items: () => [],
    loading: false,
    error: "",
    policy: "manual",
    selected: "",
    design: true,
    listSource: false
  }
);

const emits = defineEmits<{
  /** 重新拉取列表。 / Fetch the list again. */
  refresh: [];
  /** 载入一个条目。 / Load one entry. */
  load: [id: string];
  /** 丢弃当前选择。 / Discard the current selection. */
  select: [id: string];
  /** 重试失败的列表请求。 / Retry a failed list request. */
  retry: [];
  /** 新建一份模板。 / Start a new template. */
  create: [];
  /** 载入本机已保存的模板。 / Load the template saved on this machine. */
  "pick-local": [];
}>();

const t = computed(() => mergeEditorLocale(props.locale));
</script>

<style scoped lang="scss">
.s-tool-template {
  max-width: 520px;

  &__bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }

  &__label {
    margin-left: 4px;
  }

  &__hint {
    margin: 0;
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }
}
</style>
