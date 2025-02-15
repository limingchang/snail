import "reflect-metadata";

// import {CacheManagementOption} from '../typings'

export const CACHE_OPTIONS_KEY = Symbol("SNALI_CACHE_OPTIONS_KEY");

// 缓存设置装饰器
export const Cache = (hitSource: string | null) => {
  return (target: any, propertyKey?: string) => {
    const key = propertyKey
      ? `${CACHE_OPTIONS_KEY.toString()}_${propertyKey}`
      : CACHE_OPTIONS_KEY;
    Reflect.defineMetadata(key, hitSource, target);
  };
};
