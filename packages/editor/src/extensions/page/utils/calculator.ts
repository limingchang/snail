import { defaultPaper } from "../constant/defaultPaper";
import type { PaperOrientation, PaperFormat } from "../typing/public";

/**
 * 纸张尺寸计算器，根据纸张类型和方向返回尺寸
 * @param {PaperFormat} paperFormat 格式化纸张类型
 * @param {PaperOrientation} orientation 纸张方向
 * @returns {{width: number, height: number}}
 */
export const paperSizeCalculator = (
  paperFormat: PaperFormat,
  orientation: PaperOrientation = "portrait"
) => {
  if (typeof paperFormat === "string" && paperFormat in defaultPaper) {
    const paperSize = defaultPaper[paperFormat as keyof typeof defaultPaper];
    return orientation === "portrait"
      ? { width: paperSize.width, height: paperSize.height }
      : { width: paperSize.height, height: paperSize.width };
  }
  if (
    typeof paperFormat === "object" &&
    paperFormat.width in defaultPaper &&
    paperFormat.height in defaultPaper
  ) {
    return orientation === "portrait"
      ? { width: paperFormat.width, height: paperFormat.height }
      : { width: paperFormat.height, height: paperFormat.width };
  }
  return { width: 210, height: 297 };
};
