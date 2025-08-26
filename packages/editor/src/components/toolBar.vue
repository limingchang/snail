<template>
  <Tabs v-model:activeKey="tab" animated @change="handleTabChange" class="tool-tabs"> 
    <TabPane key="style" tab="格式" class="tool-pane">
      <ToolStylePane :editor="props.editor"></ToolStylePane>
    </TabPane>
    <TabPane key="page" tab="页面">页面</TabPane>
    <TabPane key="insert" tab="插入" class="tool-pane">
        <ToolInsertPane :editor="props.editor"></ToolInsertPane>
    </TabPane>
  </Tabs>
</template>

<script setup lang="ts">
import { ref } from 'vue'
// import { STab, STabItem } from '@snail-js/vue'

import { Tabs, TabPane } from 'ant-design-vue'

import type { Editor } from '@tiptap/vue-3'
import ToolStylePane from './toolStylePane.vue'
import ToolInsertPane from './toolInsertPane.vue'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})


const tab = ref('style')

const handleTabChange = ()=>{
  props.editor?.chain().focus().run()
}

</script>

<style scoped lang="scss">
.tool-tabs{
  background-color: #ffffff; /* 白色背景 */
  border-radius: 8px; /* 圆角效果 */
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); /* 阴影效果 */
  max-width: 1200px; /* 最大宽度 */
  margin: 0 auto; /* 居中显示 */
  padding: 8px 16px; /* 内边距 */
  box-sizing: border-box; /* 盒模型 */
  border: 1px solid #e0e0e0; /* 边框 */
  margin: 10px auto;
}
.tool-pane {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 125px;
}
</style>