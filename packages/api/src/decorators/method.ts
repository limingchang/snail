import "reflect-metadata";
import { Method } from "axios";
import { MethodSendOptions } from "../typings";
export const METHOD_KEY = Symbol("SNAIL_METHOD_KEY");

const createMethodDecorator = (method: Method) => {
  return (path = "", options?: MethodSendOptions) => {
    return (target: any, propertyKey: string | symbol) => {
      const methodOptions = Reflect.getMetadata(
        METHOD_KEY,
        target,
        propertyKey
      );
      if (methodOptions) {
        console.error("only one method decorator for a request function!");
        console.error(
          `you must chose only one method decorator[@${method} or @${methodOptions.method}]`
        );
        throw new TypeError(
          `Multiple decorators are used for the same request function`
        );
      }
      Reflect.defineMetadata(
        METHOD_KEY,
        { method, path, ...options },
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
export const Get = createMethodDecorator("GET");
/**
 * 定义装饰的方法为Post请求
 * @param path 字符型，请求端点，默认为空
 */
export const Post = createMethodDecorator("POST");
/**
 * 定义装饰的方法为Put请求
 * @param path 字符型，请求端点，默认为空
 */
export const Put = createMethodDecorator("PUT");
/**
 * 定义装饰的方法为Delete请求
 * @param path 字符型，请求端点，默认为空
 */
export const Delete = createMethodDecorator("DELETE");
/**
 * 定义装饰的方法为Patch请求
 * @param path 字符型，请求端点，默认为空
 */
export const Patch = createMethodDecorator("PATCH");
/**
 * 定义装饰的方法为Options请求
 * @param path 字符型，请求端点，默认为空
 */
export const Options = createMethodDecorator("OPTIONS");
/**
 * 定义装饰的方法为Head请求
 * @param path 字符型，请求端点，默认为空
 */
export const Head = createMethodDecorator("HEAD");
