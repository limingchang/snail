type HandlerClick<T> =
  | ((context?: T) => void)
  | ((context?: T) => Promise<unknown>);
export type TextAlign = "left" | "center" | "right" | "justify";

export interface SPopUpMenuItemOptions<T = any> {
  label: string;
  icon?: string;
  hoverColor?: string;
  display?:
    | boolean
    | ((context?: T) => Promise<boolean>)
    | ((context?: T) => boolean);
  enabled?:
    | boolean
    | ((context?: T) => Promise<boolean>)
    | ((context?: T) => boolean);
  click: HandlerClick<T>;
}
// export interface SPopUpMenuOptions {
//   width?: number;
//   align?: TextAlign;
// items: SnailPopUpMenuItem<T>[];
// }
