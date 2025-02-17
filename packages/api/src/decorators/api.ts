import "reflect-metadata";
import { ApiConfig } from "../typings";
import { RequestMethod } from "../typings";
export const METHOD_KEY = Symbol("SNAIL_METHOD_KEY");

export const API_CONFIG_KEY = Symbol("SNAIL_API_CONFIG_KEY");
// API 类装饰器
export const Api = (url = "", config?: ApiConfig): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata(API_CONFIG_KEY, { url, ...config }, target);
  };
};

const createMethodDecorator = (method: RequestMethod) => {
  return (path = "") => {
    return (target: any,propertyKey: string | symbol) => {
      if(target){
        Reflect.defineMetadata(METHOD_KEY, { method, path }, target, propertyKey);
        return
      }
      Reflect.metadata(METHOD_KEY,{ method, path })
    };
  };
};

/**
 * 定义装饰的方法为Get请求
 * @param path 字符型，请求端点，默认为空
 */
export const Get = createMethodDecorator(RequestMethod.GET);
/**
 * 定义装饰的方法为Post请求
 * @param path 字符型，请求端点，默认为空
 */
export const Post = createMethodDecorator(RequestMethod.POST);
/**
 * 定义装饰的方法为Put请求
 * @param path 字符型，请求端点，默认为空
 */
export const Put = createMethodDecorator(RequestMethod.PUT);
/**
 * 定义装饰的方法为Delete请求
 * @param path 字符型，请求端点，默认为空
 */
export const Delete = createMethodDecorator(RequestMethod.DELETE);
/**
 * 定义装饰的方法为Patch请求
 * @param path 字符型，请求端点，默认为空
 */
export const Patch = createMethodDecorator(RequestMethod.PATCH);
/**
 * 定义装饰的方法为Options请求
 * @param path 字符型，请求端点，默认为空
 */
export const Options = createMethodDecorator(RequestMethod.OPTIONS);
/**
 * 定义装饰的方法为Head请求
 * @param path 字符型，请求端点，默认为空
 */
export const Head = createMethodDecorator(RequestMethod.HEAD);
