<template>
  <div class="tool-variable">
    <Tooltip title="插入新变量" :color="'#2db7f5'" placement="right">
      <Button :icon="h(IconVariable)" style="padding: 4px;" size="middle" @click="handleInsertVariableClick"></Button>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { Tooltip, Button } from 'ant-design-vue'
import { IconVariable } from '@snail-js/vue'
import { Editor } from '@tiptap/vue-3'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

// 变量工具
const handleInsertVariableClick = () => {
  props.editor.chain().focus().insertVariable().run()
}

</script>

<style scoped></style>