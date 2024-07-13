import { merge,unique } from 'radash'

import { getSymbol, getSymbolFields } from "./utils";

import { IJson, FromJsonReturnType, SnailModelInstance, SnailModelInstanceArray } from "./types";

/**
 * 模型基类
 */
export class SnailModel {
  /**
   * 模型转换位json数据,根据别名自动转化
   * @returns 返回json数据
   */
  toJson(): IJson {
    const keys = Object.keys(this);
    const json: IJson = {};
    for (const key of keys) {
      const alias = getSymbol(this, `alias[${key}]`);
      if (alias) {
        json[alias] = (this as IJson)[key];
      } else {
        json[key] = (this as IJson)[key];
      }
    }
    return json;
  }

  // fromJson<T extends SnailModel>(json: IJson): SnailModelInstance;
  // fromJson<T extends SnailModel>(json: IJson[]): SnailModelInstanceArray;
  /**
   * 从json数据中加载模型
   * @param json json数据或数组
   * @returns
   */
  static fromJson<T extends SnailModel, R extends IJson | IJson[]>(
    this: new () => T,
    json: R,
  ): FromJsonReturnType<R> {
    if (Array.isArray(json)) {
      // 数组情况
      const instances = json.map((item) => {
        // const instance = new this();
        return SnailModel.parse(new this(), item) as SnailModelInstance;
      }) as SnailModelInstanceArray;
      Reflect.set(instances, "toJson", () => instances.map((item) => item.toJson()));
      return instances as FromJsonReturnType<R>;

    } else {
      // 对象情况
      // const instance = new this();
      const instance = SnailModel.parse(new this(), json) as SnailModelInstance;
      return instance as FromJsonReturnType<R>;
    }
  }

  static parse<T extends SnailModel>(instance: T, json: IJson) {
    // const instance = new this();
    // const fields = Object.keys(instance);
    console.log("instance:", instance);
    const keys = Reflect.ownKeys(instance);
    console.log("key:", keys);
    const prototype = Reflect.getPrototypeOf(instance);
    let symbolFields = []
    if (prototype == null) {
      throw new Error("custom model need extends SnailModel");
      // return instance;
    } else {
      symbolFields = getSymbolFields(prototype);
      // console.log("symbolFields:", symbolFields);
    }
    // }
    const fields = unique(keys.concat(symbolFields));
    // console.log("fields:", fields);
    for (const key of fields) {
      const defaultValue = getSymbol(instance, key.toString());
      const alias = getSymbol(instance, `alias[${key.toString()}]`);
      const fieldData = json[alias || key.toString()];
      if (fieldData == undefined) {
        // console.log("set:", key, defaultValue);
        Reflect.set(instance, key, defaultValue);
      } else {
        // console.log("set:", key, fieldData);
        Reflect.set(instance, key, fieldData);
      }
    }
    return instance;
  }

  static load?<T extends SnailModel>(): T;
}
