import { Margins } from "./index";
import { PageHeaderOptions, PageFooterOptions } from "./page";
export type PaperOrientation = "portrait" | "landscape";

export type PaperFormat =
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

export interface PaperOptions {
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  paperFormat?: PaperFormat;
}

export interface PaperAttributes {
  index: number;
  paperFormat: PaperFormat;
  orientation: PaperOrientation;
  margins: Margins;
  header: PageHeaderOptions;
  footer: PageFooterOptions;
}
