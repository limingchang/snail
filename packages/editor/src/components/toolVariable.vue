<template>
  <div class="tool-variable">
    <Button :icon="h(IconVariable)" @click="handleInsertVariableClick"
      >插入新变量</Button
    >
  </div>
</template>

<script setup lang="ts">
import { h } from "vue";
import { Tooltip, Button } from "ant-design-vue";
import { IconVariable } from "@snail-js/vue";
import { Editor } from "@tiptap/vue-3";

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null,
  },
});

// 变量工具
const handleInsertVariableClick = () => {
  props.editor.chain().focus().insertVariable().run();
};
</script>

<style scoped></style>
