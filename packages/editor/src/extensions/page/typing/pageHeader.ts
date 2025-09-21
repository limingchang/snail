import { PageHeaderFooterOptions } from "./public";

export interface PageHeaderOptions extends PageHeaderFooterOptions {
  headerLine?: boolean;
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageHeader: {

      __flushHeader: () => ReturnType;
    };
  }
}