<script setup lang="ts">
/**
 * 快速上手（设计模式）：默认配置下就能写模板。
 *
 * 只给 `doc` 一个「一页一段」的空文档，其余全部走默认值：`mode` 默认 `design`，
 * 页面、变量、二维码、水印、打印这几个扩展默认注册，工具栏默认显示
 * `["font", "paragraph", "insert", "page"]` 四组。
 */
import { ref } from "vue";
import { SEditor } from "@snail-js/editor";
import type { TemplateContent } from "@snail-js/editor";

const doc = ref<TemplateContent>({
  type: "doc",
  content: [
    {
      type: "page",
      content: [{ type: "pageContent", content: [{ type: "paragraph" }] }]
    }
  ]
});
</script>

<template>
  <div class="demo-editor-stage">
    <SEditor v-model="doc" />
  </div>
</template>
