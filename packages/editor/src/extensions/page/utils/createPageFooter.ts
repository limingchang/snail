import { Schema } from "@tiptap/pm/model";

import { createTextMark } from "./createTextMark";
import { createParagraph } from "./createParagraph";
import { PageFooterAttributes } from "../typing/pageFooter";
import { headerFooterTextCalculator } from "../utils/calculator";

export const createPageFooter = (
  schema: Schema,
  attrs: PageFooterAttributes,
  index: number,
  total: number
) => {
  const pageHeaderNodeType = schema.nodes["pageFooter"];
  const marks = createTextMark(schema);
  const text = headerFooterTextCalculator(index, total, attrs.textFormat);
  const textNode = schema.text(text, [marks]);
  const paragraphNode = createParagraph(
    schema,
    {
      textIndent: "0",
      paragraphStart: "0",
      paragraphEnd: "0",
      textAlign:attrs.align
    },
    [textNode]
  );

  return pageHeaderNodeType.create(attrs, [paragraphNode]);
};
