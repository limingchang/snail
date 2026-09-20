<script setup lang="ts">
import { SWordCloud } from "@snail-js/vue";
import type { WordCloudWordInput } from "@snail-js/vue";

/**
 * 权重是「相对重要程度」，会按排名归一化到 0…1 —— 120 和 12 这种量级都合法，
 * 所以可以直接把词频丢进来。`color` 钉住单个词的颜色，优先级高于 colors。
 */
const words: WordCloudWordInput[] = [
  { text: "合同", weight: 120, color: "#409eff" },
  { text: "审批", weight: 80 },
  { text: "变量", weight: 64 },
  { text: "条款", weight: 52 },
  { text: "签署", weight: 44 },
  { text: "归档", weight: 32 },
  { text: "印章", weight: 24 },
  { text: "附件", weight: 18 },
  { text: "版本", weight: 12 }
];

/** 调色板按词的下标循环取用；不传时用主题的五个状态色（--s-color-*）。 */
const colors = ["#409eff", "#67c23a", "#e6a23c"];
</script>

<template>
  <SWordCloud
    :words="words"
    :colors="colors"
    :radius="160"
    :base-font-size="14"
    :font-size-range="[12, 40]"
    :speed="8"
    :pause-on-hover="true"
  />
</template>
