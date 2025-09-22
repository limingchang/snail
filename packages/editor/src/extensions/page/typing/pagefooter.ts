import { PageHeaderFooterOptions } from "./public";
import {TextAlign} from "./public"
export interface PageFooterOptions extends PageHeaderFooterOptions {
  footerLine?: boolean;
}

export interface PageFooterAttributes {
  align: TextAlign;
  height: number;
  textFormat:string;
  footerLine: boolean;
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageFooter: {
      __flushFooter: () => ReturnType;
    };
  }
}