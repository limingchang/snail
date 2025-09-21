import {
  boldMark,
  italicMark,
  underlineMark,
  defaultTextStyleMark,
} from "./defaultMark";

import { defaultVariable } from "./defaultVariable";

export const defaultIntroductionParagraph = {
  type: "paragraph",
  attrs: {
    textAlign: "justify",
    textIndent: "2em",
    paragraphStart: "0.5em",
  },
  content: [
    {
      type: "text",
      text: "这是基于TipTap3.0创建的编辑器,支持文本",
      marks: [defaultTextStyleMark],
    },
    {
      type: "text",
      text: "加粗、",
      marks: [boldMark, defaultTextStyleMark],
    },
    {
      type: "text",
      text: "斜体、",
      marks: [italicMark, defaultTextStyleMark],
    },
    {
      type: "text",
      text: "下划线",
      marks: [underlineMark, defaultTextStyleMark],
    },
    {
      type: "text",
      text: "以及基础的段落设置,如缩进、段落间距、对齐方式等。",
      marks: [defaultTextStyleMark],
    },
  ],
};

export const defaultFeatureParagraph = {
  type: "paragraph",
  attrs: {
    textAlign: "justify",
    textIndent: "2em",
  },
  content: [
    {
      type: "text",
      text: "你可以在设计模式插入",
      marks: [defaultTextStyleMark],
    },
    defaultVariable,
    {
      type: "text",
      text: "、普通表格、布局表格、二维码",
      marks: [boldMark, defaultTextStyleMark],
    },
    {
      type: "text",
      text: "，在查看模式下，变量将替换为传入的json数据；布局表格在查看模式下，将不会显示边框，仅用作内容分栏布局。",
      marks: [defaultTextStyleMark],
    },
  ],
};
