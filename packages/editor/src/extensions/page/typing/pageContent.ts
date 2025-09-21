// import { PaperFormat } from "./public";
export interface PageContentOptions{
  HTMLAttributes: Record<string, any>;
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageContent: {
      __flushContentPadding: () => ReturnType;
    };
  }
}