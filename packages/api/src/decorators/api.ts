import "reflect-metadata";
import { ApiConfig } from "../typings";
import { RequestMethod } from "../typings";
export const METHOD_KEY = "SNAIL_METHOD_KEY";

export const API_CONFIG_KEY = "SNAIL_API_CONFIG_KEY";
// API 类装饰器
export const Api = (url = "", config?: ApiConfig): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata(API_CONFIG_KEY, { url, ...config }, target);
  };
};

// HTTP 方法装饰器
// const createMethodDecorator = (method: RequestMethod) => {
//   return (path = "") => {
//     return (target: any, propertyKey: string | symbol) => {
//       console.log(method,'=>',target,'|',propertyKey)
//       Reflect.defineMetadata(METHOD_KEY, { method, path }, target, propertyKey);
//     };
//   };
// };

const createMethodDecorator = (method: RequestMethod) => {
  return (path = "") => {
    return (target: any,propertyKey: string | symbol) => {
      if(target){
        Reflect.defineMetadata(METHOD_KEY, { method, path }, target, propertyKey);
        return
      }
      Reflect.metadata(METHOD_KEY,{ method, path })
      // console.log(method,'=>',propertyKey)
      // 
    };
  };
};

// const createMethodDecorator = (method: RequestMethod) => {
//   return (path = "") => {
//     return <T>(
//       target: T,
//       context: ClassMethodDecoratorContext<T, () => ApiResponse<any>>
//     ) => {
//       Reflect.defineMetadata(METHOD_KEY, { method, path }, target, propertyKey);
//     };
//   };
// };

export const Get = createMethodDecorator(RequestMethod.GET);
export const Post = createMethodDecorator(RequestMethod.POST);
export const Put = createMethodDecorator(RequestMethod.PUT);
export const Delete = createMethodDecorator(RequestMethod.DELETE);
export const Patch = createMethodDecorator(RequestMethod.PATCH);
export const Options = createMethodDecorator(RequestMethod.OPTIONS);
export const Head = createMethodDecorator(RequestMethod.HEAD);
