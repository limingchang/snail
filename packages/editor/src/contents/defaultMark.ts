import type { Content } from "@tiptap/core";

export const boldMark: Content = {
  type: "bold",
};

export const italicMark: Content = {
  type: "italic",
};

export const underlineMark: Content = {
  type: "underline",
};

export const defaultH1StyleMark = {
  type: "textStyle",
  attrs: {
    fontSize: "18pt",
    lineHeight: "2",
    fontFamily: "SimHei, sans-serif",
  },
}

export const defaultH2StyleMark = {
  type: "textStyle",
  attrs: {
    fontSize: "15pt",
    lineHeight: "1.5",
    fontFamily: "KaiTi, serif",
  },
};

export const defaultTextStyleMark = {
  type: "textStyle",
  attrs: {
    fontSize: "14pt",
    lineHeight: "28pt",
    fontFamily: "SimSun, serif",
  },
};