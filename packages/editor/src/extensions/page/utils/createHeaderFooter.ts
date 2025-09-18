import { Margins } from "../typing/index";
interface Options {
  text: string | ((index: number, total: number) => string);
  align: "left" | "center" | "right";
  height: number;
  line: boolean;
}

export const createHeader = (
  options: Options,
  margins: Margins,
  index: number = 1,
  total: number = 1
) => {
  const ele = document.createElement("div");
  ele.classList.add("page-header");
  ele.style.textAlign = options.align;
  ele.style.height = `${options.height}px`;
  ele.style.width = `calc(100% - ${margins.left} - ${margins.right})`;
  ele.style.lineHeight = `${options.height}px`;
  ele.style.position = "absolute";
  ele.style.fontSize = "9pt";
  ele.style.border = "1px solid #fff";
  ele.style.borderBottom = options.line ? "1px solid #000" : "1px solid #fff";
  ele.style.top =
    typeof margins.top === "number"
      ? `calc(${margins.top}px - ${options.height}px - 2px)`
      : `calc(${margins.top} - ${options.height}px - 2px)`;
  // ele.style.left =
  //   typeof margins.left === "number"
  //     ? `${margins.left}px`
  //     : margins.left;
  ele.style.left =`calc(${typeof margins.left === "number" ? `${margins.left}px` : margins.left} + 1px)`
  ele.innerText =
    typeof options.text === "string"
      ? options.text
      : options.text(index, total);
  
  return ele;
};

export const createFooter = (
  options: Options,
  margins: Margins,
  index: number = 1,
  total: number = 1
) => {
  const ele = document.createElement("div");
  ele.classList.add("page-footer");
  ele.style.textAlign = options.align;
  ele.style.height = `${options.height}px`;
  ele.style.width = `calc(100% - ${
    typeof margins.left === "number" ? `${margins.left}px` : margins.left
  } - ${
    typeof margins.right === "number" ? `${margins.right}px` : margins.right
  })`;
  ele.style.lineHeight = `${options.height}px`;
  ele.style.position = "absolute";
  ele.style.fontSize = "9pt";
  ele.style.border = "1px solid #fff";
  ele.style.borderTop = options.line ? "1px solid #000" : "1px solid #fff";
  ele.style.left =`calc(${typeof margins.left === "number" ? `${margins.left}px` : margins.left} + 1px)`
  
  ele.style.bottom =
    typeof margins.bottom === "number"
      ? `calc(${margins.bottom}px - ${options.height}px - 2px)`
      : `calc(${margins.bottom} - ${options.height}px - 2px)`;
  ele.innerText =
    typeof options.text === "string"
      ? options.text
      : options.text(index, total);
  return ele;
};
