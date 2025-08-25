<template>
  <NodeViewWrapper style="display: inline-block;text-indent: 0;">
    <Popover title="变量详情">
      <template #content>
        <p>类型: {{ props.node.attrs.type }}</p>
        <p>key: {{ props.node.attrs.key }}</p>
        <p>描述:{{ props.node.attrs.desc }}</p>
        <p>默认值:{{ props.node.attrs.defaultValue }}</p>
      </template>
      <span class="tiptap-variable" :data-variable-type="props.node.attrs.type"
        :data-variable-key="props.node.attrs.key" @click="handleClick">{{ handleSetValue(props.node.attrs) }}</span>
    </Popover>
  </NodeViewWrapper>
  <SetVariableDialog v-model:open="open" :options="options" @update:options="handleUpdateOptions" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Popover } from 'ant-design-vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'

import SetVariableDialog from './SetVariableDialog.vue'
import { TOptions, VariableType } from './typing'

const props = defineProps(nodeViewProps)

const open = ref<boolean>(false)

const options = ref<TOptions>({
  name: '新变量',
  type: VariableType.Text,
  key: 'key',
  desc: '',
  defaultValue: '',
})

onMounted(() => { })

const handleClick = () => {
  open.value = true
}

const handleUpdateOptions = () => {
  props.updateAttributes(options.value)
}

const handleSetValue = (options: any) => {

  console.log('options:',options)
  console.log('value:',options.value,'name:',options.name)
  if (options.value) {
    console.log('use value:',options.value)
    return options.value
  } else {
    console.log('use name')
    return options.name
  }
}

</script>

<style scoped>
.tiptap-variable {
  padding: 4px 6px;
  border-radius: 4px;
  background-color: #e6f7ff;
  font-size: 0.8em;
  cursor: pointer;
  margin-left: 6px;
  margin-right: 6px;
}

[data-variable-type="text"] {
  background-color: #333;
  color: #fff;
}

[data-variable-type="number"] {
  background-color: #1e80ff;
  color: #fff;
}

[data-variable-type="boolean"] {
  background-color: #55bb8a;
  color: #fff;
}

[data-variable-type="object"] {
  background-color: #ee3f4d;
  color: #fff;
}

[data-variable-type="array"] {
  background-color: #a83279;
  color: #fff;
}

[data-variable-type="date"] {
  background-color: #f28e16;
  color: #fff;
}
</style>