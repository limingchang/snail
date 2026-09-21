<script setup lang="ts">
/**
 * 两种模式是同一个组件的两种用法，而 `mode` 是**响应式**的：
 * 切换之后编辑器就地重绘，文档一个字节都没有变，所以切回设计模式是免费的。
 *
 * 换行、缩进、页码、水印都不必重新加载模板：这里用的是同一个 `SEditor` 实例，装的也是
 * 「快速上手」里那份 `createStarterDocument()`，所以切换时看到的是同一份合同。
 */
import { ref } from "vue";
import type { Editor } from "@tiptap/core";
import { createStarterDocument, SEditor } from "@snail-js/editor";
import type { EditorMode, TemplateContent, VariableFillData } from "@snail-js/editor";

const mode = ref<EditorMode>("design");

const doc = ref<TemplateContent>(createStarterDocument());

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
    <span>当前模式：{{ mode === "design" ? "设计 design" : "填写 fill" }}</span>
    <button type="button" @click="mode = mode === 'design' ? 'fill' : 'design'">
      切换到{{ mode === "design" ? "填写" : "设计" }}模式
    </button>
  </div>
  <div class="demo-editor-stage">
    <SEditor v-model="doc" :mode="mode" :data="values" :tools="[]" @ready="onReady" />
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
