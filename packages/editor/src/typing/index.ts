import type { Content, Editor } from "@tiptap/core";
// import type { Editor } from "@tiptap/vue-3";
import type { VNode } from "vue";

import {
  VariableType,
  InnerVariableOptions,
} from "../extensions/variable/typing";

export interface CustomToolBar {
  title: string;
  tools: VNode;
}



export interface ToolVariableOptions {
  // editor?: Editor;
  exlude?: Array<VariableType>;
  innerVariable?: Array<InnerVariableOptions>;
}

export interface ToolBarOptions {
  // editor?: Editor;
  custom?: Array<CustomToolBar>;
  tools?: Array<string>;
  options?: {
    variable?:ToolVariableOptions
  };
}

/**
 * @description: 编辑器配置项
 * @property {"design" | "view"}[mode='design'] 设计模式design(默认) | 查看模式view(不可编辑，根据document渲染文档)
 * @property {Content}doc 查看模式下的文档内容
 * @property {}toolBars 工具栏配置列表，用于插入变量
 * @return {*}
 */
export interface EditorOptions {
  mode?: "design" | "view";
  doc?: Content;
  tools?:Array<string>
  options?: {
    variable?: ToolVariableOptions;
  };
}
