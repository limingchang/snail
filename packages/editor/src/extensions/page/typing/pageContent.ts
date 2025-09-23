// import { PaperFormat } from "./public";
export interface PageContentOptions{
  HTMLAttributes: Record<string, any>;
}

export interface AutoPageBreakOptions {
  enabled?: boolean;
  breakThreshold?: number;
  preserveWords?: boolean;
  preserveParagraphs?: boolean;
  debounceDelay?: number;
  maxRetries?: number;
}

// type 定义命令类型
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageContent: {
      __flushContentPadding: () => ReturnType;
      enableAutoPageBreak: () => ReturnType;
      disableAutoPageBreak: () => ReturnType;
      triggerAutoPageBreak: () => ReturnType;
      configureAutoPageBreak: (options: AutoPageBreakOptions) => ReturnType;
      getAutoPageBreakStatus: () => ReturnType;
    };
  }
}