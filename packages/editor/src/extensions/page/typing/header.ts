import { Margins,defaultMargins } from "./index";
export interface HeaderAttributes {
  height: string;
  text: string | ((index: number, total: number) => string);
  textPosition: "left" | "center" | "right";
  pageMargins: Margins;
  headerLine: boolean;
}


export const defaultHeaderAttributes: HeaderAttributes = {
  height: "50px",
  text: "页眉",
  textPosition: "center",
  pageMargins: defaultMargins,
  headerLine: true,
};