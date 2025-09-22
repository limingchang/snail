import { PageHeaderOptions, PageHeaderAttributes } from "./pageHeader";
import { PageFooterOptions, PageFooterAttributes } from "./pageFooter";
import { PaperFormat, PaperOrientation, Margins } from "./public";

export interface PageOptions {
  paperFormat: PaperFormat;
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  orientation: PaperOrientation;
  pageGap: number; // Page gap in pixels
  HTMLAttributes: Record<string, any>;
}

export interface PageStorage{
  total:number
}

export interface PageAttributes {
  index: number;
  paperFormat: PaperFormat;
  orientation: PaperOrientation;
  margins: Margins;
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    page: {
      setPageMargins: (margins: Margins) => ReturnType;
      setPageFormat: (pageFormat: PaperFormat) => ReturnType;
      setPageOrientation: (orientation: "portrait" | "landscape") => ReturnType;
      insertPagination: () => ReturnType;
      addNewPage: () => ReturnType;
      autoPageBreak: () => ReturnType;
      setAutoPageBreak: (enabled: boolean) => ReturnType;
    };
  }
  interface Storage {
    page: PageStorage;
  }
}
