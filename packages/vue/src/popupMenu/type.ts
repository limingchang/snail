type HandlerClick<T> = (context?: T) => void;
export type TextAlign = "left" | "center" | "right" | "justify";

export interface SPopUpMenuItemOptions<T = any> {
  label: string;
  icon?: string;
  hoverColor?: string;
  display?:
    | boolean
    | ((context?: T) => Promise<boolean>)
    | ((context?: T) => boolean);
  disabled?:
    | boolean
    | ((context?: T) => Promise<boolean>)
    | ((context?: T) => boolean);
  context?: T;
  click: HandlerClick<T>;
}
// export interface SPopUpMenuOptions {
//   width?: number;
//   align?: TextAlign;
  // items: SnailPopUpMenuItem<T>[];
// }
