import { Margins } from "../typing/index";
export const createLocator = (
  name: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  margins: Margins
) => {
  const locator = document.createElement("div");
  locator.classList.add("page-locator", name);
  if (name === "top-left") {
    locator.style.borderRight = "1px solid #ccc";
    locator.style.borderBottom = "1px solid #ccc";
    locator.style.top = `calc(${margins.top} - 8mm)`;
    locator.style.left = `calc(${margins.left} - 8mm)`;
  }
  if (name === "top-right") {
    locator.style.borderLeft = "1px solid #ccc";
    locator.style.borderBottom = "1px solid #ccc";
    locator.style.top = `calc(${margins.top} - 8mm)`;
    locator.style.right = `calc(${margins.right} - 8mm)`;
  }
  if (name === "bottom-left") {
    locator.style.borderRight = "1px solid #ccc";
    locator.style.borderTop = "1px solid #ccc";
    locator.style.bottom = `calc(${margins.bottom} -  8mm)`;
    locator.style.left = `calc(${margins.left} - 8mm)`;
  }
  if (name === "bottom-right") {
    locator.style.borderLeft = "1px solid #ccc";
    locator.style.borderTop = "1px solid #ccc";
    locator.style.bottom = `calc(${margins.bottom} - 8mm)`;
    locator.style.right = `calc(${margins.right} - 8mm)`;
  }
  return locator;
};
