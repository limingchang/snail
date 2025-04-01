import "reflect-metadata";
import { ApiOptions } from "../typings";


export const API_CONFIG_KEY = Symbol("SNAIL_API_CONFIG_KEY");
// API 类装饰器
export const Api = (url = "", config?: ApiOptions): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata(API_CONFIG_KEY, { url, ...config }, target);
  };
};

