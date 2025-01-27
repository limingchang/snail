export type HandlerCommandFunc<T = any> =
  | ((context?: T) => void)
  | ((context?: T) => Promise<unknown>);
export type TextAlign = "left" | "center" | "right" | "justify";

export type TComputedStatus<T=any> =
  | ((context?: T) => Promise<boolean>)
  | ((context?: T) => boolean);

export interface SPopUpMenuItemOptions<T = any> {
  label: string;
  icon?: string;
  hoverColor?: string;
  display?: TComputedStatus | boolean;
  enabled?: TComputedStatus | boolean;
  command: HandlerCommandFunc<T>;
}
// export interface SPopUpMenuOptions {
//   width?: number;
//   align?: TextAlign;
// items: SnailPopUpMenuItem<T>[];
// }
