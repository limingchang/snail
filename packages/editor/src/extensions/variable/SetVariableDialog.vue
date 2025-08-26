<template>
  <Modal v-model:open="open" title="设置变量" @ok="handleOk" okText="确定" cancelText="取消">
    <Form>
      <Form.Item label="变量名称">
        <Input v-model:value="attrs.label" />
      </Form.Item>
      <Form.Item label="变量类型">
        <Select v-model:value="attrs.type" @change="handleUpdateType">
          <Select.Option :value="VariableType.Text">文本</Select.Option>
          <Select.Option :value="VariableType.Number">数字</Select.Option>
          <Select.Option :value="VariableType.Money">￥人民币</Select.Option>
          <Select.Option :value="VariableType.Bollean">布尔(是否)</Select.Option>
          <Select.Option :value="VariableType.InnerObject">内置对象</Select.Option>
          <Select.Option :value="VariableType.Date">日期</Select.Option>
          <Select.Option :value="VariableType.List">列表</Select.Option>
          <Select.Option :value="VariableType.Radio">单选</Select.Option>
          <Select.Option :value="VariableType.Object">普通对象</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item label="变量key">
        <Input v-if="attrs.type !== VariableType.InnerObject && attrs.type !== VariableType.Date"
          v-model:value="attrs.key" />
        <div v-if="attrs.type == VariableType.InnerObject">
          <Tag color="#ee3f4d">company.{{ innerObjectSubKey }}</Tag>
          <Select v-model:value="innerObjectSubKey" style="width: 180px;" @change="handleInnerObjectSubKeyChange">
            <Select.Option v-for="item in innerObjectSubKeyList" :key="item" :value="item.key">{{ item.label }}
            </Select.Option>">
          </Select>
        </div>
        <div v-if="attrs.type == VariableType.Date">
          <Input v-model:value="dateKey" style="width: 60px;" />
          <Select v-model:value="dateSubKey" style="width: 60px;" @change="handleDateSubKeyChange">
            <Select.Option v-for="item in dateKeySubList" :key="item" :value="item.key">{{ item.label }}</Select.Option>
            ">
          </Select>
          <Tag color="#f28e16">{{ dateKey }}.{{ dateSubKey }}</Tag>
        </div>
      </Form.Item>
      <Form.Item label="默认值">
        <Input v-model:value="attrs.defaultValue" />
      </Form.Item>
      <Form.Item v-if="attrs.type == VariableType.List" label="列表项">
        <Tag color="#a83279" v-for="(item,index) in listItems" closable  @close="handleDelListItem(index)">{{ item }}</Tag>
        <InputGroup compact size="small" style="width: 112px;display: inline-block;">
          <Input v-model:value="addedItem" style="width: 80px;" placeholder="添加项"/>
          <Button :icon="h(PlusOutlined)" type="primary" @click="handleAddListItem"></Button>
        </InputGroup>
      </Form.Item>
      <Form.Item label="变量描述">
        <Input v-model:value="attrs.desc" />
      </Form.Item>
    </Form>
  </Modal>
</template>

<script setup lang="ts">
import { defineModel, defineEmits, onMounted, ref, PropType, reactive, h } from 'vue'
import { Modal, Form, Select, Input, Tag, Button,InputGroup } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'

import { VariableAttrs, VariableType } from './typing'

const open = defineModel('open', {
  type: Boolean,
  default: false,
})



const props = defineProps({
  attrs: {
    type: Object as PropType<VariableAttrs>,
    required: true,
  }
})

const attrs = reactive(props.attrs)

const emits = defineEmits(['update:attrs'])


const handleOk = () => {
  emits('update:attrs')
  open.value = false
}

onMounted(() => {
  // attrs.value = props.attrs
})

// 
const handleUpdateType = (value: any) => {
  if (value == VariableType.InnerObject) {
    attrs.label = innerObjectSubKeyList[0].label
    attrs.key = `company.${innerObjectSubKeyList[0].key}`
  } else if (value == VariableType.Date) {
    attrs.key = 'date.year'
    dateKey.value = 'date'
  } else {
    attrs.key = `${value}`
  }
}

// 内置变量
const innerObjectSubKeyList = [
  {
    label: '企业名称',
    key: 'name'
  },
  {
    label: '企业地址',
    key: 'address'
  },
  {
    label: '企业法人',
    key: 'legalPerson',
  },
  {
    label: '统一社会信用代码',
    key: 'unifiedCreditCode',
  },
  {
    label: '法人电话',
    key: 'tel',
  },
]
const innerObjectSubKey = ref(innerObjectSubKeyList[0].key)

const handleInnerObjectSubKeyChange = (value: any) => {
  attrs.key = `company.${value}`
  attrs.label = innerObjectSubKeyList.find(item => item.key == value)!.label
}

// 时间对象
const dateKeySubList = [
  {
    label: '年',
    key: 'year',
  },
  {
    label: '月',
    key: 'month',
  },
  {
    label: '日',
    key: 'day',
  },
]
const dateKey = ref('')
const dateSubKey = ref(dateKeySubList[0].key)

const handleDateSubKeyChange = () => {
  attrs.key = `${dateKey.value}.${dateSubKey.value}`
}

// 列表项
const listItems = ref<Array<string>>([])
const addedItem = ref('')
const handleAddListItem = () => {
  if (!addedItem.value) return
  listItems.value.push(addedItem.value)
  addedItem.value = ''
}

const handleDelListItem = (index: number) => {
  listItems.value.splice(index, 1)
}


</script>

<style scoped></style>