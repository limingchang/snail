export type TextAlign = "left" | "center" | "right" | "justify";

export interface PageHeaderFooterOptions {
  textFormat?: string;
  align?: TextAlign;
  height?: number;
  HTMLAttributes?: Record<string, any>;
}
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

export interface Margins {
  top: number | string;
  right: number | string;
  bottom: number | string;
  left: number | string;
}
