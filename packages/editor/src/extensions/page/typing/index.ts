interface PageHeaderFooterOptions {
  text?: string | ((index:number,total:number) => string);
  position?: "left" | "center" | "right";
  height: number;
  HTMLAttributes: Record<string, any>;
}

export interface PageHeaderOptions extends PageHeaderFooterOptions {
  underline?: boolean;
}

export interface PageFooterOptions extends PageHeaderFooterOptions {
  upline?: boolean;
}

export interface PageOptions {
  pageHeaderText: string | ((index:number,total:number) => string);
  pageHeaderHeight?: number;
  pageHeaderPositon?: "left" | "center" | "right";
  pageHeaderLine:boolean,
  pageFooterText: string | ((index:number,total:number) => string);
  pageFooterHeight?: number;
  pageFooterPositon?: "left" | "center" | "right";
  pageFooterLine:boolean,
}
