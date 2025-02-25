export type HandlerCommandFunc<T = any> =
  | ((context?: T) => void)
  | ((context?: T) => Promise<unknown>);
export type TextAlign = "left" | "center" | "right" | "justify";

export type TComputedBoolean<T = any> =
  | ((context?: T) => Promise<boolean>)
  | ((context?: T) => boolean);

export interface SPopUpMenuItemOptions<T = any> {
  label: string;
  icon?: string;
  hoverColor?: string;
  display?: TComputedBoolean | boolean;
  enabled?: TComputedBoolean | boolean;
  command: HandlerCommandFunc<T>;
}

export interface SPopUpMenuOptions{
  width?: number,
  align?: TextAlign,
  context?: object,
}