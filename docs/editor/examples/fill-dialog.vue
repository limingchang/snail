<script setup lang="ts">
/**
 * 填写模式：文档是只读的，变量按值渲染。
 *
 * 这里和「快速上手」用的是**同一份** `createStarterDocument()`：填写模式要展示的正是
 * 「同一份模板，换成填好的数据」这件事，用一份手写的三行文档反而看不出效果。`data` 里的
 * key 与起始文档里的变量一一对应。
 *
 * `openFillDialog()` 来自 `SEditorExposed`，由组件 `ref` 暴露。它不修改文档，只把新的
 * 填写数据交给变量的渲染层。
 */
import { ref } from "vue";
import type { Editor } from "@tiptap/core";
import { createStarterDocument, SEditor } from "@snail-js/editor";
import type { SEditorExposed, TemplateContent, VariableFillData } from "@snail-js/editor";

const editorRef = ref<SEditorExposed>();

const doc = ref<TemplateContent>(createStarterDocument());

/** 填写数据按变量 `key` 取值；金额变量小写与中文大写都取自同一个数字。 */
const values = ref<VariableFillData>({
  contractNo: "SN-2026-0001",
  amount: 136000,
  amountInWords: 136000
});

/** 二维码位图是异步生成的，编辑器就绪后画一次。 */
function onReady(editor: Editor): void {
  editor.commands.regenerateQRCode();
}
</script>

<template>
  <div class="demo-mode-bar">
    <span>填写模式，文档只读；点右侧按钮打开填写对话框。</span>
    <button type="button" @click="editorRef?.openFillDialog()">打开填写对话框</button>
  </div>
  <div class="demo-editor-stage">
    <SEditor ref="editorRef" v-model="doc" mode="fill" :data="values" :tools="[]" @ready="onReady" />
  </div>
</template>

<style scoped>
.demo-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.demo-mode-bar button {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
</style>
