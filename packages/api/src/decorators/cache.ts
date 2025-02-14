import "reflect-metadata";

import {CacheManagementOption} from '../typings'

export const CACHE_KEY = "SNALI_CACHE_KEY";

// 缓存管理装饰器
export const Cache = (options: CacheManagementOption) => {
  return (target: any, propertyKey?: string) => {
    const key = propertyKey ? `${CACHE_KEY}_${propertyKey}` : CACHE_KEY;
    Reflect.defineMetadata(key, options, target);
  };
};