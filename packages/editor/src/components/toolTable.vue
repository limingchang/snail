<template>
  <Tooltip title="插入表格" color="#409EFF">
    <Button :icon="h(TableOutlined)" size="large" @click="handleInsertTable"></Button>
  </Tooltip>
  <Tooltip title="插入布局定位表(一般用于签署分栏)" color="#F56C6C">
    <Button style="margin-left: 8px;padding: 8px;" size="large" :icon="h(IconLayout)" ></Button>
  </Tooltip>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { Button, Tooltip } from 'ant-design-vue'
import { TableOutlined } from '@ant-design/icons-vue'
import { IconLayout } from '@snail-js/vue'
import { Editor } from '@tiptap/vue-3'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

const table = {
  type: 'table',
  content:[
    {type:'tableRow',content:[
      // {type:'tableCell',content:[]},
      {type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'1'}]}]},
      // {type:'tableCell',content:[{type:'paragraph'}]},
    ]},
    // {type:'tableRow',content:[
    //   {type:'tableCell',content:[{type:'paragraph'}]},
    //   {type:'tableCell',content:[{type:'paragraph'}]},
    //   {type:'tableCell',content:[{type:'paragraph'}]},
    // ]}
  ]
}

// 插入普通表格
const handleInsertTable = async()=>{
  // props.editor.chain().focus().enter().run()
  // await new Promise(resolve => setTimeout(resolve, 100))
  props.editor.chain().focus().insertContent(table).run()
  // props.editor.chain().focus().insertTable({rows: 3, cols: 3,withHeaderRow: true}).run()
}
</script>

<style scoped></style>