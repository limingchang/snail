export type PropertyTarget = { [key: string]: any } extends Object
  ? { [key: string]: any }
  : never;

export interface IJson {
  [key: string | symbol]: any;
}

export interface SnailModelInstance extends Object {
  toJson: () => IJson
}

export interface SnailModelInstanceArray extends Array<SnailModelInstance> {
  toJson: () => IJson[]
}

export type FromJsonReturnType<R extends IJson | IJson[]> =
  R extends IJson ? SnailModelInstance :
  R extends IJson[] ? SnailModelInstanceArray :
  never