// export type IJson = {
//   [key: string]: any;
// };

export type IJson = Record<string, any>;

export type Entity<T extends Record<string, any>> = {
  [K in keyof T]: T[K];
} & {
  toJson(): {
    [K in keyof T]: T[K];
  };
};

// type loadEntity<Func extends Function, T extends IJson> = Func extends (
//   objOrArray: infer U extends T | Array<T>
// ) => unknown
//   ? U extends Array<T>
//     ? Array<Entity<T>>
//     : Entity<T>
//   : never;

type loadFunc<TClass extends IJson = IJson> = (
  objOrArray: TClass | Array<TClass>
) => Entity<TClass> | Array<Entity<TClass>>;

type loadEntity<Func extends Function = loadFunc> = Func extends (
  arg: infer U extends IJson | Array<IJson>
) => unknown
  ? U extends [infer V, ...unknown[]]
    ? (objArray: Array<V>) => Array<Entity<V & IJson>>
    : (obj: U) => Entity<U>
  : never;

export type SnailModel<T extends IJson> = {
  [K in keyof T]: T[K];
} & {
  fromJson: loadEntity<loadFunc<T>>;
};

export type SnailModelOptions = {
  name: string;
};

export type SnailFieldBaseOptions = {
  required?: boolean;
  default?: any;
};

export type SnailFieldOptions<T = any> = T extends {
  alias: string;
}
  ? { alias: string } & SnailFieldBaseOptions
  : T extends { prefix: string }
  ? { prefix: string } & SnailFieldBaseOptions
  : SnailFieldBaseOptions;
