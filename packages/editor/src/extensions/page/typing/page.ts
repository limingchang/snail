import {PaperFormat} from './paper'
interface PageHeaderFooterOptions {
  text?: string | ((index: number, total: number) => string);
  align?: "left" | "center" | "right";
  height?: number;
  // HTMLAttributes?: Record<string, any>;
}

export interface PageHeaderOptions extends PageHeaderFooterOptions {
  headerLine?: boolean;
}

export interface PageFooterOptions extends PageHeaderFooterOptions {
  footerLine?: boolean;
}

export interface PageOptions {
  paperFormat: PaperFormat;
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  pageGap?: number; // Page gap in pixels
  HTMLAttributes?: Record<string, any>;
}