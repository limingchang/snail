<script setup lang="ts">
import { ref } from "vue";
import { SClickCopy } from "@snail-js/vue";
import type { ClickCopyExposed } from "@snail-js/vue";

/** 富文本：支持 `ClipboardItem` 时同时写入 text/html 与 text/plain，否则自动退回纯文本。 */
const richText = "@snail-js/vue 1.0.0";
const richHtml = '<b style="color:#409eff">@snail-js/vue</b> 1.0.0';

/** 通过模板 ref 调用暴露出来的 copy()，效果与用户点击完全一致。 */
const target = ref<ClickCopyExposed | null>(null);
const message = ref("还没有调用过 copy()");

async function copyByRef(): Promise<void> {
  const ok = await target.value?.copy();
  message.value = `copy() 返回 ${ok}，state = ${target.value?.state ?? "?"}`;
}
</script>

<template>
  <div class="stack">
    <p>
      富文本
      <SClickCopy :text="richText" :html="richHtml" label="复制版本号" :duration="3000" />
    </p>

    <!-- 插槽作用域给出 state / label / copy：反馈由组件维护，外观由你决定 -->
    <p>
      插槽作用域
      <SClickCopy text="这段文本来自 text 属性" :duration="3000">
        <template #default="{ state, copy }">
          <button type="button" class="custom" :data-state="state" @click="copy">
            {{ state === "success" ? "已复制" : state === "error" ? "复制失败" : "自定义按钮" }}
          </button>
        </template>
      </SClickCopy>
    </p>

    <p>
      程序化调用
      <SClickCopy ref="target" text="由父组件的按钮复制" label="ref 目标" />
      <button type="button" @click="copyByRef">调用 ref.copy()</button>
      <SClickCopy text="x" label="禁用态" disabled />
    </p>

    <p class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.stack p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
}

.custom {
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.custom[data-state="success"] {
  border-color: #67c23a;
  color: #67c23a;
}

.custom[data-state="error"] {
  border-color: #f56c6c;
  color: #f56c6c;
}

.message {
  display: block !important;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
