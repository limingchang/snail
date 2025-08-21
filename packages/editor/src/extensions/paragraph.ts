import { mergeAttributes, Node } from "@tiptap/core";
import { Paragraph } from "@tiptap/extension-paragraph";

export interface CustomParagraphOptions {
  /**
   * The HTML attributes for a paragraph node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    customParagraph: {
      /**
       * Toggle a custom paragraph
       * @example editor.commands.setCustomParagraph()
       */
      setCustomParagraph: () => ReturnType;
    };
  }
}

/**
 * This extension extends the default Paragraph extension
 * to properly handle text-indent attribute rendering.
 */
export const ParagraphPro = Paragraph.extend<CustomParagraphOptions>({
  name: "paragraph",

  priority: 1001,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          textIndent: {
            default: "2em",
            parseHTML: (element) => element.style.textIndent,
            renderHTML: (attributes) => {
              // console.log("text-indent|render:", attributes);
              if (!attributes.textIndent) {
                return {};
              }

              // 确保样式格式正确，并且不会覆盖其他样式
              return {
                style: `text-indent: ${attributes.textIndent};`,
              };
            },
          },
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { textIndent } = node.attrs;
    // Create base attributes
    const baseAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    // console.log(baseAttrs);
    // If textIndent is present, add it to style
    if (textIndent) {
      const style = baseAttrs.style || "";
      // Ensure style ends with semicolon if it's not empty
      const normalizedStyle = style ? style.replace(/;?$/, ";") : "";
      // Add text-indent style
      // 查找normalizedStyle中的text-indent,匹配到分号,则替换,否则添加
      if (normalizedStyle.match(/text-indent:/)) {
        baseAttrs.style = normalizedStyle.replace(/text-indent:.*/, `text-indent: ${textIndent};`);
      } else {
        baseAttrs.style = `${normalizedStyle}text-indent: ${textIndent};`;
      }
    } else {
      const style = baseAttrs.style || "";
      const normalizedStyle = style ? style.replace(/;?$/, ";") : "";
      // 查找normalizedStyle中的text-indent,匹配到分号,则替换,否则添加
      if (normalizedStyle.match(/text-indent:/)) {
        baseAttrs.style = normalizedStyle.replace(/text-indent:.*/, "");
      }
    }

    return ["p", baseAttrs, 0];
  },

  addCommands() {
    return {
      setCustomParagraph:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name);
        },
    };
  },
});
