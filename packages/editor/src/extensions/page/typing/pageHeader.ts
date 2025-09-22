import { PageHeaderFooterOptions } from "./public";
import {TextAlign} from './public'
export interface PageHeaderOptions extends PageHeaderFooterOptions {
  headerLine?: boolean;
}

export interface PageHeaderAttributes {
  align: TextAlign;
  height: number;
  textFormat: string;
  headerLine: boolean;
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageHeader: {
      __flushHeader: () => ReturnType;
    };
  }
}
