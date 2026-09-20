<script setup lang="ts">
/**
 * 九种变量类型：直接读 `VARIABLE_TYPES`，所以这份列表不可能和源码里的类型集合脱节。
 *
 * 「填写控件」一列描述的是填写对话框渲染什么（`components/FillVariableDialog.vue`），
 * 「文档中显示」一列描述的是节点视图在填写模式下画什么（`extensions/variable/nodeView.ts`）。
 */
import { VARIABLE_TYPES } from "@snail-js/editor";

interface TypeRow {
  type: string;
  name: string;
  control: string;
  display: string;
}

/** 类型的展示名，只影响本文档的表格。 */
const NAMES: Record<string, string> = {
  text: "文本",
  number: "数字",
  money: "金额",
  boolean: "布尔",
  date: "日期",
  select: "选项",
  image: "图片 / 签名",
  formula: "公式",
  system: "系统"
};

const CONTROL: Record<string, string> = {
  text: "单行输入框，`maxLength` 触发计数器",
  number: "数字输入框，应用 `min` / `max` / `precision`",
  money: "金额输入框，前置 `currency` 符号",
  boolean: "开关，两端是 `trueText` / `falseText`",
  date: "日期选择器，占位符是 `format`",
  select: "下拉框；`options` 为空时退化为自由输入",
  image: "上传按钮，或 `source: \"signature\"` 时的签名板",
  formula: "只读，显示计算结果",
  system: "只读，显示系统值"
};

const DISPLAY: Record<string, string> = {
  text: "按 `maxLength` 截断后的文本",
  number: "按 `precision` / `thousands` 格式化",
  money: "`currency` + 千分位；可选中文大写",
  boolean: "`trueText` 或 `falseText`",
  date: "按 `format` 替换 `YYYY` `MM` `DD` `HH` `mm` `ss`",
  select: "选中的 `label`；多选按 `joinWith` 连接",
  image: "`<img>`，宽度取 `width`",
  formula: "`prefix` + 结果 + `suffix`",
  system: "见系统变量的取值表"
};

const rows: TypeRow[] = VARIABLE_TYPES.map((type) => ({
  type,
  name: NAMES[type] ?? type,
  control: CONTROL[type] ?? "",
  display: DISPLAY[type] ?? ""
}));
</script>

<template>
  <div class="demo-variable-types">
    <table>
      <thead>
        <tr>
          <th>类型</th>
          <th>填写对话框</th>
          <th>文档中显示</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.type">
          <td>
            <code>{{ row.type }}</code>
            <span class="demo-variable-types__name">{{ row.name }}</span>
          </td>
          <td>{{ row.control }}</td>
          <td>{{ row.display }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.demo-variable-types {
  overflow-x: auto;
  font-size: 13px;
}

.demo-variable-types table {
  width: 100%;
  border-collapse: collapse;
}

.demo-variable-types th,
.demo-variable-types td {
  padding: 8px 10px;
  border: 1px solid var(--vp-c-divider);
  text-align: left;
  vertical-align: top;
}

.demo-variable-types__name {
  display: block;
  color: var(--vp-c-text-2);
}
</style>
