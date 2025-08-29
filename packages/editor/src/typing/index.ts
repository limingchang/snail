import type { Content } from "@tiptap/core";
import type { Editor } from "@tiptap/vue-3";
import type { VNode } from "vue";

export interface CustomToolBar {
  title: string;
  tools: VNode;
}

export interface ToolBarOptions {
  editor?: Editor;
  custom?: Array<CustomToolBar>;
}

/**
 * @description: 编辑器配置项
 * @property {"design" | "view"}[mode='design'] 设计模式design(默认) | 查看模式view(不可编辑，根据document渲染文档)
 * @property {Content}doc 查看模式下的文档内容
 * @property {}innerObject 内置对象列表，用于插入变量
 * @return {*}
 */
export interface EditorOptions {
  mode?: "design" | "view";
  doc?: Content;
  innerObject?:any
}
