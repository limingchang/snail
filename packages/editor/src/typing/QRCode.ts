export interface IQRCodeOptions {
  text: string;
  src?: string; // 二维码数据URL，可选字段
  size: {
    value: number;
    unit: "mm" | "px" | "cm";
  };
  position: {
    x: number;
    y: number;
    unit: "mm" | "px" | "cm";
  };
}
