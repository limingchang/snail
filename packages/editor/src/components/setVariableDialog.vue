<template>
  <Modal
    v-model:open="open"
    title="设置变量"
    @ok="handleClick"
    okText="确定"
    cancelText="取消"
  >
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
        <Input
          v-if="
            attrs.type !== VariableType.InnerVariable &&
            attrs.type !== VariableType.Date
          "
          v-model:value="attrs.key"
        />
        <div v-if="attrs.type == VariableType.InnerVariable">
          <Tag color="#ee3f4d">{{ attrs.key }}</Tag>
          <Cascader
            v-model:value="cascaderValue"
            :fieldNames="innerVariablefFieldNames"
            :options="props.innerVariable || []"
            placeholder="请选择..."
            changeOnSelect
            expand-trigger="hover"
            @change="onInnerVariableChange"
          >
            <Button type="primary" size="small">选择内置变量</Button>
          </Cascader>
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
              :key="item.key"
              :value="item.key"
              >{{ item.label }}
            </Select.Option>
          </Select>
          <Tag color="#f28e16">{{ dateKey }}.{{ dateSubKey }}</Tag>
        </div>
      </Form.Item>
      <Form.Item label="默认值">
        <Input
          v-model:value="attrs.defaultValue"
          v-if="
            attrs.type == VariableType.Text || attrs.type == VariableType.Date
          "
        />
        <InputNumber
          v-model:value="attrs.defaultValue"
          v-if="attrs.type == VariableType.Number"
          :min="0"
        />
        <InputNumber
          v-model:value="attrs.defaultValue"
          v-if="attrs.type == VariableType.Money"
          :min="0.0"
          addon-before="￥"
          :precision="2"
        />
        <Switch
          v-model:checked="attrs.defaultValue"
          v-if="attrs.type == VariableType.Bollean"
          checked-children="是"
          un-checked-children="否"
        />
        <Checkbox
          v-model:checked="attrs.defaultValue"
          v-if="attrs.type == VariableType.CheckBox"
        >{{ checkboxText }}</Checkbox>
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
      <Form.Item v-if="attrs.type == VariableType.Bollean" label="显示文本">
        <Input
          v-model:value="trueText"
          style="width: 100%"
          addon-before="「是」文本:"
        />
        <Input
          v-model:value="falseText"
          style="width: 100%; margin-top: 8px"
          addon-before="「否」文本:"
        />
      </Form.Item>
      <Form.Item v-if="attrs.type == VariableType.CheckBox" label="选项文本">
        <Input v-model:value="checkboxText" style="width: 100%" />
      </Form.Item>
      <Form.Item label="变量描述">
        <Input v-model:value="attrs.desc" />
      </Form.Item>
    </Form>
  </Modal>
</template>

<script setup lang="ts">
import { h, reactive, ref, computed, watch } from "vue";
import {
  Button,
  Modal,
  Form,
  Select,
  Input,
  Tag,
  InputGroup,
  Cascader,
  message,
  InputNumber,
  Switch,
  Checkbox
} from "ant-design-vue";
import type { CascaderProps } from "ant-design-vue";
import { PlusOutlined } from "@ant-design/icons-vue";

import {
  type VariableAttrs,
  VariableType,
  InnerVariableOptions,
} from "@/extensions/variable/typing";
import { typeLabels } from '@/typing/variable'

import type { SetVariableOptions } from "../typing/index";

const props = defineProps<{
  exlude?: Array<VariableType>;
  innerVariable?: Array<InnerVariableOptions>;
  currentVariableAttrs?: { [attr: string]: any };
}>();

const emits = defineEmits<{
  (e: "save", attrs: VariableAttrs): void;
}>();

const open = defineModel<boolean>("open", {
  default: false,
});

const initAttrs = () => {
  return {
    label: "",
    type: VariableType.Text,
    key: "",
    defaultValue: "",
    desc: "",
  };
};

const attrs = reactive<VariableAttrs>(initAttrs());

watch(
  () => props.currentVariableAttrs,
  (attributes) => {
    if (attrs) {
      Object.assign(attrs, attributes);
    }
  }
);

const allowTypes = computed(() => {
  const allTypes = Object.values(VariableType);
  if (props.exlude && props.exlude.length > 0) {
    return allTypes.filter((type) => !props.exlude!.includes(type));
  }
  return allTypes;
});

// 时间对象
const dateKeySubList = [
  {
    label: "年",
    key: "year",
  },
  {
    label: "月",
    key: "month",
  },
  {
    label: "日",
    key: "day",
  },
];
const dateKey = ref("");
const dateSubKey = ref(dateKeySubList[0].key);



// 布尔对象处理
const trueText = ref("");
const falseText = ref("");

// 选择框文本处理
const checkboxText = ref("");

// 处理变量类型改变
const handleUpdateType = (value: any) => {
  // 使用对象映射优化if/else结构
  const typeHandlers: Record<string, () => void> = {
    [VariableType.InnerVariable]: () => {
      if (props.innerVariable && props.innerVariable.length > 0) {
        attrs.key = `${props.innerVariable[0].key}.`;
      } else {
        attrs.label = "新变量";
        attrs.key = "";
        message.error("未配置内置变量");
      }
      attrs.defaultValue = "";
      attrs.data = undefined;
    },
    [VariableType.Date]: () => {
      attrs.key = "date.year";
      const now = new Date();
      attrs.defaultValue = now.getFullYear();
      dateKey.value = "date";
      dateSubKey.value = dateKeySubList[0].key;
      attrs.data = undefined;
    },
    [VariableType.Number]: () => {
      attrs.defaultValue = 0;
      attrs.data = undefined;
    },
    [VariableType.Money]: () => {
      attrs.defaultValue = 0.0;
      attrs.data = undefined;
    },

    [VariableType.CheckBox]: () => {
      attrs.defaultValue = false;
      checkboxText.value = "";
      attrs.data = checkboxText.value;
    },
    [VariableType.List]: () => {
      attrs.key = `${value}`;
      attrs.defaultValue = "";
      attrs.data = [];
    },
    [VariableType.Bollean]: () => {
      attrs.defaultValue = false;
      attrs.data = [];
    },
  };

  // 执行对应的处理函数或默认处理
  if (typeHandlers[value]) {
    typeHandlers[value]();
  } else {
    attrs.data = undefined;
    attrs.key = `${value}`;
  }
};

// 级联选择器的值
const cascaderValue = ref<string[]>([]);

// 内置变量处理
const innerVariablefFieldNames: CascaderProps["fieldNames"] = {
  label: "label",
  value: "key",
  children: "children",
};

const onInnerVariableChange: CascaderProps["onChange"] = (
  value,
  selectedOptions
) => {
  if (Array.isArray(value)) {
    attrs.key = value.join(".");
    cascaderValue.value = value as string[];
    if (
      selectedOptions &&
      Array.isArray(selectedOptions) &&
      selectedOptions.length > 0
    ) {
      const lastOption = selectedOptions[selectedOptions.length - 1];
      if (
        lastOption &&
        typeof lastOption === "object" &&
        "label" in lastOption
      ) {
        attrs.desc = lastOption.label as string;
        attrs.label = lastOption.label as string;
      }
    }
  }
};

const handleDateSubKeyChange = () => {
  attrs.key = `${dateKey.value}.${dateSubKey.value}`;
};

// 列表项
const listItems = ref<Array<string>>([]);
const addedItem = ref("");
const handleAddListItem = () => {
  if (!addedItem.value) return;
  listItems.value.push(addedItem.value);
  addedItem.value = "";
};

const handleDelListItem = (index: number) => {
  listItems.value.splice(index, 1);
};

const handleClick = () => {
  if (attrs.type == VariableType.List) {
    attrs.data = listItems.value;
  }
  if (attrs.type == VariableType.Bollean) {
    attrs.data = [trueText.value, falseText.value];
  }
  if (attrs.type == VariableType.CheckBox) {
    attrs.data = checkboxText.value;
  }
  emits("save", attrs);
  open.value = false;
  Object.assign(attrs, initAttrs());
};
</script>

<style scoped></style>
