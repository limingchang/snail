import type { TIconNames } from "@snail-js/theme-chalk";

export enum IconType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  DANGER = "danger",
  PRIMARY = "primary",
}

export enum  IconSize {
  LARGE = "large",
  NORMAL = "normal",
  SMALL = "small",
}

import type { VNode } from "vue";
export interface IconPropsType {
  icon: TIconNames | VNode;
  // class?: string;
  color?: string
  size?: IconSize | number;
}
