import { Extension } from '@tiptap/core'

/**
 * 文本缩进选项
 */
export type TextIndentOptions = {
  /**
   * 可以应用文本缩进的节点名称列表
   * @default ['paragraph']
   * @example ['heading', 'paragraph']
   */
  types: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textIndent: {
      /**
       * 设置文本缩进
       * @param textIndent 文本缩进值
       * @example editor.commands.setTextIndent('2em')
       */
      setTextIndent: (textIndent: string) => ReturnType
      /**
       * 取消文本缩进
       * @example editor.commands.unsetTextIndent()
       */
      unsetTextIndent: () => ReturnType
    }
  }
}

/**
 * 此扩展允许您设置段落的缩进
 */
export const TextIndent = Extension.create<TextIndentOptions>({
  name: 'textIndent',

  addOptions() {
    return {
      types: ['paragraph'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textIndent: {
            default: '2em',
          },
        },
      },
    ]
  },

  addCommands() {
    // 通用处理函数，减少重复代码
    const updateTextIndent = (textIndent: string | null) =>
      ({ state, dispatch }: { state: any, dispatch: any }) => {
        if (!dispatch) return true;

        const { selection } = state;
        const { from, to } = selection;
        const newTr = state.tr;
        let updated = false;

        // 处理选择范围内的所有段落
        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (this.options.types.includes(node.type.name)) {
            newTr.setNodeAttribute(pos, 'textIndent', textIndent);
            updated = true;
          }
        });

        if (updated) {
          dispatch(newTr);
        }

        return updated;
      };

    return {
      setTextIndent: (textIndent: string) => updateTextIndent(textIndent),
      unsetTextIndent: () => updateTextIndent(null),
    }
  },
})