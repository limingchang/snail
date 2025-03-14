import "reflect-metadata";

// import {CacheManagementOption} from '../typings'

export const NO_CACHE_KEY = Symbol("SNALI_NO_CACHE_KEY");

export const CACHE_EXPIRE_SOURCE_KEY = Symbol("SNALI_CACHE_EXPIRE_SOURCE_KEY");


/**
 * 为请求方法或API设置不启用缓存
 * @returns
 */
export const NoCache = () => {
  return (target: any, propertyKey?: string) => {
    if (propertyKey) {
      Reflect.defineMetadata(NO_CACHE_KEY, true, target, propertyKey);
      return;
    }
    Reflect.defineMetadata(NO_CACHE_KEY, true, target);
  };
};

/**
 * 为请求方法或API设置失效源,当此源请求成功时，清空被装饰的方法缓存
 * 格式serverName.apiName.methodName
 * @param sources 失效源，字符型数组；
 * @returns
 */
export const HitSource = (...sources: string[]) => {
  return (target: any, propertyKey?: string) => {
    if (propertyKey) {
      Reflect.defineMetadata(
        CACHE_EXPIRE_SOURCE_KEY,
        sources,
        target,
        propertyKey
      );
      return;
    }
    Reflect.defineMetadata(CACHE_EXPIRE_SOURCE_KEY, sources, target);
  };
};
