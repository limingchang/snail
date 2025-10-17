export enum VariableType {
  Text = "text",
  Number = "number",
  Money = "money",
  Bollean = "boolean",
  Object = "object",
  InnerVariable = "innerVariable",
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
  data?: any;
};

export interface InnerVariableOptions {
  label: string;
  key: string;
  children?: Array<InnerVariableOptions>;
}