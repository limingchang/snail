import "reflect-metadata";

// import {CacheManagementOption} from '../typings'

export const CACHE_OPTIONS_KEY = Symbol("SNALI_CACHE_OPTIONS_KEY");

// 缓存设置装饰器
/**
 * 为请求方法设置失效源，或设置不启用缓存
 * @param hitSource 失效源，字符型|null；
 * - 设置为null时，该请求方法不启用缓存；
 * - 设置为字符时，对应该Api下请求方法名称，当设置的名称方法请求成功时，被装饰的请求方法缓存失效
 * @returns 
 */
export const Cache = (hitSource: string | null) => {
  return (target: any, propertyKey?: string) => {
    const key = propertyKey
      ? `${CACHE_OPTIONS_KEY.toString()}_${propertyKey}`
      : CACHE_OPTIONS_KEY;
    Reflect.defineMetadata(key, hitSource, target);
  };
};
