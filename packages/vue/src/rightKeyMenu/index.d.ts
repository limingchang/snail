type HandlerCommand<T> = (context: T) => void;
type SetDisabled<T> = (context: T) => boolean | Promise<boolean>;
type TextAlign = "left" | "center" | "right" | "justify";
export interface SnailRightKeyMenuItem<T = any> {
    label: string;
    icon?: string;
    divider?: boolean;
    hoverColor?: string;
    permission?: string;
    disabled?: boolean | SetDisabled<T>;
    command: HandlerCommand<T>;
}
export interface SnailRightKeyMenuOptions<T = any> {
    width?: number;
    align?: TextAlign;
    items: SnailRightKeyMenuItem<T>[];
    checkPermission?: (permissionFlag: string) => boolean;
}
export declare const SnailRightKeyMenu: <R = any>(options: SnailRightKeyMenuOptions<typeof context>, context?: R) => Promise<void>;
export {};
