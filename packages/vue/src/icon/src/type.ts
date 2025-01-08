import type { TIconNames } from "@snail-js/vue";
import { IconNames } from "@snail-js/vue";

export enum IconType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  DANGER = "danger",
  PRIMARY = "primary",
}

export enum IconSize {
  LARGE = "large",
  NORMAL = "normal",
  SMALL = "small",
}

import type { VNode } from "vue";
export interface SELIconPropsType {
  icon: TIconNames | VNode;
  // class?: string;
  color?: string;
  size?: IconSize | number;
}
export interface SIconPropsType {
  icon: typeof IconNames[number];
  color?: string;
  size?: IconSize | number;
}
