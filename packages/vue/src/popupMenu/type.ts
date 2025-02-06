export type HandlerCommandFunc<T = any> =
  | ((context?: T) => void)
  | ((context?: T) => Promise<unknown>);
export type TextAlign = "left" | "center" | "right" | "justify";

export type TComputedEnabled<T = any> =
  | ((context?: T) => Promise<boolean>)
  | ((context?: T) => boolean);

export type TComputedDisplay = (() => Promise<boolean>) | (() => boolean);

export interface SPopUpMenuItemOptions<T = any> {
  label: string;
  icon?: string;
  hoverColor?: string;
  display?: TComputedDisplay | boolean;
  enabled?: TComputedEnabled | boolean;
  command: HandlerCommandFunc<T>;
}
