<template>
  <div class="tool-variable">
    <Button :icon="h(IconVariable)" @click="handleInsertVariableClick"
      >插入新变量</Button
    >
    <Modal
      v-model:open="open"
      title="设置变量"
      @ok="handleOk"
      okText="确定"
      cancelText="取消"
    >
      <Form>
        <Form.Item label="变量名称">
          <Input v-model:value="attrs.label" />
        </Form.Item>
        <Form.Item label="变量类型">
          <Select v-model:value="attrs.type" @change="handleUpdateType">
            <Select.Option :value="VariableType.Text">文本</Select.Option>
            <Select.Option :value="VariableType.Number">数字</Select.Option>
            <Select.Option :value="VariableType.Money">￥人民币</Select.Option>
            <Select.Option :value="VariableType.Bollean"
              >布尔(是否)</Select.Option
            >
            <Select.Option :value="VariableType.InnerObject"
              >内置对象</Select.Option
            >
            <Select.Option :value="VariableType.Date">日期</Select.Option>
            <Select.Option :value="VariableType.List">列表</Select.Option>
            <Select.Option :value="VariableType.Radio">单选</Select.Option>
            <Select.Option :value="VariableType.Object">普通对象</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="变量key">
          <Input
            v-if="
              attrs.type !== VariableType.InnerObject &&
              attrs.type !== VariableType.Date
            "
            v-model:value="attrs.key"
          />
          <div v-if="attrs.type == VariableType.InnerObject">
            <Tag color="#ee3f4d">company.{{ innerObjectSubKey }}</Tag>
            <Select
              v-model:value="innerObjectSubKey"
              style="width: 180px"
              @change="handleInnerObjectSubKeyChange"
            >
              <Select.Option
                v-for="item in innerObjectSubKeyList"
                :key="item"
                :value="item.key"
                >{{ item.label }} </Select.Option
              >">
            </Select>
          </div>
          <div v-if="attrs.type == VariableType.Date">
            <Input v-model:value="dateKey" style="width: 60px" />
            <Select
              v-model:value="dateSubKey"
              style="width: 60px"
              @change="handleDateSubKeyChange"
            >
              <Select.Option
                v-for="item in dateKeySubList"
                :key="item"
                :value="item.key"
                >{{ item.label }}</Select.Option
              >
              ">
            </Select>
            <Tag color="#f28e16">{{ dateKey }}.{{ dateSubKey }}</Tag>
          </div>
        </Form.Item>
        <Form.Item label="默认值">
          <Input v-model:value="attrs.defaultValue" />
        </Form.Item>
        <Form.Item v-if="attrs.type == VariableType.List" label="列表项">
          <Tag
            color="#a83279"
            v-for="(item, index) in listItems"
            closable
            @close="handleDelListItem(index)"
            >{{ item }}
          </Tag>
          <InputGroup
            compact
            size="small"
            style="width: 112px; display: inline-block"
          >
            <Input
              v-model:value="addedItem"
              style="width: 80px"
              placeholder="添加项"
            />
            <Button
              :icon="h(PlusOutlined)"
              type="primary"
              @click="handleAddListItem"
            ></Button>
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
import { h, reactive } from "vue";
import { Button } from "ant-design-vue";
import { IconVariable } from "@snail-js/vue";
import { Editor } from "@tiptap/vue-3";

import type { VariableAttrs } from "../extensions/variable/typing";
import { VariableType } from "../extensions/variable/typing";

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null,
  },
});

const variable = reactive<VariableAttrs>({
  label: "新变量",
  type: VariableType.Text,
  key: "key",
  desc: "变量描述",
  defaultValue: "默认值",
});

// 变量先进行属性设置，再插入
// TODO
// 变量工具
const handleInsertVariableClick = () => {
  props.editor.chain().focus().insertVariable().run();
};
</script>

<style scoped></style>
