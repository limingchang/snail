import { mergeAttributes, Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'

import TipTapVariable from './Variable.vue'

import {VariableOptions} from './typing'

// type 定义命令类型
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      insertVariable: () => ReturnType
    }
  }
}

export const Variable = Node.create<VariableOptions>({
  name: 'variable',
  inline: true,
  group: "inline",
  content: "text*",
  isolating: true,

  addOptions() {
    return {
      mode:"design",
      HTMLAttributes: {},
    }
  },

  addAttributes(){
    return {
      label: {
        default: "新变量",
      },
      type: {
        default: "text",
      },
      key: {
        default: "key",
      },
      desc: {
        default: "变量描述",
      },
      defaultValue: {
        default: "默认值",
      },
    }
  },
   parseHTML() {
    return [
      {
        tag: 'Variable',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return VueNodeViewRenderer(TipTapVariable)
  },
  addCommands(){
    return {
      insertVariable:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
            })
            .selectNodeBackward()
            .run()
        },
    }
  }
})