<script setup lang="ts">
import { ref } from "vue";
import { SWordCloud } from "@snail-js/vue";
import type { WordCloudClickPayload, WordCloudExposed } from "@snail-js/vue";

const cloud = ref<WordCloudExposed | null>(null);
const message = ref("点一个词试试");

// 不传 radius 时词云撑满父容器宽度并按 aspect-ratio: 1 取半径，
// 所以这里加一个宽度上限，免得它在文档页里占满整屏。
const words = [
  "合同",
  "模板",
  "变量",
  "条款",
  "签署",
  "归档",
  "审批",
  "印章",
  "附件",
  "版本",
  "客户",
  "金额",
  "生效",
  "到期",
  "续签",
  "作废"
];

function onClick(payload: WordCloudClickPayload): void {
  message.value = `wordClick：${payload.text}（index ${payload.index}，weight ${payload.weight.toFixed(2)}）`;
}
</script>

<template>
  <div class="stack">
    <div class="stage">
      <SWordCloud ref="cloud" :words="words" @word-click="onClick" />
    </div>

    <p class="actions">
      <button type="button" @click="cloud?.stop()">stop()</button>
      <button type="button" @click="cloud?.start()">start()</button>
      <span>{{ message }}</span>
    </p>
  </div>
</template>

<style scoped>
.stage {
  max-width: 360px;
  margin: 0 auto;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.actions button {
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
</style>
