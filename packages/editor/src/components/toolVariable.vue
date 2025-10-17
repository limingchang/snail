<template>
  <div class="tool-variable">
    <Button :icon="h(IconVariable)" @click="emits('insert')">插入新变量</Button>
  </div>
</template>

<script setup lang="ts">
import { h, ref, onMounted } from "vue";
import { Button } from "ant-design-vue";
// import type { Editor } from "@tiptap/core";
// import type { CascaderProps } from 'ant-design-vue';
import { IconVariable } from "@snail-js/vue";
// import { ToolVariableOptions } from "../typing/index"

// import { VariableType } from "../extensions/variable/typing";



const emits = defineEmits<{
  (e: 'insert'): void
}>()


onMounted(() => {
})



</script>

<style scoped></style>
