export interface PageHeaderFooterOptions {
  text?: string | ((index: number, total: number) => string);
  align?: "left" | "center" | "right";
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
