import { Schema } from "@tiptap/pm/model";
import { createParagraph } from "./createParagraph";

export const createPageContent = (schema: Schema, attrs: any) => {
  const pageContentNodeType = schema.nodes["pageContent"];
  const emptyParagraph = createParagraph(
    schema,
    {
      textIndent: "0",
      paragraphStart: "0.5em",
      paragraphEnd: "0.5em",
    },
    []
  );
  return pageContentNodeType.create(attrs, [emptyParagraph]);
};
