import { Schema, Node, Fragment } from "@tiptap/pm/model";

interface ParagraphAttributes {
  textIndent: string;
  paragraphStart: string;
  paragraphEnd: string;
  textAlign?: string;
}

export const createParagraph = (
  schema: Schema,
  attrs: ParagraphAttributes,
  content?: Fragment | Node | readonly Node[] | null
) => {
  const paragraphNodeType = schema.nodes["paragraph"];
  return paragraphNodeType.create(attrs, content);
};
