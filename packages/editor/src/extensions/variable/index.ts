import { mergeAttributes, Node } from "@tiptap/core";
import { eventEmitter } from "../../eventEmitter";

// const { emit } = eventEmitter;
// console.log(eventEmitter)

export const Variable = Node.create({
  name: "variable",
  inline: true,
  group: "inline",
  isolating: true,
  content: "text*",

  addAttributes() {
    return {
      label: {
        default: "新变量",
      },
      type: {
        default: "text",
        renderHTML(attributes) {
          return {
            "data-variable-type": attributes.type,
          };
        },
      },
      key: {
        default: "key",
        renderHTML() {
          return {};
        },
      },
      desc: {
        default: "变量描述",
        renderHTML() {
          return {};
        },
      },
      defaultValue: {
        default: "默认值",
        renderHTML() {
          return {};
        },
      },
      data: {
        // 用于存储一些可以选择的值
        default: undefined,
        renderHTML() {
          return {};
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span", "data-type": this.name }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": this.name,
        "data-variable-type": node.attrs.type,
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const variable = document.createElement("span");
      variable.classList.add("tiptap-variable");
      variable.classList.add(`type-${node.attrs.type}`);
      variable.textContent = `{${node.attrs.label}}`;
      const clickHandle = (e: MouseEvent) => {
        eventEmitter.emit("variable:get", getPos(), node);
      };
      variable.addEventListener("click", clickHandle);
      return {
        dom: variable,
      };
    };
  },

  addCommands() {
    return {
      insertVariable:
        (attrs) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run();
        },
    };
  },
});
