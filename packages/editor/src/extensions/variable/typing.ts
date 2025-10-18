export enum VariableType {
  Text = "text",
  Number = "number",
  Money = "money",
  Bollean = "boolean",
  Object = "object",
  InnerVariable = "innerVariable",
  List = "list",
  CheckBox = "checkbox",
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

// type 定义命令类型
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      insertVariable: (attrs:VariableAttrs) => ReturnType
    }
  }
}