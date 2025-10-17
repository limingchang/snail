<template>
  <div class="tool-variable">
    <Button :icon="h(IconVariable)" @click="emits('insert')">插入新变量</Button>
    <Descriptions title="当前变量信息" bordered :column="2" size="small">
      <Descriptions.Item label="变量名称">{{ props.attrs?.label }}</Descriptions.Item>
      <Descriptions.Item label="变量类型">{{ typeLabels[props.attrs?.type] }}</Descriptions.Item>
      <Descriptions.Item label="key">{{ props.attrs?.key }}</Descriptions.Item>
      <Descriptions.Item label="默认值">{{ props.attrs?.value }}</Descriptions.Item>
      <Descriptions.Item label="描述">{{ props.attrs?.desc }}</Descriptions.Item>
    </Descriptions> 
  </div>
</template>

<script setup lang="ts">
import { h, ref, onMounted } from "vue";
import { Button,Descriptions  } from "ant-design-vue";
// import type { Editor } from "@tiptap/core";
// import type { CascaderProps } from 'ant-design-vue';
import { IconVariable } from "@snail-js/vue";
// import { ToolVariableOptions } from "../typing/index"
import { VariableAttrs } from "../extensions/variable/typing";
import { typeLabels } from '@/typing/variable'

const props = defineProps<{
  attrs?: VariableAttrs
}>()


const emits = defineEmits<{
  (e: 'insert'): void
}>()


onMounted(() => {
})



</script>

<style scoped>
.tool-variable{
  display: grid;
  grid-template-columns: 120px 400px;
  grid-gap: 10px;
}
</style>
