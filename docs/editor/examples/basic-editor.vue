<script setup lang="ts">
/**
 * 快速上手（设计模式）：默认配置下就能写模板。
 *
 * 这里装的是 `createStarterDocument()` —— 一份真实文档，而不是一张白纸：主标题、二级标题、
 * 正文、金额变量（小写 + 中文大写各一次）、普通表格、无边框布局表和一个二维码。默认文档存在的
 * 意义就是让第一次打开的人立刻看到分页、表格和变量的实际效果；用一段空的「一页一段」的话，
 * 上面这些能力都得自己先写二十行 ProseMirror JSON 才能看见。
 *
 * 二维码节点只保存**内容**（`text`），位图（`src`）是异步生成的，也不会跟文档一起存 ——
 * 所以等编辑器就绪后调一次 `regenerateQRCode()` 把它画出来。不调也能用，节点显示占位提示。
 *
 * 工具栏默认显示五组（见 `DEFAULT_TOOLS`）：格式、段落、插入、表格、页面。
 */
import { ref } from "vue";
import type { Editor } from "@tiptap/core";
import { createStarterDocument, SEditor } from "@snail-js/editor";
import type { TemplateContent } from "@snail-js/editor";

const doc = ref<TemplateContent>(createStarterDocument());

/** 编辑器就绪后生成一次二维码位图。 */
function onReady(editor: Editor): void {
  editor.commands.regenerateQRCode();
}
</script>

<template>
  <div class="demo-editor-stage">
    <SEditor v-model="doc" @ready="onReady" />
  </div>
</template>
