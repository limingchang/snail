
type HandlerClick<T> = (context?: T) => void;
type SetDisabled<T> = (context: T) => boolean | Promise<boolean>;
export type TextAlign = "left" | "center" | "right" | "justify";
export interface SnailPopUpMenuItem<T = any> {
  label: string;
  icon?: string;
  divider?: boolean;
  hoverColor?: string;
  permission?: string;
  disabled?: boolean | SetDisabled<T>;
  click: HandlerClick<T>;
}
export interface SnailPopUpMenuItemOptions<T = any> {
  width?: number;
  align?: TextAlign;
  items: SnailPopUpMenuItem<T>[];
  permission?: (permissionFlag: string) => boolean;
}
