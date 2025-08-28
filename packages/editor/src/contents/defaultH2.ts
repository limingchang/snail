import type { Content } from "@tiptap/core";
import { boldMark, defaultH2StyleMark } from "./defaultMark";

export const defaultH2 = {
  type: "heading",
  attrs: {
    level: 2,
    textAlign: "left",
    textIndent: "0",
  },
  content: [
    {
      type: "text",
      text: "一、默认页面标题",
      marks: [boldMark, defaultH2StyleMark],
    },
  ],
};


 /**
  * @description: 生成json格式的tiptap h2 content
  *  * @param {string} text - 标题文本
  * @return {Content}
  */
export const createDefaultH2 = (text: string) => {
  return {
    type: "heading",
    attrs: {
      level: 2,
      textAlign: "left",
      textIndent: "0",
    },
    content: [
      {
        type: "text",
        text: text,
        marks: [boldMark, defaultH2StyleMark],
      },
    ],
  };
}