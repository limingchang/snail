<template>
  <Tabs v-model:activeKey="tab" animated @change="handleTabChange"> 
    <TabPane key="style" tab="格式" class="tool-pane">
      <ToolStylePane :editor="props.editor"></ToolStylePane>
    </TabPane>
    <TabPane key="insert" tab="插入" class="tool-pane">
        <ToolInsertPane :editor="props.editor"></ToolInsertPane>
    </TabPane>
    <TabPane key="page" tab="页面">页面</TabPane>
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
.tool-pane {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 125px;
}
</style>