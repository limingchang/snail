import type { Content } from "@tiptap/core";
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



export interface SetVariableOptions {
  // editor?: Editor;
  exlude?: Array<VariableType>;
  innerVariable?: Array<InnerVariableOptions>;
}

export interface ToolBarOptions {
  // editor?: Editor;
  custom?: Array<CustomToolBar>;
  tools?: Array<string>;
  options?: {
    variable?:SetVariableOptions
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
  design?: boolean;
  doc?: Content;
  tools?:Array<string>
  options?: {
    variable?: SetVariableOptions;
  };
}

// 页码管理 Storage 接口
export interface PageStorage {
  // 页面索引映射表 - 记录每个页面节点的位置索引
  pageIndexMap: Map<number, number>;
  // 总页数
  totalPages: number;
  // 更新回调函数集合
  updateCallbacks: Set<() => void>;
  // 页面位置缓存
  pagePositions: Map<number, number>;
}

// 页眉页脚 Storage 接口
export interface HeaderFooterStorage {
  // 当前页码索引
  currentIndex: number;
  // 文本生成函数缓存
  textGenerator: ((index: number, total: number) => string) | null;
  // DOM 元素引用
  domElement: HTMLElement | null;
  // 页面节点引用
  pageNode: any;
}
