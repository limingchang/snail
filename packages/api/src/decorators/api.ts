import "reflect-metadata";
import { ApiOptions } from "../typings";
import { RequestMethodEnum } from "../typings";
export const METHOD_KEY = Symbol("SNAIL_METHOD_KEY");

export const API_CONFIG_KEY = Symbol("SNAIL_API_CONFIG_KEY");
// API 类装饰器
export const Api = (url = "", config?: ApiOptions): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata(API_CONFIG_KEY, { url, ...config }, target);
  };
};

const createMethodDecorator = (method: RequestMethodEnum) => {
  return (path = "", name?: string) => {
    return (target: any, propertyKey: string | symbol) => {
      const methodOptions = Reflect.getMetadata(
        METHOD_KEY,
        target,
        propertyKey
      );
      if (methodOptions) {
        console.error('only one method decorator for a request function!')
        console.error(`you must chose only one method decorator[@${method} or @${methodOptions.method}]`)
        throw new TypeError(`Multiple decorators are used for the same request function`);
      }
      Reflect.defineMetadata(
        METHOD_KEY,
        { method, path, name },
        target,
        propertyKey
      );
    };
  };
};

/**
 * 定义装饰的方法为Get请求
 * @param path 字符型，请求端点，默认为空
 */
export const Get = createMethodDecorator(RequestMethodEnum.GET);
/**
 * 定义装饰的方法为Post请求
 * @param path 字符型，请求端点，默认为空
 */
export const Post = createMethodDecorator(RequestMethodEnum.POST);
/**
 * 定义装饰的方法为Put请求
 * @param path 字符型，请求端点，默认为空
 */
export const Put = createMethodDecorator(RequestMethodEnum.PUT);
/**
 * 定义装饰的方法为Delete请求
 * @param path 字符型，请求端点，默认为空
 */
export const Delete = createMethodDecorator(RequestMethodEnum.DELETE);
/**
 * 定义装饰的方法为Patch请求
 * @param path 字符型，请求端点，默认为空
 */
export const Patch = createMethodDecorator(RequestMethodEnum.PATCH);
/**
 * 定义装饰的方法为Options请求
 * @param path 字符型，请求端点，默认为空
 */
export const Options = createMethodDecorator(RequestMethodEnum.OPTIONS);
/**
 * 定义装饰的方法为Head请求
 * @param path 字符型，请求端点，默认为空
 */
export const Head = createMethodDecorator(RequestMethodEnum.HEAD);
