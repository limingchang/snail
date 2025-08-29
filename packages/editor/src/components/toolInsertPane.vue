<template>
  <ToolQrcode :editor="props.editor"></ToolQrcode>
  <Divider type="vertical" style="height: 100%;"></Divider>
  <ToolTable :editor="props.editor"></ToolTable>
  <Divider type="vertical" style="height: 100%;"></Divider>
  <ToolVariable :editor="props.editor"></ToolVariable>
</template>

<script setup lang="ts">
import { Divider } from 'ant-design-vue'
import ToolQrcode from './toolQrcode.vue'
import ToolVariable from './toolVariable.vue'
import ToolTable from './toolTable.vue'
import { Editor } from '@tiptap/vue-3'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

</script>

<style scoped></style>