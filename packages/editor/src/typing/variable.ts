import { VariableType } from "../extensions/variable/typing";
// 变量类型标签映射
export const typeLabels: Record<VariableType, string> = {
  [VariableType.Text]: "文本",
  [VariableType.Number]: "数字",
  [VariableType.Money]: "￥人民币",
  [VariableType.Bollean]: "布尔(是否)",
  [VariableType.InnerVariable]: "内置变量",
  [VariableType.Date]: "日期",
  [VariableType.List]: "列表",
  [VariableType.CheckBox]: "选择框",
  [VariableType.Object]: "普通对象",
};