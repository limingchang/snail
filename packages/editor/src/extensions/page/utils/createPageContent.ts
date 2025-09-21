import { Schema } from "@tiptap/pm/model";

export const createPageContent = (schema: Schema, attrs: any) => {
  const pageContentNodeType = schema.nodes["pageContent"];
  const paragraphNodeType = schema.nodes["paragraph"];
  const text = schema.text("123");
  const emptyParagraph = paragraphNodeType.create(null, [text]);
  return pageContentNodeType.create(attrs, [emptyParagraph]);
};
