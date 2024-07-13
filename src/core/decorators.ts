import { setSymbol } from "./utils";

import { PropertyTarget } from "./types";

/**
 * 装饰器助手
 */
export class SnailDecorators {
  static setModelName(target: any, name: string) {
    return setSymbol(target, "modelName", name);
  }
}

/**
 * 为模型类标注模型名称,并添加方法
 * @param name 模型名称
 * @returns 装饰器工厂
 */
export function Model(name: string): ClassDecorator {
  // console.log('set Model name:',name)
  return function (target: any) {
    // console.log("set Model name:", target);
    SnailDecorators.setModelName(target, name);
  }
}

/**
 * 为字段属性标记默认值
 * @param value 默认值
 * @returns
 */
export function Default(value: string): PropertyDecorator {
  return function (target: PropertyTarget, key: string | symbol) {
    if (typeof value === typeof target[key.toString()]) {
    }
    setSymbol(target, `default[${key.toString()}]`, value);
  };
}

/**
 * 为字段属性标记必须提供
 * @returns
 */
export function Required() {
  return function (target: any, key: string) {
    setSymbol(target, `required[${key.toString()}]`, true);
  };
}

/**
 * 为字段属性标记名称
 * @param name 字段名称
 * @returns
 */
export function Field(name: string) {
  return function (target: Object, key: string) {
    setSymbol(target, `field[${key.toString()}]`, name);
  };
}

/**
 * 为字段属性标记别名
 * @param name 字段别名
 * @returns
 */
export function Alias(name: string): PropertyDecorator {
  return function (target: Object, key: string | symbol) {
    setSymbol(target, `alias[${key.toString()}]`, name);
  };
}
