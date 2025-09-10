interface PageHeaderFooterOptions {
  text?: string | ((index: number, total: number) => string);
  position?: "left" | "center" | "right";
  height?: number;
  HTMLAttributes?: Record<string, any>;
}

export interface PageHeaderOptions extends PageHeaderFooterOptions {
  underline?: boolean;
}

export interface PageFooterOptions extends PageHeaderFooterOptions {
  upline?: boolean;
}

export interface PageFormat {
  name: string;
  width: number; // Width in pixels
  height: number; // Height in pixels
  // margins: {
  //   top: number; // Margin in pixels
  //   right: number; // Margin in pixels
  //   bottom: number; // Margin in pixels
  //   left: number; // Margin in pixels
  // };
}
export const PaperSize = {
  A4: { name: "A4", width: 210, height: 297 },
  A3: { name: "A3", width: 297, height: 420 },
  A5: { name: "A5", width: 148, height: 210 },
  Letter: { name: "Letter", width: 216, height: 279 },
  Legal: { name: "Legal", width: 216, height: 356 },
} as const;

export interface PageOptions {
  pageFormat: "A4" | "A3" | "A5" | "Legal" | "Letter" | PageFormat;
  header?: PageHeaderOptions;
  footer?: PageFooterOptions;
  pageGap?: number; // Page gap in pixels
  HTMLAttributes?: Record<string, any>;
}
