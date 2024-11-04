import { SnailModel, Entity, IJson } from "./types";
import { getModelMeta } from "./utils";

function parse<T extends IJson>(this: any, obj: T): Entity<T> {
  let entity = new this();
  for (let key in entity) {
    const alias = getModelMeta(this.prototype, `[alias]${key}`) as string;
    const prefix = getModelMeta(this.prototype, `[prefix]${key}`) as string;
    const required = getModelMeta(
      this.prototype,
      `[required]${key}`
    ) as boolean;
    // 处理别名
    let value: any;
    if (alias) {
      value = obj[alias];
    }
    // 处理前缀
    if (prefix) {
      value = obj[prefix + key];
    }
    // 处理默认值
    if (value === undefined || value === null) {
      value = getModelMeta(this.prototype, `[default]${key}`);
    }

    // 处理必填
    if (required) {
      if (value === undefined || value === null) {
        throw new Error(`[${key}] is required`);
      }
    }
    entity[key] = value;
  }
  return entity;
}

// function loadEntity<T extends IJson>(obj: T): Entity<T>;
// function loadEntity<T extends IJson>(objArray: Array<T>): Array<Entity<T>>;
// function loadEntity<T extends IJson>(
//   objOrArray: T | Array<T>
// ): Entity<T> | Array<Entity<T>> {
//   if (Array.isArray(objOrArray)) {
//     return objOrArray.map(parse);
//   } else {
//     return parse(objOrArray);
//   }
// }

function loadEntity<T extends IJson>(objOrArray: T | Array<T>) {
  if (Array.isArray(objOrArray)) {
    return objOrArray.map(parse);
  } else {
    return parse(objOrArray);
  }
}

export const createEntityForClass = <TClass = object>(target: TClass) => {
  (target as SnailModel<TClass & IJson>).fromJson = loadEntity;
  return target as SnailModel<TClass & IJson>;
};

type TransformOptionsByOneKey<T = IJson> = {
  [key in keyof T]?:
    | {
        alias?: string;
        required?: boolean;
        default?: T[key];
      }
    | {
        prefix?: string;
        required?: boolean;
        default?: T[key];
      };
};

type TransformOptions<T = IJson> =
  | TransformOptionsByOneKey<T>
  | {
      prefix: string;
    };

export const transformDTO = <T extends IJson>(
  data: T,
  transformOptions?: TransformOptions
): T => {
  let obj: IJson = {};
  if (transformOptions === undefined) {
    return Object.assign({}, data);
  } else {
    if (transformOptions.prefix) {
      for (let key in data) {
        // 提取前缀和key
        const objKey = key.replace(transformOptions.prefix as string, "");
        obj[objKey] = data[key];
      }
    } else {
      for (let key in data) {
        const value = data[key];
        // 查找别名
        const alias = Object.keys(transformOptions).find(
          (transformKey) => (transformOptions as TransformOptionsByOneKey<T>)[transformKey]?.alias === key
        );
        if (alias) {
          obj[transformOptions[alias]] = value;
        }
      }
    }
  }
};
