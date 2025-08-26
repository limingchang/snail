import { Mark } from "@tiptap/core";

export const ParagraphStyle = Mark.create({
  name: "paragraphStyle",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          textIndent: {
            default: "0",
            parseHTML: (element) => element.style.textIndent,
            renderHTML: (attributes) => {
              return {
                style: `text-indent: ${attributes.textIndent};`,
              };
            },
          },
          paragraphStart:{
            default:'0',
            parseHTML:(element) =>element.style.marginBlockStart,
            renderHTML:(attributes)=> {
              if(!attributes.paragraphStart){
                return {};
              }
              return {
                style: `margin-block-start: ${attributes.paragraphStart}`,
              };
            },
          },
          paragraphEnd:{
            default:'0',
            parseHTML:(element) =>element.style.marginBlockEnd,
            renderHTML:(attributes)=> {
              if(!attributes.paragraphEnd){
                return {};
              }
              return {
                style: `margin-block-end: ${attributes.paragraphEnd}`,
              };
            },
          },
        },
      },
    ];
  },
});
