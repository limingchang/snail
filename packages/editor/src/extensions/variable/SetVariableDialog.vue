<template>
  <Modal v-model:open="open" title="设置变量" @ok="handleOk">
    <Form>
      <Form.Item label="变量名称">
        <Input v-model:value="options.name" />
      </Form.Item>
      <Form.Item label="变量类型">
        <Select v-model:value="options.type">
          <Select.Option v-for="item in Object.values(VariableType)" :key="item" :value="item">{{ item }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item label="变量key">
        <Input v-model:value="options.key" />
      </Form.Item>
      <Form.Item label="变量描述">
        <Input v-model:value="options.desc" />
      </Form.Item>
      <Form.Item label="默认值">
        <Input v-model:value="options.defaultValue" />
      </Form.Item>
    </Form>
  </Modal>
</template>

<script setup lang="ts">
import { defineModel, defineEmits, onMounted, ref, PropType } from 'vue'
import { Modal, Form, Select, Input } from 'ant-design-vue'

import { TOptions, VariableType } from './typing'

const open = defineModel('open', {
  type: Boolean,
  default: false,
})



const props = defineProps({
  options: {
    type: Object as PropType<TOptions>,
    required: true,
  }
})

const options = ref(props.options)

const emits = defineEmits(['update:options'])


const handleOk = () => {
  emits('update:options')
  open.value = false
}

onMounted(() => {
  options.value = props.options
})

</script>

<style scoped></style>