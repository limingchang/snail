import { Schema } from "@tiptap/pm/model";

export const createPageHeader = (schema: Schema, attrs: any) => {
  const pageHeaderNodeType = schema.nodes["pageHeader"];
  const marks = schema.mark("textStyle", {
    fontSize: "9pt",
    lineHeight: "1",
    fontFamily: "KaiTi, serif",
  });
  const textNode = schema.text(attrs.text || " ", [marks]);

  return pageHeaderNodeType.create(attrs, textNode);
};
