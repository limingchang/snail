<script setup lang="ts">
/**
 * 快速上手（设计模式）：默认配置下就能写模板。
 *
 * 这里装的是 `createStarterDocument()` —— 一份真实文档，而不是一张白纸：主标题、二级标题、
 * 正文、金额变量（小写 + 中文大写各一次）、普通表格、无边框布局表和一个二维码。默认文档存在的
 * 意义就是让第一次打开的人立刻看到分页、表格和变量的实际效果；用一段空的「一页一段」的话，
 * 上面这些能力都得自己先写二十行 ProseMirror JSON 才能看见。
 *
 * 二维码节点只保存**内容**（`text`）：位图（`src`）是异步生成的，`createStarterDocument()` 这个同步
 * 工厂没法等它。宿主也不需要为此做任何事 —— 二维码扩展在文档打开后会为每一个「有载荷、还没有位图」
 * 的节点补上位图（见 `extensions/qrcode` 的 `onCreate`），所以这一页打开就有二维码。
 *
 * 工具栏默认显示七组（见 `DEFAULT_TOOLS`）：模板、格式、段落、插入、表格、页面、水印。
 *
 * 保存给的是 `{ kind: "local" }`，所以点「保存」是把**模板字符**写进本机的 `localStorage`
 * （默认键 `snail-editor-template`）—— 不离开页面，刷新之后还在。这也是填写模式里「模板」页签的
 * 「加载本地模板」按钮读的同一个槽位。
 */
import { ref } from "vue";
import { createStarterDocument, SEditor } from "@snail-js/editor";
import type { TemplateContent, TemplateSaveTarget } from "@snail-js/editor";

const doc = ref<TemplateContent>(createStarterDocument());

/** 保存在本地，而不是发给后端：文档站的示例不需要一个服务器。 */
const localSave: TemplateSaveTarget = { kind: "local" };
</script>

<template>
  <div class="demo-editor-stage">
    <SEditor v-model="doc" :save="localSave" />
  </div>
</template>
