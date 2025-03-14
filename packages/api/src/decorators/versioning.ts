import "reflect-metadata";

import { VersioningOption } from "../typings";

export const VERSIONING_KEY = Symbol("SNAIL_VERSIONING_KEY");
export const VERSION_KEY = Symbol("SNAIL_VERSION_KEY");

// 版本管理装饰器
/**
 * 版本管理装饰器,为请求设置全局版本管理器
 * @param options 版本管理选项
 * @returns
 */
export const Versioning = (options: VersioningOption) => {
  return (target: any) => {
    // 类/全局级版本
    Reflect.defineMetadata(VERSIONING_KEY, options, target);
  };
};

/**
 * 为方法设置版本
 * @param version 字符型，临时设置被装饰的请求版本
 * @returns
 */
export const Version = (version: string) => {
  return (target: any, propertyKey: string) => {
      // 方法级版本临时控制
      Reflect.defineMetadata(VERSION_KEY, version, target, propertyKey);
  };
};
