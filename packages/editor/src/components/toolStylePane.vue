<template>
  <ToolFont :editor="props.editor"></ToolFont>
  <Divider type="vertical" style="height: 100%;"></Divider>
  <ToolParagraph :editor="props.editor"></ToolParagraph>
</template>

<script setup lang="ts">

import { Divider } from 'ant-design-vue'

import { Editor } from '@tiptap/vue-3'

import ToolFont from './toolFont.vue'
import ToolParagraph from './toolParagraph.vue'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})
</script>

<style scoped></style>