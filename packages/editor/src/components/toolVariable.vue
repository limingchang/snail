<template>
  <div class="tool-variable">
    <Button :icon="h(IconVariable)" @click="open = true">插入新变量</Button>
    <Modal v-model:open="open" title="设置变量" @ok="handleInsert" okText="确定" cancelText="取消">
      <Form>
        <Form.Item label="变量名称">
          <Input v-model:value="attrs.label" />
        </Form.Item>
        <Form.Item label="变量类型">
          <Select v-model:value="attrs.type" @change="handleUpdateType">
            <Select.Option v-for="type in allowTypes" :key="type" :value="type">
              {{ typeLabels[type] }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="变量key">
          <Input v-if="
            attrs.type !== VariableType.InnerVariable &&
            attrs.type !== VariableType.Date
          " v-model:value="attrs.key" />
          <div v-if="attrs.type == VariableType.InnerVariable">
            <Tag color="#ee3f4d">{{ attrs.key }}</Tag>
            <Cascader v-model:value="cascaderValue" :fieldNames="innerVariablefFieldNames"
              :options="props.innerVariable || []" placeholder="请选择..." changeOnSelect expand-trigger="hover"
              @change="onInnerVariableChange">
              <Button type="primary">选择内置变量</Button>
            </Cascader>
          </div>
          <div v-if="attrs.type == VariableType.Date">
            <Input v-model:value="dateKey" style="width: 60px" />
            <Select v-model:value="dateSubKey" style="width: 60px" @change="handleDateSubKeyChange">
              <Select.Option v-for="item in dateKeySubList" :key="item.key" :value="item.key">{{ item.label }}
              </Select.Option>
            </Select>
            <Tag color="#f28e16">{{ dateKey }}.{{ dateSubKey }}</Tag>
          </div>
        </Form.Item>
        <Form.Item label="默认值">
          <Input v-model:value="attrs.defaultValue" />
        </Form.Item>
        <Form.Item v-if="attrs.type == VariableType.List" label="列表项">
          <Tag color="#a83279" v-for="(item, index) in listItems" closable @close="handleDelListItem(index)">{{ item }}
          </Tag>
          <InputGroup compact size="small" style="width: 112px; display: inline-block">
            <Input v-model:value="addedItem" style="width: 80px" placeholder="添加项" />
            <Button :icon="h(PlusOutlined)" type="primary" @click="handleAddListItem"></Button>
          </InputGroup>
        </Form.Item>
        <Form.Item label="变量描述">
          <Input v-model:value="attrs.desc" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { h, reactive, ref, computed, onMounted } from "vue";
import { Button, Modal, Form, Select, Input, Tag, InputGroup, Cascader, message } from "ant-design-vue";
import type { Editor } from "@tiptap/core";
import type { CascaderProps } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { IconVariable } from "@snail-js/vue";
import { ToolVariableOptions } from "../typing/index"

import type { VariableAttrs } from "../extensions/variable/typing";
import { VariableType } from "../extensions/variable/typing";

const props = defineProps<ToolVariableOptions & { editor?: Editor }>();

const open = ref(false);

onMounted(() => {
  // console.log(props)
})

// 需要检查 VariableType 中是否有 InnerObject 类型
// 根据 SetVariableDialog.vue 中的使用，这里应该是 InnerObject
const allowTypes = computed(() => {
  const allTypes = Object.values(VariableType);
  if (props.exlude && props.exlude.length > 0) {
    return allTypes.filter(type => !props.exlude!.includes(type));
  }
  return allTypes;
});

// 变量类型标签映射
const typeLabels: Record<VariableType, string> = {
  [VariableType.Text]: '文本',
  [VariableType.Number]: '数字',
  [VariableType.Money]: '￥人民币',
  [VariableType.Bollean]: '布尔(是否)',
  [VariableType.InnerVariable]: '内置变量',
  [VariableType.Date]: '日期',
  [VariableType.List]: '列表',
  [VariableType.Radio]: '单选',
  [VariableType.Object]: '普通对象'
};

const attrs = reactive<VariableAttrs>({
  label: "新变量",
  type: VariableType.Text,
  key: "key",
  desc: "",
  defaultValue: "",
});

// 处理变量类型改变
const handleUpdateType = (value: any) => {
  if (value == VariableType.InnerVariable) {
    if (props.innerVariable && props.innerVariable.length > 0) {
      attrs.label = props.innerVariable[0].label || '';
      attrs.key = `${props.innerVariable[0].key}.`;
    } else {
      attrs.label = '新变量';
      attrs.key = '';
      message.error('未配置内置变量');
    }
    return
  } else if (value == VariableType.Date) {
    attrs.key = 'date.year';
    dateKey.value = 'date';
  } else {
    attrs.key = `${value}`;
  }
};

// 内置变量
// const innerObjectSubKeyList = [
//   {
//     label: '企业名称',
//     key: 'name'
//   },
//   {
//     label: '企业地址',
//     key: 'address'
//   },
//   {
//     label: '企业法人',
//     key: 'legalPerson',
//   },
//   {
//     label: '统一社会信用代码',
//     key: 'unifiedCreditCode',
//   },
//   {
//     label: '法人电话',
//     key: 'tel',
//   },
// ];


// 级联选择器的值
const cascaderValue = ref<string[]>([]);

// 内置变量处理
const innerVariablefFieldNames: CascaderProps['fieldNames'] = {
  label: 'label',
  value: 'key',
  children: 'children'
}

const onInnerVariableChange: CascaderProps['onChange'] = (value, selectedOptions) => {
  if (Array.isArray(value)) {
    attrs.key = value.join('.');
    cascaderValue.value = value as string[];
    if (selectedOptions && Array.isArray(selectedOptions) && selectedOptions.length > 0) {
      const lastOption = selectedOptions[selectedOptions.length - 1];
      if (lastOption && typeof lastOption === 'object' && 'label' in lastOption) {
        attrs.desc = lastOption.label as string;
        attrs.label = lastOption.label as string;
      }
    }
  }
}

// const innerObjectSubKey = ref(innerObjectSubKeyList[0].key);

// const handleInnerVariableSubKeyChange = (value: any) => {
//   attrs.key = `company.${value}`;
//   attrs.label = innerObjectSubKeyList.find(item => item.key == value)!.label;
// };

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
];
const dateKey = ref('');
const dateSubKey = ref(dateKeySubList[0].key);

const handleDateSubKeyChange = () => {
  attrs.key = `${dateKey.value}.${dateSubKey.value}`;
};

// 列表项
const listItems = ref<Array<string>>([]);
const addedItem = ref('');
const handleAddListItem = () => {
  if (!addedItem.value) return;
  listItems.value.push(addedItem.value);
  addedItem.value = '';
};

const handleDelListItem = (index: number) => {
  listItems.value.splice(index, 1);
};

const handleInsert = () => {
  if (props.editor) {
    // TODO: 这里需要实现插入变量的逻辑
    props.editor.chain().focus().insertVariable(attrs).run();
  }
  open.value = false;
};
</script>

<style scoped></style>
