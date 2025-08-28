import { boldMark, defaultH1StyleMark } from "./defaultMark";

export const defaultH1 = {
  type: "heading",
  attrs: {
    level: 1,
    textAlign: "center",
    textIndent: "0",
  },
  content: [
    {
      type: "text",
      text: "默认页面标题",
      marks: [boldMark, defaultH1StyleMark],
    },
  ],
};


/**
 * @description: 生成json格式的tiptap h1 content
 * @param {string} text h1标题文本
 * @return {Recort<string, any>}
 */
export const createDefaultH1 = (text: string) => {
  return {
    type: "heading",
    attrs: {
      level: 1,
      textAlign: "center",
      textIndent: "0",
    },
    content: [
      {
        type: "text",
        text: text,
        marks: [boldMark, defaultH1StyleMark],
      },
    ],
  }
}