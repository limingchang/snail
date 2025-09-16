import { Margins,defaultMargins } from "./index";
export interface FooterAttributes {
  height: string;
  text: string | ((index: number, total: number) => string);
  textPosition: "left" | "center" | "right";
  pageMargins: Margins;
  footerLine: boolean;
}


export const defaultFooterAttributes: FooterAttributes = {
  height: "50px",
  text: (index: number, total: number)=>`第 ${index} 页 , 共 ${total} 页`,
  textPosition: "center",
  pageMargins: defaultMargins,
  footerLine: false,
};