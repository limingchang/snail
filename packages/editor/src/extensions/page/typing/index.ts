import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

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

export type PageFormat =
  | "A4"
  | "A3"
  | "A5"
  | "Legal"
  | "Letter"
  | {
      name: string;
      width: number; // Width in pixels
      height: number; // Height in pixels
    };
export const PaperSize = {
  A4: { name: "A4", width: 210, height: 297 },
  A3: { name: "A3", width: 297, height: 420 },
  A5: { name: "A5", width: 148, height: 210 },
  Letter: { name: "Letter", width: 216, height: 279 },
  Legal: { name: "Legal", width: 216, height: 356 },
} as const;

export interface PageOptions {
  pageFormat: PageFormat;
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  pageGap?: number; // Page gap in pixels
  HTMLAttributes?: Record<string, any>;
}

type Margins = {
  top?: `${number}${Units}`;
  right?: `${number}${Units}`;
  bottom?: `${number}${Units}`;
  left?: `${number}${Units}`;
};


// 页边距预设接口
export interface MarginPreset {
  name: string
  iconClass: string
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

// 纸张方向接口
export interface PaperOrientation {
  value: 'portrait' | 'landscape'
  label: string
  icon: any
}

// 纸张大小接口
export interface PaperSize {
  name: string
  width: number
  height: number
  label: string
}

// 页面设置状态接口
export interface PageSettings {
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
  orientation: 'portrait' | 'landscape'
  paperSize: string
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    page: {
      setPageMargins: (margins: Margins) => ReturnType;
      setPageFormat: (pageFormat: PageFormat) => ReturnType;
      setPageOrientation: (orientation: "portrait" | "landscape") => ReturnType;
      insertPagination: () => ReturnType;
      addNewPage: () => ReturnType;
    };
  }
}
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageHeader: {
      _flushHeader: (pageNode: ProseMirrorNode,pagePos:number) => ReturnType;
    };
  }
}