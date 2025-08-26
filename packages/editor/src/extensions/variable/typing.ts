export enum VariableType {
  Text = "text",
  Number = "number",
  Money = "money",
  Bollean = "boolean",
  Object = "object",
  InnerObject = "innerObject",
  List = "list",
  Radio = "radio",
  Date = "date",
}

export type VariableAttrs = {
  label: string;
  type: VariableType;
  key: string;
  desc?: string;
  defaultValue?: any;
  value?: any;
};

export interface VariableOptions{
  mode:"design"|'view'
}