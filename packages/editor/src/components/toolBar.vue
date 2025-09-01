<template>
  <Tabs v-model:activeKey="tab" animated @change="handleTabChange" class="tool-tabs">
    <TabPane key="style" tab="格式" class="tool-pane"
      v-if="tools?.includes('style') || styleTools.some(item => tools?.includes(item))">
      <ToolFont :editor="editor" v-if="tools?.includes('style') || tools?.includes('font')"></ToolFont>
      <Divider type="vertical" style="height: 100%;"></Divider>
      <ToolParagraph :editor="editor" v-if="tools?.includes('style') || tools?.includes('paragraph')"></ToolParagraph>
    </TabPane>
    <TabPane key="page" tab="页面" v-if="tools?.includes('page')">页面</TabPane>
    <TabPane key="insert" tab="插入" class="tool-pane"
      v-if="tools?.includes('insert') || insertTools.some(item => tools?.includes(item))">
      <ToolQrcode :editor="editor" v-if="tools?.includes('insert') || tools?.includes('qrcode')"></ToolQrcode>
      <Divider type="vertical" style="height: 100%;"></Divider>
      <ToolTable :editor="editor" v-if="tools?.includes('insert') || tools?.includes('table')"></ToolTable>
      <Divider type="vertical" style="height: 100%;"></Divider>
      <ToolVariable :editor="editor" :exlude="options?.variable?.exlude"
        :innerVariable="options?.variable?.innerVariable"
        v-if="tools?.includes('insert') || tools?.includes('variable')"></ToolVariable>
    </TabPane>
    <TabPane v-for="(item, index) in custom" :key="index" class="tool-pane" :tab="item.title">
      <component :is="item.tools" :editor="editor"></component>
    </TabPane>
  </Tabs>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type {  Editor } from "@tiptap/core";
import { Tabs, TabPane } from "ant-design-vue";
// import ToolStylePane from "./toolStylePane.vue";

import { Divider } from 'ant-design-vue'
import ToolFont from './toolFont.vue'
import ToolParagraph from './toolParagraph.vue'
import ToolQrcode from './toolQrcode.vue'
import ToolVariable from './toolVariable.vue'
import ToolTable from './toolTable.vue'

// import ToolInsertPane from "./toolInsertPane.vue";
import { ToolBarOptions } from "../typing/index";

const props = defineProps<ToolBarOptions & { editor?: Editor }>();


// const tools = ['style', 'page', 'insert']
const styleTools = ['font', 'paragraph']
const insertTools = ['qrcode', 'variable', 'table']

const initActiveTab = ()=>{
  return props.tools?.includes('style')|| styleTools.some(item => props.tools?.includes(item)) ? 
  'style':props.tools?.includes('insert') || insertTools.some(item => props.tools?.includes(item))?
  'insert':props.tools?.includes('page')?
  'page':0
}
const tab = ref(initActiveTab());

const handleTabChange = () => {
  props.editor?.chain().focus().run();
};
</script>

<style scoped lang="scss">
.tool-tabs {
  background-color: #ffffff;
  /* 白色背景 */
  border-radius: 8px;
  /* 圆角效果 */
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  /* 阴影效果 */
  min-width: calc(100vw - 32px);
  /* 最大宽度 */
  margin: 0 auto;
  /* 居中显示 */
  padding: 8px 16px;
  /* 内边距 */
  box-sizing: border-box;
  /* 盒模型 */
  border: 1px solid #e0e0e0;
  /* 边框 */
  margin: 10px auto;
}

.tool-pane {
  display: flex;
  align-items: center;
  justify-content: ‌flex-start‌;
  width: 100%;
  min-height: 130px;
}
</style>
