<template>
  <Tabs v-model:activeKey="tab" animated @change="handleTabChange" class="tool-tabs">
    <TabPane key="style" tab="格式" class="tool-pane">
      <ToolFont :editor="props.editor"></ToolFont>
      <Divider type="vertical" style="height: 100%;"></Divider>
      <ToolParagraph :editor="props.editor"></ToolParagraph>
    </TabPane>
    <TabPane key="page" tab="页面">页面</TabPane>
    <TabPane key="insert" tab="插入" class="tool-pane">
      <ToolQrcode :editor="props.editor"></ToolQrcode>
      <Divider type="vertical" style="height: 100%;"></Divider>
      <ToolTable :editor="props.editor"></ToolTable>
      <Divider type="vertical" style="height: 100%;"></Divider>
      <ToolVariable :editor="editor" :exlude="variable?.exlude" :innerVariable="variable?.innerVariable"></ToolVariable>
    </TabPane>
    <TabPane v-for="(item, index) in props.custom" :key="index" class="tool-pane" :tab="item.title">
      <component :is="item.tools" :editor="props.editor"></component>
    </TabPane>
  </Tabs>
</template>

<script setup lang="ts">
import { ref } from "vue";
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

const props = defineProps<ToolBarOptions>();

const tab = ref("insert");

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
  max-width: 1200px;
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
  min-height: 125px;
}
</style>
