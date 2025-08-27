declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphStyle: {
      /**
       * 设置段落样式
       * @param textIndent 文本缩进值
       * @example editor.commands.setTextIndent('2em')
       */
      setParagraphStyle: (attrs: Attrs) => ReturnType;
      /**
       * 取消文本缩进
       * @example editor.commands.unsetTextIndent()
       */
      // unsetTextIndent: () => ReturnType;
    };
  }
}

export interface Attrs {
  textIndent?: string;
  paragraphStart?: string;
  paragraphEnd?: string;
}

export interface Options {
  types: string[];
  HTMLAttributes: Record<string, any>;
}
