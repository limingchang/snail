import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { PaperFormat, PaperOrientation } from "./paper";
export enum Units {
  mm = "mm",
  cm = "cm",
  inch = "in",
  pt = "pt",
  em = "em",
  px = "px",
}

interface PageHeaderFooterOptions {
  text?: string | ((index: number, total: number) => string);
  position?: "left" | "center" | "right";
  height?: number;
  HTMLAttributes?: Record<string, any>;
}

export interface PageHeaderOptions extends PageHeaderFooterOptions {
  headerLine?: boolean;
}

export interface PageFooterOptions extends PageHeaderFooterOptions {
  footerLine?: boolean;
}

export interface Margins  {
  top: number | `${number}${Units}`;
  right: number | `${number}${Units}`;
  bottom: number | `${number}${Units}`;
  left: number | `${number}${Units}`;
};

export const defaultMargins: Margins = {
  top: "20mm",
  right: "20mm",
  bottom: "20mm",
  left: "20mm",
};

export interface PageAttributes {
  index: number;
  paperFormat: PaperFormat;
  orientation: PaperOrientation;
  margins: Margins;
}

export interface PageOptions {
  paperFormat: PaperFormat;
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  pageGap?: number; // Page gap in pixels
  HTMLAttributes?: Record<string, any>;
}

// 页边距预设接口
export interface MarginPreset {
  name: string;
  iconClass: string;
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

// 纸张方向接口
// export interface PaperOrientation {
//   value: "portrait" | "landscape";
//   label: string;
//   icon: any;
// }

// 纸张大小接口
export interface PaperSize {
  name: string;
  width: number;
  height: number;
  label: string;
}

// 页面设置状态接口
export interface PageSettings {
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  orientation: "portrait" | "landscape";
  paperFormat: PaperFormat;
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
    };
  }
}
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageHeader: {
      _flushHeader: (pageNode: ProseMirrorNode, pagePos: number) => ReturnType;
    };
  }
}
