import { Extension } from "@tiptap/core";

interface LayoutModeOptions {
  /**
   * 默认布局样式名
   */
  calssName?: string;
  types: string[];
  HTMLAttributes: Record<string, any>;
}

export const LayoutMode = Extension.create<LayoutModeOptions>({
  name: "layoutMode",

  addOptions() {
    return {
      types: ["table"],
      calssName: "layout-mode",
      HTMLAttributes: {},
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: [...this.options.types, "table"],
        attributes: {
          layoutMode: {
            default: false,
            parseHTML: (element) =>
              element.getAttribute("data-layout-mode") || false,
            renderHTML: (attributes) => {
              if (!attributes.layoutMode) {
                return {};
              }
              return {
                "data-layout-mode": true,
                // style:"border-style: dashed;",
                class: this.options.calssName,
              };
            },
          },
        },
      },
    ];
  },
});
