import { Schema } from "@tiptap/pm/model";
/**
 * 创建默认页头页脚字体样式mark

 */
export const createTextMark = (schema: Schema)=>{
  return schema.mark("textStyle", {
    fontSize: "9pt",
    lineHeight: "1",
    fontFamily: "KaiTi, serif",
  });
}