export interface IQRCodeOptions {
  text: string;
  size: {
    value: number;
    unit: "mm" | "px";
  };
  position: {
    x: number;
    y: number;
    unit: "mm" | "px";
  };
}
