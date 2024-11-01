import { getSymbol } from "./utils";

import { IJson } from "./types";



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

  //   fromJson<T  extends SnailModel >(json: IJson): T;
  //   fromJson<T extends SnailModel >(json: IJson[]): T[];
  /**
   * 从json数据中加载模型
   * @param json json数据或数组
   * @returns
   */
  static fromJson<T extends SnailModel>(
    this: new () => T,
    json: IJson | IJson[]
  ) {
    if (Array.isArray(json)) {
      // 数组情况
      return json.map((item) => {
        // const instance = new this();
        return SnailModel.parse(new this(), item);
      });
    } else {
      // 对象情况
      // const instance = new this();
      return SnailModel.parse(new this(), json);
    }
  }

  static parse<T extends SnailModel>(instance: T, json: IJson) {
    // const instance = new this();
    // const fields = Object.keys(instance);
    const fields = Reflect.ownKeys(instance);
    console.log("fields:", fields);
    const proto_keys = Reflect.ownKeys(Reflect.getPrototypeOf(instance));
    console.log("proto_keys:", proto_keys);
    for (const key of fields) {
      const defaultValue = getSymbol(instance, key.toString());
      const alias = getSymbol(instance, `alias[${key.toString()}]`);
      const fieldData = json[alias || key.toString()];
      if (fieldData == undefined) {
        Reflect.set(instance, key, defaultValue);
      } else {
        Reflect.set(instance, key, fieldData);
      }
    }
    return instance;
  }

  static load?<T extends SnailModel>(): T;
}
