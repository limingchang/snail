import {
  PaperSize,
  type PaperOrientation,
  type PaperFormat,
} from "../typing/paper";

/**
 * 纸张尺寸计算器，根据纸张类型和方向返回尺寸
 * @param {PaperFormat} paperFormat 格式化纸张类型
 * @param {PaperOrientation} orientation 纸张方向
 * @returns {{width: number, height: number}}
 */
export const calculatePaperSize = (
  paperFormat: PaperFormat,
  orientation: PaperOrientation = "portrait"
) => {
  if (typeof paperFormat === "string" && paperFormat in PaperSize) {
    const paperSize = PaperSize[paperFormat as keyof typeof PaperSize];
    return orientation === "portrait"
      ? { width: paperSize.width, height: paperSize.height }
      : { width: paperSize.height, height: paperSize.width };
  }
  if (
    typeof paperFormat === "object" &&
    paperFormat.width in PaperSize &&
    paperFormat.height in PaperSize
  ) {
    return orientation === "portrait"
      ? { width: paperFormat.width, height: paperFormat.height }
      : { width: paperFormat.height, height: paperFormat.width };
  }
  return { width: 210, height: 297 };
};
