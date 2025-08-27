import { Extension } from "@tiptap/core";

import { Options } from "./typing";

export const ParagraphStyle = Extension.create<Options>({
  name: "paragraphStyle",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
      HTMLAttributes: {},
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
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
          paragraphStart: {
            default: "0",
            parseHTML: (element) => element.style.marginBlockStart,
            renderHTML: (attributes) => {
              if (!attributes.paragraphStart) {
                return {};
              }
              return {
                style: `margin-block-start: ${attributes.paragraphStart}`,
              };
            },
          },
          paragraphEnd: {
            default: "0",
            parseHTML: (element) => element.style.marginBlockEnd,
            renderHTML: (attributes) => {
              if (!attributes.paragraphEnd) {
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

  addCommands() {
    return {
      setParagraphStyle:
        (attrs) =>
        ({ tr, state, dispatch, editor }) => {
          const { doc, selection } = state;
          const { from, to } = selection;
          let hasChanges = false;
          // 收集需要更新的节点信息
          const nodesToUpdate: Array<{ pos: number; attrs: Record<string, any>; nodeType: string }> = [];
          doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const newAttrs: Record<string, any> = {};
              let hasAttrChanges = false;
              // 检查各个属性是否需要更新
              Object.keys(attrs).forEach((key) => {
                const value = attrs[key as keyof typeof attrs];
                if (value !== undefined && node.attrs[key] !== value) {
                  // 验证属性是否在节点的schema中定义
                  const hasAttr = node.type.spec.attrs && node.type.spec.attrs[key];
                  if (hasAttr) {
                    newAttrs[key] = value;
                    hasAttrChanges = true;
                  }
                }
              });
              
              if (hasAttrChanges) {
                nodesToUpdate.push({ pos, attrs: newAttrs, nodeType: node.type.name });
              }
            }
          });
          // 如果没有可更新的节点，返回 false
          if (nodesToUpdate.length === 0) {
            console.log('没有需要更新的节点');
            return false;
          }
          // 批量更新属性
          try {
            nodesToUpdate.forEach(({ pos, attrs: nodeAttrs, nodeType }) => {
              Object.keys(nodeAttrs).forEach((key) => {
                tr.setNodeAttribute(pos, key, nodeAttrs[key]);
              });
            });
            hasChanges = true;
          } catch (error) {
            return false;
          }
          
          if (hasChanges && dispatch) {
            dispatch(tr);
          }
          
          return hasChanges;
        },
    };
  },
});
