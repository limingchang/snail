export type PropertyTarget = { [key: string]: any } extends Object
  ? { [key: string]: any }
  : never;

export interface IJson {
  [key: string | symbol]: any;
}
