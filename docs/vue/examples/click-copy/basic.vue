<script setup lang="ts">
import { ref } from "vue";
import { SClickCopy } from "@snail-js/vue";
import type { ClickCopyErrorPayload, ClickCopySuccessPayload } from "@snail-js/vue";

const orderNo = "SO-2024-0001";
const message = ref("点一下「复制订单号」");

function onSuccess(payload: ClickCopySuccessPayload): void {
  message.value = `success：来源 ${payload.source}，复制了「${payload.text}」`;
}

function onError(payload: ClickCopyErrorPayload): void {
  message.value = `error：${payload.text || "（没有可复制的内容）"} → ${String(payload.error)}`;
}
</script>

<template>
  <div>
    <p>
      订单号 <code>{{ orderNo }}</code>
      <SClickCopy
        :text="orderNo"
        label="复制订单号"
        success-message="订单号已复制"
        @success="onSuccess"
        @error="onError"
      />
    </p>
    <p class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
p {
  margin: 0 0 8px;
}

.message {
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
