import { PageHeaderOptions } from "./pageHeader";
import { PageFooterOptions } from "./pagefooter";
import { PaperFormat } from "./public";

export interface PageOptions {
  paperFormat: PaperFormat;
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  orientation: "portrait" | "landscape";
  pageGap: number; // Page gap in pixels
  HTMLAttributes: Record<string, any>;
}
