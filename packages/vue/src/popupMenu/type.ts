type HandlerClick<T> = (context?: T) => void;
export type TextAlign = "left" | "center" | "right" | "justify";
export interface SPopUpMenuItemOptions<T = any> {
  label: string;
  icon?: string;
  divider?: boolean;
  hoverColor?: string;
  display?: boolean;
  disabled?: boolean ;
  context?: T;
  click: HandlerClick<T>;
}
export interface SPopUpMenuOptions{
  width?: number;
  align?: TextAlign;
  // items: SnailPopUpMenuItem<T>[];
  permission?: (permissionFlag: string) => boolean;
}
