import "reflect-metadata";

import { VersioningOption } from "../typings";

export const VERSIONING_KEY = Symbol("SNAIL_VERSIONING_KEY");
export const VERSION_KEY = Symbol("SNAIL_VERSION_KEY");

// 版本管理装饰器
export const Versioning = (options: VersioningOption) => {
  return (target: any) => {
    // 类/全局级版本
    Reflect.defineMetadata(VERSIONING_KEY, options, target);
  };
};

export const Version = (version: string) => {
  return (target: any, propertyKey: string) => {
    // 方法级版本临时控制
    Reflect.defineMetadata(VERSION_KEY, version, target, propertyKey);
  };
};
